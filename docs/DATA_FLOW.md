# SkinSentry Data Flow and Privacy Architecture

**Document Version:** 1.0.0  
**Effective Date:** October 14, 2026  
**Operator:** SkinSentry (Team Green Lights)  
**Contact:** privacy@skinsentry.local  

---

## 1. Overview of Data Classification

SkinSentry processes clinical images, dermatological context, user account credentials, and operational logs. This document defines every category of data, where it is stored, which internal and external services process it, and the security controls applied at each stage.

---

## 2. Data Categories and Destinations

### 2.1 User Accounts and Authentication
- **Data fields:** Full name, email address, hashed password, phone number, language preference, account role (`patient`, `doctor`, `admin`).
- **Destination:** MongoDB collection `users` ([api/src/models/User.js](file:///d:/projects/skin_cancer_detetion%28drist_hackathon%29/api/src/models/User.js)).
- **Security controls:**
  - Passwords hashed using `bcrypt` with work factor 12 ([api/src/services/password.js](file:///d:/projects/skin_cancer_detetion%28drist_hackathon%29/api/src/services/password.js)).
  - Access tokens stored strictly in browser memory (never in `localStorage`).
  - Refresh tokens stored in HTTP-only, `SameSite=Lax` cookies; token hashes stored in database with automatic rotation and family revocation on reuse detection ([api/src/services/tokens.js](file:///d:/projects/skin_cancer_detetion%28drist_hackathon%29/api/src/services/tokens.js)).
  - Account lockout after 5 consecutive failed login attempts for 15 minutes.

### 2.2 Clinical Profiles
- **Patient profile:** Date of birth, biological sex, Fitzpatrick skin type (I to VI), sun exposure level, family history of skin cancer, diabetic status ([api/src/models/Patient.js](file:///d:/projects/skin_cancer_detetion%28drist_hackathon%29/api/src/models/Patient.js)).
- **Doctor profile:** Medical specialty, state medical council registration number, professional biography, verification status ([api/src/models/Doctor.js](file:///d:/projects/skin_cancer_detetion%28drist_hackathon%29/api/src/models/Doctor.js)).
- **Destination:** MongoDB collections `patients` and `doctors`.

### 2.3 Clinical Images and Artifacts
- **Data fields:** Uploaded skin lesion, wound, or rash photos; lesion label, body site, timestamp, physical scale calibration (pixels per centimetre).
- **Processing and Storage:**
  - Magic bytes verified via `file-type` to prevent extension spoofing ([api/src/services/storage.js](file:///d:/projects/skin_cancer_detetion%28drist_hackathon%29/api/src/services/storage.js)).
  - Images re-encoded via `sharp`, permanently stripping all EXIF metadata, GPS coordinates, and camera serial numbers ([api/src/services/storage.js](file:///d:/projects/skin_cancer_detetion%28drist_hackathon%29/api/src/services/storage.js)).
  - Files saved to segregated local filesystem path: `storage/patients/<patientId>/<caseId>/<sha256>.jpg`. Never exposed through a public static directory.
  - Case metadata stored in MongoDB collection `cases` ([api/src/models/Case.js](file:///d:/projects/skin_cancer_detetion%28drist_hackathon%29/api/src/models/Case.js)).
  - Binary segmentation masks, heatmap overlays, and agreement visual grids saved as disk files; only filenames stored in MongoDB `analyses` ([api/src/models/Analysis.js](file:///d:/projects/skin_cancer_detetion%28drist_hackathon%29/api/src/models/Analysis.js)), never base64 blobs.

### 2.4 AI Screening Pipeline
- **AI Service (`ai-service`):**
  - Runs on a private network interface (`http://localhost:8000`).
  - Accepts authenticated multipart requests secured with `X-API-Key` ([ai-service/app/main.py](file:///d:/projects/skin_cancer_detetion%28drist_hackathon%29/ai-service/app/main.py)).
  - Processes image through Nurse Gate (quality, sharpness, lighting, skin validity), Junior Models (cancer likelihood, lesion segmentation, ABCDE metrics), and Senior Models (cancer triage, ulcer tissue segmentation, skin disease classification).
  - Outputs structured numerical measurements and risk category.
- **External LLM Service (Groq):**
  - **Zero Image / Zero Identity Guarantee:** Raw patient images, patient names, emails, user IDs, and IP addresses are NEVER sent to Groq.
  - Transmitted payload is strictly limited to structured, de-identified measured features: numerical ABCDE scores, tissue area in square centimetres, condition labels, risk band, and language code ([ai-service/app/llm/report.py](file:///d:/projects/skin_cancer_detetion%28drist_hackathon%29/ai-service/app/llm/report.py)).
  - Facts payload is validated against `FORBIDDEN_KEYS` prior to transmission.
  - LLM generates plain-language explanations in English, Tamil, or Hindi strictly bounded by the measured numbers ([ai-service/app/llm/validator.py](file:///d:/projects/skin_cancer_detetion%28drist_hackathon%29/ai-service/app/llm/validator.py)).

### 2.5 Payments and Teleconsultations
- **Payment Gateway (Razorpay):**
  - Consultation payments are initiated via Razorpay API.
  - SkinSentry stores only `orderId`, `paymentId`, `amount`, and payment status in MongoDB collection `orders`.
  - Credit card numbers, debit card numbers, UPI PINs, and net banking credentials never transit or touch SkinSentry servers.
- **WebRTC STUN / TURN Infrastructure:**
  - Direct peer-to-peer audio/video streaming between patient and doctor.
  - STUN servers (`stun:stun.l.google.com:19302`) negotiate peer connectivity and temporarily process network IP addresses solely for NAT traversal during an active call.
- **Transactional Notifications (SMTP):**
  - System emails (registration confirmations, appointment updates) are delivered via configured SMTP server using TLS.
  - Passwords and raw images are never included in email contents.

### 2.6 Audit Logging
- **Data fields:** Timestamp, actor ID, action name, target entity type, entity ID, client IP address, metadata (excluding sensitive tokens, passwords, and raw image bytes).
- **Destination:** MongoDB collection `auditlogs` ([api/src/models/AuditLog.js](file:///d:/projects/skin_cancer_detetion%28drist_hackathon%29/api/src/models/AuditLog.js)).
- **Retention:** Kept for 1825 days (5 years) for clinical audit compliance.

---

## 3. Legal and Consent Capture

### 3.1 Consent Fields
- `termsVersionAccepted`: Semantic version string of the Terms and Conditions accepted at registration.
- `termsAcceptedAt`: ISO timestamp of terms acceptance.
- `healthDataConsentAt`: ISO timestamp of explicit consent for health data and image analysis.
- Storage: Saved on each `User` record ([api/src/models/User.js](file:///d:/projects/skin_cancer_detetion%28drist_hackathon%29/api/src/models/User.js)).

### 3.2 Doctor-Patient Clinical Access
- A doctor cannot access a patient's case, photos, or screening results without an active, explicit consent granted by the patient ([api/src/models/Consent.js](file:///d:/projects/skin_cancer_detetion%28drist_hackathon%29/api/src/models/Consent.js)).
- Consent is scoped to a specific case, expires automatically after the consultation window, and can be revoked by the patient at any time.

---

## 4. Planned Feature Implementation Checklist

The following privacy and data rights features are mapped to specific implementation steps:

- [x] EXIF and GPS stripping on upload (Step 17: `api/src/services/storage.js`)
- [x] In-memory access token storage and HTTP-only refresh cookies (Step 18: `web/src/lib/api.ts`)
- [x] Strict de-identification before external LLM calls (Step 16: `ai-service/app/llm/report.py`)
- [x] Consent capture on registration (Step 19: `web/src/app/register/page.tsx`)
- [ ] Patient consent management and revocation UI (Step 22: Consultations & Consent)
- [ ] Complete GDPR/DPDP data export in JSON format (Step 26: Account settings & data export)
- [ ] Permanent account and case deletion pipeline with grace period (Step 26: Data erasure)
- [ ] End-to-end privacy audit verification (Step 28: Security and compliance audit)

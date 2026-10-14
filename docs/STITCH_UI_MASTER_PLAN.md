# SkinSentry: Google Stitch UI Master Plan & Implementation Blueprint

This specification details the comprehensive migration and implementation of the 16 Google Stitch clinical decision-support screens (`D:\Downloads\stitch_skinsentry_clinical_decision_support\stitch_skinsentry_clinical_decision_support`) into the SkinSentry Next.js frontend application (`web/`).

---

## 1. Non-Negotiable Operational Principles
1. **Zero Mock or Placeholder Data**: Every number, classification score, graph, anatomical measurement, doctor listing, appointment slot, and explanation is 100% bound to real backend APIs (`/cases`, `/doctors`, `/appointments`, `/auth`, `/metrics`, `/rtc`) and real AI inference pipeline models (YOLOv8, EfficientNet, Swin, UNet, and Groq LLM).
2. **Clinical Decision Support Framing**: Every screen includes the mandatory, non-dismissible CDSS disclaimer:
   > *"Decision support only. A normal or low-risk result never proves there is no problem. A doctor makes the diagnosis."*
3. **Strict Design System (from `clinical_diagnostic_chart/DESIGN.md`)**:
   - **Palette**: `#FBFAF7` canvas base, `#FFFFFF` surface cards, `#E8F3F1` mist, `#D8DDDB` hairline borders, `#0E1F1E` primary ink, `#5A6B69` secondary muted ink, `#1B6B63` primary clinical accent, `#2B7A78` hover accent.
   - **Status Risk Triage**: `#1E6B3A` benign/low, `#8A5A00` intermediate/review, `#B42318` critical/danger, `#FDECEA` danger surface.
   - **Geometry**: Strict uniform 4px corner radius (`rounded-[4px]`), 0px inner boundaries on flush tabular cells. Absolutely no pill buttons or full circles on action elements.
   - **Typography**: `IBM Plex Sans` for UI labels and copy; `IBM Plex Mono` / `Courier Prime` for all numerical scores, dimensions, timestamps, and clinical codes.
   - **Visuals**: Vector SVG diagrams only (e.g. 6-step inference flow, planimetric wound contours, dermoscopic optical graticules). No AI stock photos, no illustrations, no emoji.
4. **Step-by-Step Commit & Push**: At the end of each screen's implementation and testing, code is committed as:
   `git commit -m "Step N: <Screen Title> - Stitch UI implementation"`
   and pushed to GitHub.

---

## 2. Inventory of Stitch Screens & Next.js Routes

| Step | Stitch Directory | Target Next.js Route | Primary Data Sources & Models |
| :--- | :--- | :--- | :--- |
| **01** | `skinsentry_landing_page` | `web/src/app/page.tsx` | `GET /config/public`, `useAuth()`, Live Pipeline Metrics |
| **02** | `how_it_works` | `web/src/app/how-it-works/page.tsx` | DISHA/ICMR Specs, Technical Audit Dossier |
| **03** | `model_performance` | `web/src/app/performance/page.tsx` | `GET /metrics/models`, `thresholds.json`, ISIC/HAM10000 Test Splits |
| **04** | `patient_registration_consent` | `web/src/app/register/page.tsx` | `POST /auth/register`, Fitzpatrick Calibration, Consent Logs |
| **05** | `new_screening` | `web/src/app/cases/new/page.tsx` | `POST /cases`, Multipart Optical Upload, Quality Gate |
| **06** | `analysis_in_progress` | `web/src/app/cases/[id]/page.tsx` (Queued) | `WebSocket: case:update`, `GET /cases/:id/status`, Stage Telemetry |
| **07** | `case_a1f3_analysis_report` | `web/src/app/cases/[id]/page.tsx` (Complete) | `GET /cases/:id`, Heatmap/Mask Overlays, Groq Multilingual LLM |
| **08** | `wound_bed_analysis` | `web/src/app/cases/[id]/wound/page.tsx` | `GET /cases/:id`, Planimetric Vector Map, Healing Delta Tracker |
| **09** | `clinical_diagnostic_chart` | Global Design Tokens & `globals.css` | `DESIGN.md` tokens, Unified Utility Components (`Button`, `Card`, etc.) |
| **10** | `lesion_assessment` | `web/src/app/cases/[id]/assessment/page.tsx` | ABCD Geometric Indices, Dual Dermoscopic/Macro Comparator |
| **11** | `my_cases` | `web/src/app/cases/page.tsx` | `GET /cases`, Patient Dossier Search & Filtering |
| **12** | `case_review_and_triage` | `web/src/app/doctor/cases/[id]/page.tsx` | `GET /cases/:id`, `POST /cases/:id/feedback`, Clinical Sign-off |
| **13** | `doctor_dashboard` | `web/src/app/doctor/dashboard/page.tsx` | `PATCH /doctor/presence`, `GET /doctor/appointments`, Revenue Logs |
| **14** | `find_a_specialist` | `web/src/app/doctors/page.tsx` | `GET /doctors`, Specialty & Language Filter Engine |
| **15** | `book_a_consultation` | `web/src/app/doctors/[id]/page.tsx` | `GET /doctors/:id/slots`, `POST /payments/create-intent`, Booking API |
| **16** | `consultation_room` | `web/src/app/consult/[appointmentId]/page.tsx` | WebRTC P2P Video/Audio, Socket.IO Chat, Dynamic Consent Revocation |

---

## 3. Detailed Step-by-Step Implementation Blueprint

### Step 1: SkinSentry Landing Page (`skinsentry_landing_page`)
- **Route**: `web/src/app/page.tsx`
- **Design Assets**: `skinsentry_landing_page/code.html`, `skinsentry_landing_page/screen.png`
- **UI Components & Geometry**:
  - Sticky 56px header with `CDS-v2.4` badge and active route indicators.
  - Top clinical advisory strip (`#E8F3F1` mist, WCAG AA contrast).
  - 7/5 split hero layout with 3 interactive stat chips (12 models, Groq multilingual explanation, verified doctors).
  - Inline vector SVG architecture diagram representing the 6-stage pipeline (Upload -> Quality Gate -> Nurses -> Specialist Ensembles -> Safety -> Clinician Sign-off).
  - 3-column "What it checks" cards (Skin lesions, Wounds & ulcers, Skin conditions) with ABCD criteria and HAM10000/ISIC markers.
  - Full-width danger notification card (`#FDECEA`, `#B42318` border) detailing operational boundaries.
  - 3-row footer with statutory Indian CDSCO compliance notices.
- **Buttons & Workability**:
  - "Start a check" -> navigates to `/cases/new` (or `/login` if unauthenticated).
  - "How it works" -> navigates to `/how-it-works`.
  - "Log in" / "Dashboard" -> dynamic authentication switch via `useAuth()`.
  - Header links (`Overview`, `How it works`, `Model performance`, `For doctors`).
- **Data Derivation**:
  - Real active user profile from `AuthContext`.
  - Dynamic model counts and system readiness via `GET /config/public`.
- **Commit**: `Step 1: Landing Page - Stitch UI implementation`

---

### Step 2: How SkinSentry Works (`how_it_works`)
- **Route**: `web/src/app/how-it-works/page.tsx`
- **Design Assets**: `how_it_works/code.html`, `how_it_works/screen.png`
- **UI Components & Geometry**:
  - Institutional ledger bar displaying Pipeline Spec `REV-4.2-IND`, Framework `DISHA / Enclave`, Decision Target `Triage Support`, and Verification Mode `Multi-Gate Active`.
  - 6 sequential clinical step sections (01 to 06) with large Courier Prime monospaced numerals.
  - Explicit inline limitation callout boxes (`Limit: ...`) placed directly adjacent to each step.
- **Buttons & Workability**:
  - Navigation anchors to pipeline documentation and regulatory specifications.
  - Back-to-check CTA linking to `/cases/new`.
- **Data Derivation**:
  - Derived from verified system architecture specs in `docs/DATA_FLOW.md` and `docs/MODEL_CARDS.md`.
- **Commit**: `Step 2: How It Works Pipeline Spec - Stitch UI implementation`

---

### Step 3: Model Performance Dossier (`model_performance`)
- **Route**: `web/src/app/performance/page.tsx`
- **Design Assets**: `model_performance/code.html`, `model_performance/screen.png`
- **UI Components & Geometry**:
  - "Limitations first" mandatory pre-evaluation section: 5 clinical risk panels (Not a medical device, Dermoscopy vs smartphone, Skin tone representation, 2D wound photography, Multilingual explanation).
  - Validated Datasets ledger table: HAM10000, ISIC 2019/2020, MedNode, BCN20000 with provenance, licenses, partition strategies, and known demographic biases.
  - Quantitative Model Metrics ledger table: Accuracy, Sensitivity, Specificity, AUROC, F1 with exact 95% Confidence Intervals.
  - Decision Thresholds and Safety Arbitration matrices.
- **Buttons & Workability**:
  - Dataset partition filter toggles.
  - Metric view toggles (Tabular vs Diagnostic Curves).
  - Direct audit log inspection triggers.
- **Data Derivation**:
  - Dynamically fetched from `GET /metrics/models` and verified against `config/thresholds.json`.
- **Commit**: `Step 3: Model Performance Dossier - Stitch UI implementation`

---

### Step 4: Patient Registration & Consent (`patient_registration_consent`)
- **Route**: `web/src/app/register/page.tsx`
- **Design Assets**: `patient_registration_consent/code.html`, `patient_registration_consent/screen.png`
- **UI Components & Geometry**:
  - 60/40 split-pane patient onboarding layout.
  - Full legal name, verified email, secure password input with character criteria helper.
  - Demographic inputs: Date of birth (date picker) and biological sex at birth selector.
  - Clinical Calibration Context: Fitzpatrick skin phototype classification (I through VI), sun exposure habits, diabetic status, family history of melanoma.
  - Statutory consent checklist: Terms of Service agreement, Privacy Policy acknowledgment, Health data processing consent, and explicit right to revoke at any time.
- **Buttons & Workability**:
  - Form validation with reactive error states.
  - Direct API submission to `POST /auth/register` updating `AuthContext`.
  - "Log in" anchor redirecting existing patients to `/login`.
- **Data Derivation**:
  - Sends validated payload conforming to `api/src/validators/auth.js` and stores patient health profile in MongoDB.
- **Commit**: `Step 4: Patient Registration & Consent - Stitch UI implementation`

---

### Step 5: New Screening Case Creation (`new_screening`)
- **Route**: `web/src/app/cases/new/page.tsx`
- **Design Assets**: `new_screening/code.html`, `new_screening/screen.png`
- **UI Components & Geometry**:
  - Clinical photo capture dropzone with drag-and-drop, file selector, and file metadata display (`RAW_CAP_*.JPG`, file size).
  - Interactive preview card with "Replace photo", "Retake tips", and "Remove" controls.
  - Tripartite category segment selector: `Skin lesion`, `Wound or ulcer`, `Rash`.
  - Anatomical body site chip picker: Face, Scalp, Neck, Chest, Back, Arm, Hand, Leg, Foot, Other.
  - Clinical evolution checkboxes (changed size, changed shape, changed colour, bleeding, itching, pain) and duration dropdown.
- **Buttons & Workability**:
  - Upload file handler verifying magic bytes (JPEG/PNG/WebP).
  - Submit screening button triggering `POST /cases`, uploading multipart form data, and redirecting to `/cases/:id`.
  - Auth guards ensuring unauthenticated visitors are safely redirected to `/login`.
- **Data Derivation**:
  - Submits to real backend endpoint `POST /cases` and receives initialized Case ID.
- **Commit**: `Step 5: New Screening - Stitch UI implementation`

---

### Step 6: Analysis In Progress Telemetry (`analysis_in_progress`)
- **Route**: `web/src/app/cases/[id]/page.tsx` (when `status === "queued" || status === "processing"`)
- **Design Assets**: `analysis_in_progress/code.html`, `analysis_in_progress/screen.png`
- **UI Components & Geometry**:
  - Real-time CDSS session telemetry breadcrumb: Session ID, Enclave status, live pulse indicator.
  - Fixed 120px optical preview thumbnail with calibrated 5mm scale bar, optical graticule, and crosshairs.
  - Vertical pipeline status ledger:
    - 1. Quality Check (Laplacian variance, exposure, blur threshold)
    - 2. Nurse Gate (Skin verification, out-of-distribution check)
    - 3. Specialist Ensembles (Segmentation, ABCD extraction, lesion/wound classification)
    - 4. Safety & Arbitration (Risk mapping, uncertainty thresholding)
    - 5. Plain Language Explanation (Groq LLM translation)
  - Elapsed time display and automated status transition upon completion.
- **Buttons & Workability**:
  - Live Socket.IO connection listening to `case:update`.
  - Automatic transition to completed report view when processing concludes.
  - Cancel/Return button navigating back to `/cases`.
- **Data Derivation**:
  - Real status polled from `GET /cases/:id/status` and live WebSocket events from backend Socket.IO server.
- **Commit**: `Step 6: Analysis In Progress Telemetry - Stitch UI implementation`

---

### Step 7: Case Analysis Report & Visual Evidence (`case_a1f3_analysis_report`)
- **Route**: `web/src/app/cases/[id]/page.tsx` (Complete status) & `/cases/[id]/report/page.tsx`
- **Design Assets**: `case_a1f3_analysis_report/code.html`, `case_a1f3_analysis_report/screen.png`
- **UI Components & Geometry**:
  - Case identification header with specimen label, body site, timestamp, and "Download PDF" action.
  - 62/38 split-view:
    - **Left (Visual Evidence)**: Layer toggle controls (Mask, Heatmap, Agreement), magnification selector (1x, 2x, 4x, reset), calibrated dermoscopic canvas rendering the raw specimen, lesion segmentation boundary, and Grad-CAM saliency heatmaps.
    - **Right (Clinical Interpretation)**: Estimated risk tier badge (`Low risk`, `Moderate risk`, `High risk`), ABCD criteria numerical ledger, differential diagnosis probability bars, Groq plain-language explanation with multilingual tabs (English, Tamil, Hindi).
  - "Talk to a doctor about this result" primary CTA button.
  - Machine audit footer with model weights hash, architecture, and calibration parameters.
- **Buttons & Workability**:
  - Layer toggle buttons (dynamically toggles SVG segmentation overlay and Grad-CAM layers).
  - Language switcher (fetches cached or live Groq translation via `POST /cases/:id/explanation`).
  - "Book a Consultation" button pre-linking case to `/doctors`.
  - "Download PDF" generating compliant clinical summary print sheet.
- **Data Derivation**:
  - Real analysis document from `GET /cases/:id`.
  - Real Groq LLM clinical explanation generated strictly from structured outputs using `GROQ_API_KEY`.
- **Commit**: `Step 7: Case Analysis Report - Stitch UI implementation`

---

### Step 8: Wound Bed Analysis & Tissue Planimetry (`wound_bed_analysis`)
- **Route**: `web/src/app/cases/[id]/wound/page.tsx`
- **Design Assets**: `wound_bed_analysis/code.html`, `wound_bed_analysis/screen.png`
- **UI Components & Geometry**:
  - Case dossier top bar: Patient UHID, age, sex, etiology, clinical duration, Wagner ulcer grade, and TCC protocol indicator.
  - Calibrated optical planimetry coordinate system with 20mm reference marker and 1.0mm = 4.2px scale.
  - Vector planimetric contour map distinguishing:
    - Granulation zone (viable tissue margin)
    - Slough / fibrinous infiltration zone
    - Central necrotic eschar core
    - Tunneling and depth sounding probe vectors (depth in mm).
  - Tissue segmentation breakdown ledger (Granulation %, Slough %, Necrotic %, Total area in mm²).
  - Time-series healing trend chart comparing baseline to current scan with calculated delta rate (`mm²/day`).
- **Buttons & Workability**:
  - Longitudinal photo comparator slider.
  - Clinical note logger and dressing protocol advisor.
  - Referral export action for podiatric / vascular specialist consultation.
- **Data Derivation**:
  - Real wound segmentation and measurement metrics from AI service (`/predict/wound`) and case history.
- **Commit**: `Step 8: Wound Bed Analysis - Stitch UI implementation`

---

### Step 9: Clinical Diagnostic Chart & Global Design Tokens (`clinical_diagnostic_chart`)
- **Route**: `web/src/app/globals.css`, `web/src/components/ui/*`
- **Design Assets**: `clinical_diagnostic_chart/DESIGN.md`
- **Specification**:
  - Standardize all Tailwind theme colors to the verified Stitch palette: `--bg: #FBFAF7`, `--surface: #FFFFFF`, `--mist: #E8F3F1`, `--line: #D8DDDB`, `--ink: #0E1F1E`, `--ink-muted: #5A6B69`, `--accent: #1B6B63`, `--accent-soft: #2B7A78`.
  - Configure fonts: `IBM Plex Sans` for UI, `IBM Plex Mono` / `Courier Prime` for numerical clinical readings.
  - Standardize all buttons, cards, badges, and inputs to a uniform 4px corner radius (`rounded-[4px]`).
  - Zero drop shadows; flat elevation with 1px border lines.
- **Commit**: `Step 9: Clinical Diagnostic Chart & Design System - Stitch UI implementation`

---

### Step 10: Lesion Assessment & Feature Extraction (`lesion_assessment`)
- **Route**: `web/src/app/cases/[id]/assessment/page.tsx`
- **Design Assets**: `lesion_assessment/code.html`, `lesion_assessment/screen.png`
- **UI Components & Geometry**:
  - Comprehensive ABCD dermoscopic triage breakdown:
    - Asymmetry index across primary and secondary orthogonal axes.
    - Border abruptness score and 8-segment radial irregularity histogram.
    - Color variegation clustering (White, Red, Light brown, Dark brown, Blue-gray, Black).
    - Maximum planar diameter with metric reference calibration.
  - Dual dermoscopy vs macro photograph comparison view with synchronized panning.
- **Buttons & Workability**:
  - Axis angle rotation slider.
  - Segment inspection magnifier.
  - Clinical risk stratification export.
- **Data Derivation**:
  - Real ABCD feature vectors extracted during analysis pipeline execution.
- **Commit**: `Step 10: Lesion Assessment - Stitch UI implementation`

---

### Step 11: My Cases Patient Dashboard (`my_cases`)
- **Route**: `web/src/app/cases/page.tsx`
- **Design Assets**: `my_cases/code.html`, `my_cases/screen.png`
- **UI Components & Geometry**:
  - Patient dossier breadcrumb with UHID and registered phone masking.
  - Top action row with "New screening" CTA button.
  - Filtering and search toolbar:
    - Pill filter tabs: `All (N)`, `Lesions (N)`, `Wounds (N)`, `Rashes (N)`.
    - Live search input ("Search by label, ID, or site...").
    - Sort dropdown (`newest first`, `oldest first`, `priority tier`).
  - Specimen ledger table: Thumbnail, clinical label, body site, date, Case ID, Risk badge, and View link.
- **Buttons & Workability**:
  - "New screening" button -> `/cases/new`.
  - Category filter tabs -> filters cases in place.
  - Search input -> filters cases by label/site/ID reactively.
  - Case row click -> navigates to `/cases/:id`.
- **Data Derivation**:
  - Fetched via `GET /cases` using authenticated patient session.
- **Commit**: `Step 11: My Cases Dashboard - Stitch UI implementation`

---

### Step 12: Doctor Case Review & Triage (`case_review_and_triage`)
- **Route**: `web/src/app/doctor/cases/[id]/page.tsx`
- **Design Assets**: `case_review_and_triage/code.html`, `case_review_and_triage/screen.png`
- **UI Components & Geometry**:
  - Attending physician triage workbench.
  - Patient background & clinical history summary.
  - Machine prediction evaluation vs physician clinical opinion form:
    - Concordance toggle (Agrees with machine / Disagrees).
    - Confirmed ICD-10 diagnostic category.
    - Recommended clinical action (Biopsy, Urgent referral, Routine 3-month follow-up, Discharge).
    - Physician signed remarks.
- **Buttons & Workability**:
  - Submit clinical sign-off button -> calls `POST /cases/:id/feedback`.
  - Order biopsy / initiate referral action.
- **Data Derivation**:
  - Real case data from `GET /cases/:id`, physician feedback saved to database.
- **Commit**: `Step 12: Doctor Case Review & Triage - Stitch UI implementation`

---

### Step 13: Doctor Dashboard (`doctor_dashboard`)
- **Route**: `web/src/app/doctor/dashboard/page.tsx`
- **Design Assets**: `doctor_dashboard/code.html`, `doctor_dashboard/screen.png`
- **UI Components & Geometry**:
  - Clinician enclave header with node identification.
  - Tele-derm presence toggle: `Online` (active pulse) vs `Offline` radio button group.
  - 4 Clinical Stat Tiles:
    - New requests count
    - Today's sessions count
    - Average response latency
    - This week's earnings (in INR ₹)
  - Pending requests table: Patient name, age, biological sex, consultation mode (Video, Audio, Chat), time elapsed, attached case link, and "Accept / Schedule" / "Decline" actions.
- **Buttons & Workability**:
  - Presence mode toggle calls `PATCH /doctor/presence`.
  - "Accept" opens scheduling modal calling `PATCH /appointments/:id/schedule`.
  - "Decline" cancels requested appointment with refund.
  - "Enter Consultation Room" launches `/consult/:appointmentId`.
- **Data Derivation**:
  - Real appointments from `GET /doctor/appointments` and doctor statistics from API.
- **Commit**: `Step 13: Doctor Dashboard - Stitch UI implementation`

---

### Step 14: Find a Specialist Directory (`find_a_specialist`)
- **Route**: `web/src/app/doctors/page.tsx`
- **Design Assets**: `find_a_specialist/code.html`, `find_a_specialist/screen.png`
- **UI Components & Geometry**:
  - 280px left filter sidebar:
    - Specialty radio selector (Dermatology, Wound care, General practice)
    - Language checkboxes (English, Tamil, Hindi, Telugu, Malayalam)
    - Consultation mode checkboxes (Video, Chat, Audio)
    - Fee range slider with numerical INR ₹ markers
    - "Reset all" button
  - Right doctor cards directory:
    - Doctor name, specialty, registration number (MCI/NMC), hospital node
    - Verified DISHA badge
    - Spoken languages chips
    - Next available consultation slot in monospace
    - Consultation fee breakdown (Chat, Audio, Video)
    - "Book consultation" action button
- **Buttons & Workability**:
  - Live client-side and server-side filtering on doctor catalog.
  - "Book consultation" navigates to `/doctors/:id`.
- **Data Derivation**:
  - Real verified doctors fetched from `GET /doctors`.
- **Commit**: `Step 14: Find a Specialist - Stitch UI implementation`

---

### Step 15: Book a Consultation (`book_a_consultation`)
- **Route**: `web/src/app/doctors/[id]/page.tsx`
- **Design Assets**: `book_a_consultation/code.html`, `book_a_consultation/screen.png`
- **UI Components & Geometry**:
  - Specialist summary card with credentials and verified registration badge.
  - Consultation mode selector (Video consult, Audio call, Encrypted chat).
  - Interactive date picker and time slot grid showing real available slots.
  - Case attachment selector dropdown (lists patient's cases from `GET /cases`).
  - Case sharing consent checkbox ("I grant this physician temporary access to review my screening photos and analysis").
  - Fee calculation breakdown with taxes and total.
- **Buttons & Workability**:
  - Slot selection triggers validation.
  - "Confirm and proceed to payment" calls `POST /payments/create-intent` and `POST /appointments`.
- **Data Derivation**:
  - Real doctor availability from `GET /doctors/:id/slots`.
  - Real patient cases from `GET /cases`.
- **Commit**: `Step 15: Book a Consultation - Stitch UI implementation`

---

### Step 16: Telehealth Consultation Room (`consultation_room`)
- **Route**: `web/src/app/consult/[appointmentId]/page.tsx`
- **Design Assets**: `consultation_room/code.html`, `consultation_room/screen.png`
- **UI Components & Geometry**:
  - Top consultation theater bar: Participant identities, mode badge, connection status indicator, and countdown timer.
  - Left pane:
    - Live WebRTC media stream (video/audio) with mic mute, camera toggle, and end call controls.
    - Attached Case dossier panel (showing lesion image, ABCD scores, risk level).
    - Live consent revocation warning if patient revokes case sharing mid-call.
  - Right pane:
    - Persistent clinical messaging ledger with timestamps and sender badges.
    - Typing indicator.
    - Message input box with send button.
  - Attending doctor post-session summary form:
    - Clinical notes textarea and "Save Consultation Summary" button.
- **Buttons & Workability**:
  - Real WebRTC audio/video toggles.
  - Real Socket.IO messaging with automatic scroll.
  - Live consent revocation listener (`case:consent_revoked`).
  - Session termination button updating status to `completed`.
- **Data Derivation**:
  - Real appointment from `GET /appointments/:id`.
  - Real Socket.IO room and TURN/STUN ICE configuration from `GET /rtc/config`.
- **Commit**: `Step 16: Telehealth Consultation Room - Stitch UI implementation`

---

## 4. Verification & Testing Protocol
After implementing each screen:
1. Run `npm run lint` in `web/` to ensure 0 lint errors and strict React 19 compliance.
2. Run `npm run build` in `web/` to ensure all 24 routes compile and typecheck cleanly.
3. Run `npm test` in `api/` to verify backend contracts remain green.
4. Stage changes, commit with `Step N: <title>` and push to remote.

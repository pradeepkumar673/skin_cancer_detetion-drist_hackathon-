# SkinSentry: Complete Step-by-Step Implementation Plan

**Team:** Green Lights | **Team ID:** HCINTL018 | **Team Leader:** S. Pradeep Kumar
**Goal:** a fully working, real-data, no-placeholder build of SkinSentry: 12 AI models in 3 teams (Ulcer, Skin Disease, Cancer), explainable results, Groq explanations, MongoDB, and a doctor dashboard with real-time chat, audio/video calls, Razorpay payments and Nodemailer emails.

> **How to use this file.** Work top to bottom. Every step has: the IDE and model to use, an objective, files, exact commands, a **prompt to paste into the AI assistant**, real-time verification, the expected result, and a Git commit/push. Do not start a step until the previous step's verification passes.

---

## 0. Read this first (honest ground rules)

1. **Not a medical device.** SkinSentry is decision support. The UI must always say so. Real clinical use needs validation and regulatory approval.
2. **Dataset licences.** HAM10000 is for non-commercial use and must be cited. Check the licence of every dataset and model you download and record it in `docs/DATASETS.md`.
3. **Links were checked when this file was written** (HAM10000 on Kaggle, DermNet on Kaggle, FUSeg on GitHub, MedSAM on Hugging Face). Websites move. If a link fails, search the exact dataset title and tell your AI assistant to update `docs/DATASETS.md`.
4. **What "no hardcoding" means here.** No fake data, no dummy responses, no placeholder keys. Thresholds are *computed from data* by scripts and saved to config files; clinical rule values live in a documented config file (`ai-service/config/clinical_rules.yaml`) and are loaded at runtime. Secrets live only in `.env` files.
5. **Test accounts are real registrations** made through the app UI (your own email addresses), not seeded fake records.
6. **Report your own results.** Every accuracy number in the final deck must come from `models/metrics/*.json` produced by your held-out test splits.
7. **Training happens on a GPU.** Use Google Colab (free T4) or a local GPU for Steps 8 to 14. Everything else runs on a laptop.
8. **What the code-generation prompts do.** The prompts below tell the AI assistant exactly what to build, with file names, schemas, thresholds sources and tests. The assistant writes the code. You run, verify and commit.
9. **Path conventions.** `data/`, `models/`, `docs/`, `scripts/` are at the repo root. `config/` always means `ai-service/config/`. Training scripts live in `ai-service/training/` and are run **from the repo root** (for example `python ai-service/training/train_nurses.py`); they find the repo root from their own file location. Commands that start with `pytest` or `uvicorn` run **inside `ai-service/`** with the virtual environment active. Use **Git Bash** on Windows so the shell commands in this file work unchanged.
10. **Website design rules are part of the requirements.** The site must look like a real clinical tool, not a template. The rules are in section 6 (rules 11 to 20) and are enforced by `scripts/check_copy.py` (Step 27 and the Testing Phase).

---

## 1. Tools and which model for which job

| IDE | Model | Best used for |
|---|---|---|
| **Antigravity** | **Claude Opus 4.6 (Thinking)** | Hardest reasoning: pipeline orchestration, safety logic, final audit. Use sparingly (quota). |
| **Antigravity** | **Claude Sonnet 4.6 (Thinking)** | Main workhorse: multi-file features, ML code, integrations |
| **Antigravity** | **Gemini 3.8 Flash (Medium)** | Fast boilerplate, frontend pages, docs, repetitive tests, browser-driven checks |
| **Antigravity** | **GPT-OSS 120B (Medium)** | Dataset and training scripts, second opinion when another model is stuck |
| **Cursor** | **Grok 4.6** | Node/Express backend, Socket.IO, debugging with whole-repo context |
| **VS Code** | **GitHub Copilot Free Tier** | Small edits, commit messages, README, quick fixes (the free tier has limited chat quota, so keep it for small jobs) |

**Quota fallback:** if a model shows a quota notice in the model picker (the warning icon in your screenshot), use the fallback written in the step. Opus falls back to Sonnet. Sonnet falls back to GPT-OSS 120B. Flash falls back to Copilot.

**Naming format used in every step:** `Use Antigravity — Claude Sonnet 4.6 (Thinking).`

**All three IDEs open the same folder** (`skinsentry/`). Git is run in the terminal of whichever IDE you are in.

---

## 2. Recommended tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), Tailwind CSS, Recharts (radar), lucide-react icons, HTML canvas overlays, socket.io-client |
| Node API | Node.js 20+, Express, Mongoose, JWT, Zod, Socket.IO, Razorpay SDK, Nodemailer, node-cron, sharp, file-type |
| AI service | Python 3.11, FastAPI, PyTorch, Hugging Face Transformers, timm, segmentation-models-pytorch, scikit-learn, XGBoost, OpenCV, scikit-image, albumentations |
| Pretrained models | `facebook/dinov2-small` (backbone), `wanglab/medsam-vit-base` (segmentation, Apache-2.0) |
| Database | MongoDB (Atlas free tier or local) + MongoDB Compass |
| Image storage | Local disk folder `storage/` (env-configured path) |
| LLM | Groq API (OpenAI-compatible, model name read from env) |
| Real-time | Socket.IO (presence, chat, WebRTC signalling) and WebRTC (audio/video) |
| Payments | Razorpay (test mode) |
| Email | Nodemailer over SMTP |
| Testing | pytest, Vitest + Supertest, Playwright, axe-core |

---

## 3. Datasets and models (summary)

| Purpose | Source | Link | Local folder |
|---|---|---|---|
| Cancer team (7 lesion classes, dermoscopy) | HAM10000 (Kaggle) | https://www.kaggle.com/datasets/kmader/skin-cancer-mnist-ham10000 | `data/raw/ham10000/` |
| Skin disease team (23 classes, you pick 6 to 8) | DermNet (Kaggle) | https://www.kaggle.com/datasets/shubhamgoel27/dermnet | `data/raw/dermnet/` |
| Ulcer team (foot ulcer images and masks) | FUSeg / chronic wound dataset (GitHub) | https://github.com/uwm-bigdata/wound-segmentation | `data/raw/fuseg/` |
| "Not skin" images for the nurse gate | Intel Image Classification (Kaggle), or any 2000+ non-skin photos | https://www.kaggle.com/datasets/puneet6060/intel-image-classification | `data/raw/nonskin/` |
| Backbone | DINOv2 small | https://huggingface.co/facebook/dinov2-small | cached by Hugging Face |
| Segmentation | MedSAM | https://huggingface.co/wanglab/medsam-vit-base | cached by Hugging Face |

Steps 5 and 6 contain the "do you already have it?" prompts and the exact download commands.

**The 12 models and where each is built**

| # | Model | Team | Built in |
|---|---|---|---|
| 1 | Ulcer nurse | Ulcer | Step 9 |
| 2 | Skin disease nurse | Skin disease | Step 9 |
| 3 | Cancer nurse | Cancer | Step 9 |
| 4 | Cancer Junior A (classifier, MedSAM mask, ABCDE) | Cancer | Step 10 |
| 5 | Ulcer Junior A (U-Net, tissue colours) | Ulcer | Step 11 |
| 6 | Skin disease Junior A (classifier with abstention) | Skin disease | Step 12 |
| 7 to 9 | Junior B comparers (cancer, ulcer, disease) | All | Step 13 |
| 10 to 12 | Seniors (cancer likelihood, ulcer rules, disease top-3) | All | Step 14 |

---

## 4. Complete folder structure

```
skinsentry/
├── AGENTS.md                         # rules for Antigravity
├── .cursor/rules/project.mdc         # same rules for Cursor
├── .github/copilot-instructions.md   # same rules for Copilot
├── README.md
├── .gitignore
├── docs/
│   ├── API_CONTRACT.md
│   ├── DATASETS.md
│   ├── MODEL_CARDS.md
│   ├── TEST_REPORT.md
│   ├── AUDIT_REPORT.md
│   ├── DATA_FLOW.md
│   └── DESIGN_SYSTEM.md
├── data/                             # git-ignored
│   ├── raw/{ham10000,dermnet,fuseg,nonskin}/
│   ├── processed/
│   └── embeddings/
├── models/                           # git-ignored, except MANIFEST.json and metrics/
│   ├── MANIFEST.json
│   └── metrics/
├── scripts/
│   ├── validate_datasets.py
│   ├── train_all.sh
│   ├── scan_placeholders.sh
│   └── check_copy.py
├── ai-service/
│   ├── requirements.txt
│   ├── .env.example
│   ├── config/{clinical_rules.yaml, thresholds.json (generated)}
│   ├── app/
│   │   ├── main.py  config.py  schemas.py
│   │   ├── pipeline/{quality,backbone,nurses,cancer,ulcer,disease,junior_b,seniors,safety,arbitration,orchestrator}.py
│   │   └── llm/{groq_client,report,templates}.py
│   ├── training/{config.yaml, make_splits.py, compute_quality_thresholds.py, extract_embeddings.py, train_nurses.py, train_cancer.py, train_ulcer.py, train_disease.py, train_seniors.py, evaluate.py}
│   └── tests/
├── api/
│   ├── package.json  .env.example
│   └── src/
│       ├── server.js
│       ├── config/  models/  routes/  middleware/  services/  sockets/  jobs/  templates/
│       └── tests/
├── web/
│   ├── package.json  .env.example
│   └── src/{app,components,content,lib}/
└── storage/                          # git-ignored uploads
```

---

## 5. Environment variable templates

**`api/.env.example`**
```
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:3000
MONGODB_URI=
JWT_SECRET=
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=
REFRESH_EXPIRES_IN=7d
AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_API_KEY=
STORAGE_DIR=../storage
ADMIN_EMAIL=
ADMIN_PASSWORD=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
STUN_URLS=stun:stun.l.google.com:19302
TURN_URL=
TURN_USERNAME=
TURN_CREDENTIAL=
MONGODB_URI_TEST=
DEFAULT_TIMEZONE=
AI_TIMEOUT_MS=
AI_MAX_RETRIES=
MAX_UPLOAD_MB=
ALLOWED_IMAGE_TYPES=
ANALYSIS_CONCURRENCY=
PRESENCE_GRACE_SECONDS=
PAYMENT_WINDOW_MINUTES=
SESSION_GRACE_MINUTES=
MIN_FEE_INR=
MAX_FEE_INR=
RETENTION_CASE_DAYS=
RETENTION_AUDIT_DAYS=
DELETION_GRACE_DAYS=
FOLLOWUP_DEFAULT_DAYS=
REFUND_POLICY_TEXT=
ORG_NAME=
CONTACT_EMAIL=
GOVERNING_LAW=
```
> Step 17 explains each new variable and suggests a starting value. You decide the final values.

**`ai-service/.env.example`**
```
AI_SERVICE_API_KEY=
GROQ_API_KEY=
GROQ_MODEL=
GROQ_BASE_URL=https://api.groq.com/openai/v1
HF_TOKEN=
MAX_UPLOAD_MB=
MODELS_ARCHIVE_URL=
DEVICE=auto
MODELS_DIR=../models
DATA_DIR=../data
LOG_LEVEL=INFO
```

**`web/.env.example`**
```
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
NEXT_PUBLIC_RAZORPAY_KEY_ID=
```

> Real values go into `.env` files (git-ignored). Only the `.env.example` files are committed.

---

## 6. Global rules file (used in Step 1)

Paste this text into `AGENTS.md`, `.cursor/rules/project.mdc` and `.github/copilot-instructions.md` so every IDE follows the same rules.

```
PROJECT: SkinSentry (Team Green Lights). Decision-support skin screening. Never claims a diagnosis.

NON-NEGOTIABLE RULES
1. No mock data, dummy responses, placeholder values, fake results, TODO/FIXME comments, or unfinished functions in committed code.
2. No hardcoded secrets, URLs, thresholds, model names, or file paths. Read from env vars or config files. Thresholds are computed from data by scripts and saved to config/thresholds.json.
3. Never invent model outputs. If a model file is missing, fail with a clear error message. Do not return fake predictions.
4. The LLM (Groq) only explains structured results. It never decides risk, never produces numbers that are not in its input.
5. Every API input is validated (Zod in Node, Pydantic in Python). Every error returns a clear JSON error and a correct HTTP status.
6. Never log secrets, passwords, tokens, or raw patient images. Patient identity is never sent to Groq (send de-identified features only).
7. Every feature ships with a test and a real-time verification instruction.
8. After each step: run tests, then commit with message "Step N: <title>" and push.
9. Ask the user before downloading datasets. Never fabricate dataset contents.
10. UI always shows: "Decision support only. A normal or low-risk result never proves there is no problem. A doctor makes the diagnosis."

DESIGN AND COPY RULES (the website must look like a real clinical tool, not a template)
11. Palette only: #17252A ink, #2B7A78 teal, #3AAFA9 light teal, #DEF2F1 mist, #FEFFFF paper. Risk colours come from the tokens in docs/DESIGN_SYSTEM.md. No purple, violet, indigo or fuchsia anywhere. No gradients of any kind. No glassmorphism, blurred blobs, glow effects or heavy shadows.
12. Buttons, badges, inputs and cards use a corner radius of 4px at most. Never pill-shaped or fully rounded buttons. Never use rounded-full, rounded-xl, rounded-2xl or rounded-3xl.
13. No emoji anywhere: UI, copy, emails, logs, commit messages. Icons are inline SVG from lucide-react only.
14. No em dashes and no en dashes in any user-facing text, emails, legal pages or prompts that produce text. Use commas, colons, periods or parentheses.
15. No fake or placeholder content: no testimonials, reviews, ratings, customer logos, user counters, statistics, awards, certifications or "trusted by" claims. Every number on screen comes from the API, the database or a metrics file produced by our own evaluation.
16. No stock photos, no AI-generated images, no illustration packs. Visuals are SVG diagrams we author and real screenshots of the real app.
17. Copy is plain, specific and short. Banned words: revolutionize, cutting-edge, seamless, empower, unlock, next-generation, game-changing, supercharge, leverage, elevate, world-class, state-of-the-art, "your journey". "AI-powered" is never used as a claim on its own. Say concretely what the product does.
18. Motion: no scroll-triggered animation, no parallax, no animated counters, no custom cursor or cursor effects, no animation libraries. Only 150ms colour transitions on hover and focus, and a spinner for loading. Respect prefers-reduced-motion.
19. Accessibility: WCAG AA contrast, visible focus rings, labelled form fields, full keyboard operation. Never use colour alone to show risk; always add a text label and an icon.
20. Contrast rules for this palette: never put white text on #3AAFA9 (use #17252A). Teal #2B7A78 text only on #FEFFFF. On #DEF2F1 use #17252A text.
```

---

## 7. AI-service response contract (used by Steps 2, 15, 16, 17 and 20)

`POST /v1/analyze` (multipart): `image` (required), `prior_image` (optional), `other_lesion_images[]` (optional), `patient_context` (JSON string: age, sex, skin_type, body_site, sun_exposure, family_history, diabetic, px_per_cm optional).

Response (every field comes from real computation; fields that cannot be computed are `null` with a `reason`):

```json
{
  "request_id": "uuid",
  "model_versions": {"backbone": "...", "nurses": "...", "cancer": "...", "ulcer": "...", "disease": "...", "llm": "..."},
  "quality": {"passed": true, "blur": 0.0, "brightness": 0.0, "contrast": 0.0, "width": 0, "height": 0, "reasons": [], "coach_tips": []},
  "nurses": {"ulcer": {"relevant": false, "score": 0.0}, "disease": {"relevant": false, "score": 0.0}, "cancer": {"relevant": true, "score": 0.0}},
  "teams": {
    "cancer": {
      "junior_a": {"class_probs": {}, "top_class": "", "abcde": {"asymmetry": 0.0, "border": 0.0, "color": 0.0, "diameter_px": 0.0, "diameter_mm": null, "evolution": null}, "mask_png_b64": "", "patch_scores": {"grid": [8, 8], "values": []}},
      "junior_b": {"ugly_duckling": {"score": null, "reason": ""}, "change": null, "patch_scores": {"grid": [8, 8], "values": []}},
      "senior": {"likelihood": {"point": 0.0, "low": 0.0, "high": 0.0}, "band": "low|moderate|high|very_high", "urgency": "monitor|routine_visit|urgent_visit", "likely_types": [], "warning_signs": []}
    },
    "ulcer": null,
    "disease": null
  },
  "safety": {"decision": "proceed|abstain|escalate", "agreement": {"agree_cells": 0, "disagree_cells": 0, "score": 0.0}, "ood": {"score": 0.0, "flagged": false}, "reasons": []},
  "arbitration": {"primary_team": "cancer|ulcer|disease|none", "notes": []},
  "explanation": {"language": "en", "text": "", "source": "groq|template", "validated": true},
  "artifacts": {"overlay_png_b64": "", "heatmap_png_b64": ""}
}
```

---

# PART A: IMPLEMENTATION STEPS

---

## Step 1: Accounts, tools, repository and shared AI rules

**IDE + Model:** Use Antigravity — Claude Sonnet 4.6 (Thinking). *(Fallback: GPT-OSS 120B (Medium).)*

**Objective:** Prepare every account and tool you will need, create the GitHub repository and monorepo skeleton, and install the shared rules so all three IDEs behave the same.

### 1A. Do these yourself first (checklist)

| Item | How |
|---|---|
| Git, Node.js 20+, Python 3.11 | Install, then check: `git --version`, `node -v`, `python --version` |
| GitHub repo | github.com → New → name `skinsentry` → **private** → no README → create. Copy the HTTPS URL |
| MongoDB | **Option A (easiest):** MongoDB Atlas free cluster → Database Access (create user) → Network Access (add your IP) → Connect → Drivers → copy the connection string. **Option B:** install MongoDB Community Server locally (`mongodb://127.0.0.1:27017/skinsentry`). Install **MongoDB Compass** either way |
| Kaggle API token | kaggle.com → profile → Settings → API → **Create New Token** → saves `kaggle.json`. Place it at `~/.kaggle/kaggle.json` (Windows: `C:\Users\<you>\.kaggle\kaggle.json`). On Mac/Linux run `chmod 600 ~/.kaggle/kaggle.json` |
| Hugging Face token | huggingface.co → Settings → Access Tokens → create a **read** token |
| Groq API key | console.groq.com → API Keys → create |
| Razorpay | dashboard.razorpay.com → switch to **Test Mode** → Settings → API Keys → generate. Keep key id and secret |
| SMTP | Gmail: turn on 2-Step Verification → Google Account → Security → App passwords → create. Host `smtp.gmail.com`, port `587`, user = your Gmail, pass = the app password |
| Google Colab | colab.research.google.com → Runtime → Change runtime type → **T4 GPU** |

### 1B. Commands
```bash
mkdir skinsentry && cd skinsentry
git init -b main
git remote add origin <YOUR_GITHUB_REPO_URL>
mkdir -p docs data/raw data/processed data/embeddings models/metrics scripts ai-service api web storage .cursor/rules .github
```
(Run these in **Git Bash** on Windows. `mkdir -p` and `cp` do not work the same in the old Command Prompt.)

### 1C. Prompt to paste (open the `skinsentry` folder in Antigravity)
```text
You are the lead engineer for SkinSentry. Read the "Global rules" text I give you below and install it.

TASKS
1. Create these three files with IDENTICAL rule content: AGENTS.md, .cursor/rules/project.mdc (add the frontmatter: description: SkinSentry project rules, alwaysApply: true), and .github/copilot-instructions.md.
2. Create .gitignore covering: node_modules, .venv, __pycache__, .next, dist, .env, .env.*, !.env.example, data/, storage/, models/* with exceptions !models/MANIFEST.json and !models/metrics/, *.pt, *.pth, *.joblib, *.npy, *.zip, .DS_Store, coverage, playwright-report.
3. Create README.md with: project name, one-line description, the decision-support disclaimer, and a "Setup" heading (Step 27 completes the README). No filler text.
4. Create empty folder markers (.gitkeep) for docs, scripts, models/metrics so Git tracks them.
5. Create docs/DATASETS.md containing a table with columns: Dataset, Purpose, Source link, Licence, Local path, Date downloaded, Notes. Leave rows empty for now (header only).

GLOBAL RULES (copy exactly into the three rule files):
<paste the block from section 6 of the plan>

When finished, print the file tree and confirm each rule file has identical rule text.
```

### 1D. Verify in the IDE (real time)
1. In Antigravity, open the chat and ask: *"List the project rules you are following."* It must repeat the rules from `AGENTS.md`.
2. Open the folder in **Cursor** → Settings → Rules → confirm `project.mdc` is loaded (Always).
3. Open the folder in **VS Code** → Copilot Chat → ask *"What instructions do you follow for this repo?"* It should mention the no-mock-data rule.
4. Run `git status` and confirm `.gitignore` is applied (no `data/` or `.env` listed).

**Expected result:** three identical rule files, `.gitignore`, `README.md`, `docs/DATASETS.md`, and the empty folder skeleton.

### 1E. Commit and push
```bash
git add -A
git commit -m "Step 1: Project setup, repository initialization and shared AI rules"
git tag step-1
git push -u origin main --tags
```

---

## Step 2: AI service foundation (FastAPI)

**IDE + Model:** Use Cursor — Grok 4.6. *(Fallback: Antigravity — Claude Sonnet 4.6 (Thinking).)*

**Objective:** A running FastAPI service with typed configuration, API-key protection, structured logging, health checks and the response schemas from section 7. No ML yet.

**Files to create:** `ai-service/requirements.txt`, `ai-service/.env.example`, `ai-service/app/main.py`, `config.py`, `schemas.py`, `ai-service/tests/test_health.py`.

### Commands
```bash
cd ai-service
python -m venv .venv
# Windows: .venv\Scripts\activate    Mac/Linux: source .venv/bin/activate
cp .env.example .env     # then fill AI_SERVICE_API_KEY with a long random string, and GROQ values
```
Generate a random key: `python -c "import secrets; print(secrets.token_urlsafe(48))"`

### Prompt to paste
```text
Build the FastAPI foundation for the SkinSentry AI service inside ai-service/.

REQUIREMENTS
1. requirements.txt with pinned-compatible packages: fastapi, uvicorn[standard], pydantic, pydantic-settings, python-multipart, pillow, numpy, opencv-python-headless, scikit-learn, xgboost, joblib, pyyaml, httpx, pytest, pytest-asyncio, structlog. (Heavy ML packages will be added in later steps.)
2. app/config.py: pydantic-settings class loading ALL values from .env (see ai-service/.env.example variables: AI_SERVICE_API_KEY, GROQ_API_KEY, GROQ_MODEL, GROQ_BASE_URL, HF_TOKEN, DEVICE, MODELS_DIR, DATA_DIR, LOG_LEVEL). Fail at startup with a clear message if AI_SERVICE_API_KEY is missing. DEVICE=auto must resolve to cuda if available, else cpu, using torch only if installed.
3. app/schemas.py: Pydantic v2 models that mirror EXACTLY the response contract in docs/API_CONTRACT.md (create that file by copying section 7 of the plan). Fields that cannot always be computed must be Optional with a reason string.
4. app/main.py: FastAPI app with CORS disabled (only the Node API calls this service), request-ID middleware, structured JSON logging (never log request bodies or images), and a dependency that requires header X-API-Key matching AI_SERVICE_API_KEY on every route except GET /health.
5. Routes: GET /health (returns status, device, list of required model files and whether each exists on disk, python and package versions) and POST /v1/analyze that for now returns HTTP 503 with {"error":"models_not_loaded"} (we implement it in Step 15). Do not return fake data.
6. Global exception handler returning {"error": code, "message": text, "request_id": id}.
7. tests/test_health.py: tests for /health without key (200), /v1/analyze without key (401), with wrong key (403), with key (503).
8. Add ai-service/pytest.ini with pythonpath = . and testpaths = tests. Add the run command to README section "AI service": uvicorn app.main:app --reload --port 8000.

Run the tests and show the output.
```

### Verify in the IDE
```bash
uvicorn app.main:app --reload --port 8000
```
1. Open http://localhost:8000/health → JSON shows `status: ok` and each required model file marked `exists: false` (correct for now).
2. Open http://localhost:8000/docs → Swagger loads.
3. Terminal: `curl -i -X POST http://localhost:8000/v1/analyze` → `401`. With the header `-H "X-API-Key: wrong"` → `403`. With the real key → `503 models_not_loaded`.
4. `pytest -q` → all tests pass.

**Expected result:** service runs, is key-protected, and refuses to fake results.

### Commit and push
```bash
git add -A && git commit -m "Step 2: AI service foundation with FastAPI, config and security" && git tag step-2 && git push origin main --tags
```

---

## Step 3: Node API foundation and MongoDB schemas

**IDE + Model:** Use Antigravity — Claude Sonnet 4.6 (Thinking). *(Fallback: Cursor — Grok 4.6.)*

**Objective:** Express server, validated configuration, MongoDB connection and all Mongoose models with indexes.

**Files:** `api/package.json`, `api/.env.example`, `api/src/server.js`, `src/config/env.js`, `src/config/db.js`, `src/models/*.js`, `src/middleware/{error,validate,requestId}.js`, `src/utils/logger.js`.

### Commands
```bash
cd api && npm init -y
npm i express mongoose zod cors helmet morgan jsonwebtoken bcryptjs cookie-parser express-rate-limit multer socket.io razorpay nodemailer node-cron sharp file-type uuid dotenv pino axios form-data
npm i -D vitest supertest nodemon
cp .env.example .env     # fill MONGODB_URI, JWT_SECRET, REFRESH_TOKEN_SECRET (random 48+ chars), ADMIN_EMAIL, ADMIN_PASSWORD, AI_SERVICE_API_KEY (same as ai-service)
```

### Prompt to paste
```text
Build the Node.js API foundation in api/ using Express and ES modules (package.json must contain "type": "module").

1. src/config/env.js: load .env with dotenv and validate EVERY variable listed in api/.env.example using Zod. Exit with a clear list of missing variables if invalid. Export a frozen config object. No default secrets.
2. src/config/db.js: Mongoose connection with retry/backoff, connection events logged, graceful shutdown.
3. Mongoose models (timestamps on all, indexes where stated):
   - User: email (unique, lowercase), passwordHash, role (patient|doctor|admin), name, phone, languagePref (en|ta|hi), isActive, refreshTokenHash, termsVersionAccepted, termsAcceptedAt, healthDataConsentAt, deletionRequestedAt.
   - Patient: userId (ref, unique), dateOfBirth, sex, skinType (Fitzpatrick I-VI), sunExposure, familyHistorySkinCancer (bool), isDiabetic (bool). No names stored beyond User.
   - Doctor: userId (ref, unique), specialty (dermatologist|wound_care|diabetologist|general), registrationNumber, verificationStatus (pending|verified|rejected), verifiedBy, fees {chat, audio, video} in paise, isOnline (bool), presenceMode (auto|offline), lastSeenAt, bio.
   - Availability: doctorId, weekday (0-6), startTime, endTime, timezone (value from env DEFAULT_TIMEZONE), plus exceptions array (dates the doctor is unavailable).
   - Case: patientId, createdBy, bodySite, imagePaths [ {path, takenAt, kind: current|prior|other_lesion, sha256} ], context (object), status (queued|processing|completed|failed|abstained), analysisId, lesionLabel (patient-given nickname for tracking the same mole/wound across visits), followUpAt, createdAt.
   - Analysis: caseId, requestId, modelVersions, result (Mixed: the exact AI response JSON), durationMs, error.
   - WoundMeasurement: caseId, patientId, lesionLabel, takenAt, areaPx, areaCm2 (nullable), tissue {granulation, slough, necrotic, other}.
   - Report: caseId, language, text, source (groq|template).
   - Appointment: patientId, doctorId, caseId (optional), mode (chat|audio|video), kind (instant|scheduled), status (requested|awaiting_payment|paid|in_progress|completed|cancelled|expired|no_show), scheduledAt, durationMin, note, requestedAt, confirmedAt, reminderSent {h24, h1}.
   - Payment: appointmentId, razorpayOrderId (unique), razorpayPaymentId, amountPaise, currency, status (created|paid|failed|refunded), signatureVerified (bool), webhookEvents [].
   - Message: appointmentId, senderId, text, sentAt.
   - Consent: patientId, doctorId, caseId, grantedAt, revokedAt.
   - Feedback: caseId, doctorId, decision (accept|correct|reject), notes, correctedLabel.
   - EmailLog: to, template, status (sent|failed), messageId, error, at.
   - AuditLog: actorId, action, entityType, entityId, meta, ip, at (TTL not applied).
4. src/server.js: helmet, cors restricted to CLIENT_URL with credentials, JSON body limit, cookie-parser, morgan -> pino, rate limiting on /auth, GET /health returning {status, db: connected|disconnected, uptime}, central error middleware returning {error, message, requestId}, graceful shutdown.
5. Add npm scripts: dev (nodemon), start, test (vitest run).
6. Add tests: env validation fails without required vars; /health returns 200 and db status.

Run tests and start the server; show output.
```

### Verify in the IDE
1. `npm run dev` → terminal shows "MongoDB connected" and the port.
2. Open http://localhost:5000/health → `db: "connected"`.
3. Open **MongoDB Compass** → connect with the same URI → database `skinsentry` → after the first start the collections exist (Mongoose creates them when indexes sync). If a collection is missing, ask the assistant to call `Model.init()` for all models at startup.
4. Temporarily remove `JWT_SECRET` from `.env` → server must refuse to start and list the missing variable. Put it back.

**Expected result:** API runs, connects to Atlas or local MongoDB, and every collection is visible in Compass.

### Commit and push
```bash
git add -A && git commit -m "Step 3: Node API foundation, MongoDB connection and schemas" && git tag step-3 && git push origin main --tags
```

---

## Step 4: Authentication, roles and admin bootstrap

**IDE + Model:** Use Cursor — Grok 4.6. *(Fallback: Antigravity — Claude Sonnet 4.6 (Thinking).)*

**Objective:** Secure register/login/refresh/logout with role-based access, doctor verification workflow and an admin created from env.

**Files:** `api/src/routes/auth.js`, `routes/admin.js`, `middleware/auth.js`, `middleware/roles.js`, `services/tokens.js`, `scripts/seedAdmin.js`, `tests/auth.test.js`.

### Prompt to paste
```text
Implement authentication and authorization in api/.

ENDPOINTS
- POST /auth/register {email, password, name, role: patient|doctor, phone, languagePref}. Password min 10 chars with Zod rules. Patients also accept {dateOfBirth, sex, skinType, sunExposure, familyHistorySkinCancer, isDiabetic}. Doctors also require {specialty, registrationNumber, bio} and are created with verificationStatus=pending. Role "admin" can never be created through this endpoint.
- POST /auth/login -> sets an httpOnly, sameSite=lax, secure-in-production refresh cookie and returns a short-lived access JWT (JWT_EXPIRES_IN). Doctors with status pending or rejected can log in but get a flag verificationStatus in the response; routes that require a verified doctor must reject them with 403.
- POST /auth/refresh (rotating refresh tokens, store only a hash), POST /auth/logout (invalidate), GET /auth/me.
- Admin routes (admin only): GET /admin/doctors?status=pending, PATCH /admin/doctors/:id/verify {status: verified|rejected}, GET /admin/audit?limit&cursor.
MIDDLEWARE: requireAuth, requireRole(...roles), requireVerifiedDoctor.
SECURITY: bcrypt cost 12, generic "invalid credentials" message, account lockout or rate limit after repeated failures, AuditLog entries for register, login, logout, verify actions.
scripts/seedAdmin.js: creates the admin from ADMIN_EMAIL and ADMIN_PASSWORD in env (idempotent). npm script "seed:admin". No hardcoded credentials anywhere.
TESTS (Vitest + Supertest, using a separate test database from env var MONGODB_URI_TEST): register patient, register doctor (pending), duplicate email 409, weak password 400, login success/failure, expired token 401, wrong role 403, refresh rotation, admin verifies doctor, pending doctor blocked from doctor-only route.

Run all tests and show output.
```

### Verify in the IDE (use Thunder Client, the VS Code REST Client extension, or curl)
1. `npm run seed:admin` → "Admin created". Run again → "Admin already exists".
2. Register a patient with **your own email**; login → copy the access token.
3. `GET /auth/me` with `Authorization: Bearer <token>` → your profile. Without the token → `401`.
4. Register a doctor (a second real email you own). Log in as admin → `GET /admin/doctors?status=pending` shows the doctor → `PATCH` verify → status changes.
5. Compass → `users`, `doctors`, `auditlogs` show the records. Password is stored only as a bcrypt hash.
6. `npm test` → all green.

**Expected result:** working role-based auth, a verified-doctor workflow, and an audit trail.

### Commit and push
```bash
git add -A && git commit -m "Step 4: Authentication, RBAC and admin bootstrap" && git tag step-4 && git push origin main --tags
```

---

## Step 5: Dataset A: HAM10000 (Cancer team)

**IDE + Model:** Use Antigravity — GPT-OSS 120B (Medium). *(Fallback: Antigravity — Claude Sonnet 4.6 (Thinking).)*

**Objective:** Get the real HAM10000 dermoscopy dataset into `data/raw/ham10000/`, validate it, and create leak-free train/validation/test splits.

### 5A. ASK GATE (the assistant must ask this first)
```text
Before writing any code, ask me exactly this and wait for my answer:
"Do you already have the HAM10000 dataset on this computer? If yes, give me the full folder path. If no, I will give you the download steps."
Do not continue until I answer.
```

### 5B. If you do NOT have it: download steps

1. Open **https://www.kaggle.com/datasets/kmader/skin-cancer-mnist-ham10000** while logged in. Click **Download** once (this accepts the terms). It is about 5 GB.
2. Or use the CLI (needs the `kaggle.json` from Step 1):
```bash
pip install kaggle
kaggle datasets download -d kmader/skin-cancer-mnist-ham10000 -p data/raw/ham10000 --unzip
```
3. **Where to place files** (full path from the repo root):
```
skinsentry/data/raw/ham10000/HAM10000_metadata.csv
skinsentry/data/raw/ham10000/HAM10000_images_part_1/   (about 5000 .jpg files)
skinsentry/data/raw/ham10000/HAM10000_images_part_2/   (about 5000 .jpg files)
```
You may delete the `hmnist_*.csv` files and the duplicated lowercase image folders; we do not use them.
4. Original source and citation: Harvard Dataverse, doi:10.7910/DVN/DBW86T (Tschandl, 2018). **Non-commercial use only.** Add this to `docs/DATASETS.md`.

### 5C. Prompt to paste
```text
Create scripts/validate_datasets.py (Python, argparse, subcommand "ham10000") and ai-service/training/make_splits.py.

validate_datasets.py ham10000 must:
1. Check data/raw/ham10000/HAM10000_metadata.csv exists and has columns lesion_id, image_id, dx, dx_type, age, sex, localization.
2. Confirm both image folders exist and every image_id in the CSV has a matching .jpg. Print the count of missing files (must be 0) and the total image count (expected 10015).
3. Print counts per dx (expected classes: akiec, bcc, bkl, df, mel, nv, vasc) and the number of missing age/sex/localization values.
4. Open a random sample of 50 images with Pillow to verify they are not corrupt.
5. Exit with code 1 and a clear message on any failure.

ai-service/training/make_splits.py ham10000:
- Create train/val/test splits (70/15/15) GROUPED BY lesion_id so the same lesion never appears in two splits (HAM10000 has multiple images per lesion). Stratify by dx as far as grouping allows.
- Read the random seed and ratios from a file ai-service/training/config.yaml (create it with a comment explaining each value).
- Save data/processed/ham10000_splits.csv (image_id, lesion_id, dx, split, path, age, sex, localization) and print per-split class counts.
- Add a "malignant_or_premalignant" column: 1 for mel, bcc, akiec; 0 otherwise. Document this definition in docs/DATASETS.md.
Also update docs/DATASETS.md with the HAM10000 row (source link, licence: non-commercial, citation, local path, today's date).
Run both scripts and show output.
```

### Verify in the IDE
1. `python scripts/validate_datasets.py ham10000` → prints **10015** images, **0 missing**, seven classes, "VALID".
2. `python ai-service/training/make_splits.py ham10000` → creates `data/processed/ham10000_splits.csv`. Open it in the IDE: each `lesion_id` appears in only one split (ask the assistant to add an assertion for this and show it passing).
3. Put a wrong path on purpose (rename the folder) → the script must fail with a clear message. Rename it back.

**Expected result:** validated HAM10000 plus grouped splits.

### Commit and push
```bash
git add -A && git commit -m "Step 5: HAM10000 dataset validation and leak-free splits" && git tag step-5 && git push origin main --tags
```

---

## Step 6: Datasets B: DermNet, FUSeg wounds and non-skin images

**IDE + Model:** Use Antigravity — GPT-OSS 120B (Medium). *(Fallback: Claude Sonnet 4.6 (Thinking).)*

**Objective:** Get three more real datasets for the Skin Disease team, Ulcer team and the "not skin" class of the nurse gate.

### 6A. ASK GATE
```text
Ask me these three questions one by one and wait for each answer:
1. "Do you already have the DermNet image dataset? If yes, give me the folder path."
2. "Do you already have the FUSeg foot-ulcer dataset (images and masks)? If yes, give me the folder path."
3. "Do you already have a folder with at least 2000 non-skin photos (objects, scenes)? If yes, give me the path."
For each "no", show me the download steps from the plan.
```

### 6B. Download steps

**DermNet (skin diseases).** Page: **https://www.kaggle.com/datasets/shubhamgoel27/dermnet**
```bash
kaggle datasets download -d shubhamgoel27/dermnet -p data/raw/dermnet --unzip
```
Expected layout (23 disease class folders, each with images):
```
skinsentry/data/raw/dermnet/train/<class name>/*.jpg
skinsentry/data/raw/dermnet/test/<class name>/*.jpg
```
If the unzip creates an extra nested folder, move `train/` and `test/` so they sit directly under `data/raw/dermnet/`.

**FUSeg / chronic wound dataset (ulcers, with expert masks).** Repo: **https://github.com/uwm-bigdata/wound-segmentation**
```bash
git clone https://github.com/uwm-bigdata/wound-segmentation data/raw/fuseg_repo
```
The Foot Ulcer Segmentation Challenge data sits inside the repo's `data` folder (training images with masks, plus validation and test sets). **Copy the image and mask folders into:**
```
skinsentry/data/raw/fuseg/train/images/*.png   and   skinsentry/data/raw/fuseg/train/labels/*.png
skinsentry/data/raw/fuseg/validation/images/   and   .../labels/   (only if masks are present)
skinsentry/data/raw/fuseg/test/images/         (masks for the challenge test set may be withheld by the organisers; the assistant must detect this and not use unlabeled images for scoring)
```
About 1010 training images were released with masks (889 patients). Cite the FUSeg paper listed on the repo page.

**Non-skin images.** Page: **https://www.kaggle.com/datasets/puneet6060/intel-image-classification** (scene photos). Alternatively use any 2000+ photos of everyday objects.
```bash
kaggle datasets download -d puneet6060/intel-image-classification -p data/raw/nonskin --unzip
```
Place all images (any subfolders are fine) under `skinsentry/data/raw/nonskin/`.

### 6C. Prompt to paste
```text
Extend scripts/validate_datasets.py with subcommands "dermnet", "fuseg", "nonskin", and extend ai-service/training/make_splits.py.

dermnet:
- Verify train/ and test/ exist with class subfolders; print image count per class for both.
- Open 50 random images to check they decode. Detect exact duplicate images across train and test using SHA-256 and report them.
- Then PRINT the 23 class names with their train image counts and ASK ME to choose 6 to 8 classes for the skin-disease team. Recommend classes that have many images and look clinically distinct. Save my choice to ai-service/training/config.yaml under disease_classes. Do not choose for me silently.
fuseg:
- Inspect the actual folder structure and report it. Verify every image has a mask with the same stem. Verify masks are binary (or map their values and document how). Print image count, mask count, image size distribution, mean wound-area fraction.
- State clearly which split has masks and which does not. Use only images with masks for training and scoring.
- NOTE for docs: the dataset has 1010 labeled images from 889 patients, so some patients appear more than once. Record this as a known leakage risk in docs/DATASETS.md.
nonskin: verify at least 2000 images decode correctly.

make_splits.py additions:
- dermnet: build train/val from the dermnet train folder (stratified, grouped by SHA-256 duplicates), keep dermnet test as the final test split. Only the chosen classes are used for the disease classifier; ALL dermnet images go to a "disease_domain" list for the nurse.
- fuseg: train/val/test from labeled images only (seeded, ratios from config).
- nonskin: train/val/test split.
Save data/processed/{dermnet,fuseg,nonskin}_splits.csv.
Also create the DOMAIN table for nurse training and save data/processed/nurse_domains.csv with columns: path, split, domain in {cancer, ulcer, disease, none}. Domain rules: HAM10000 images -> cancer; DermNet folders whose names refer to melanoma, nevi/moles or skin cancer -> cancer (clinical photos of lesions); other DermNet folders -> disease; FUSeg images -> ulcer; nonskin -> none. Print the table of counts per domain per split and warn if any domain has fewer than 500 training images.
Update docs/DATASETS.md for all three datasets (links, licences, local paths, dates, known limitations).
Run all validators and show output.
```

### Verify in the IDE
1. `python scripts/validate_datasets.py dermnet` → lists classes, asks you to choose; answer in chat and confirm `ai-service/training/config.yaml` now contains your classes.
2. `python scripts/validate_datasets.py fuseg` → reports image/mask counts and the folder structure.
3. `python scripts/validate_datasets.py nonskin` → at least 2000 images OK.
4. `python ai-service/training/make_splits.py all` → `data/processed/nurse_domains.csv` created. Open it and confirm all four domains exist.
5. Look at 5 random wound images with their masks (ask the assistant to save a quick side-by-side PNG into `data/processed/preview/`) and confirm the masks match the wounds.

**Expected result:** all four datasets validated, a chosen disease class list, and split files for every dataset.

### Commit and push
```bash
git add -A && git commit -m "Step 6: DermNet, FUSeg and non-skin datasets validated with splits" && git tag step-6 && git push origin main --tags
```

---

## Step 7: Image quality gate (thresholds computed from data)

**IDE + Model:** Use Antigravity — Claude Sonnet 4.6 (Thinking). *(Fallback: GPT-OSS 120B (Medium).)*

**Objective:** A rule-based gate for blur, brightness, contrast and resolution whose thresholds are **computed from your real datasets** and **validated** by degrading real images.

**Files:** `ai-service/app/pipeline/quality.py`, `ai-service/training/compute_quality_thresholds.py`, `ai-service/config/thresholds.json` (generated), `ai-service/tests/test_quality.py`.

### Prompt to paste
```text
Implement the quality gate.

1. ai-service/training/compute_quality_thresholds.py: sample up to N images per domain (N from ai-service/training/config.yaml) from data/processed/*_splits.csv. For each image compute: blur = variance of the Laplacian on grayscale resized to a fixed long side from config; brightness = mean of V channel; contrast = std of grayscale; width, height. Save the distribution percentiles per domain and write config/thresholds.json with data-derived minimum/maximum values (use the percentile level named in ai-service/training/config.yaml, e.g. quality_percentile). Include metadata: date, sample sizes, percentile used.
2. VALIDATE the thresholds: take 200 real good images, create degraded copies (Gaussian blur at several strengths, darkening, brightening, downscaling), run the gate, and print detection rate for degraded images and false-reject rate for the originals. Save to models/metrics/quality_gate.json. If false-reject rate on originals is above the limit set in ai-service/training/config.yaml, adjust the percentile and re-run; explain the trade-off.
3. app/pipeline/quality.py: function assess_quality(image) -> dict matching the "quality" part of docs/API_CONTRACT.md. It loads config/thresholds.json once at startup (fail loudly if missing). reasons[] lists failing checks; coach_tips[] maps each reason to a plain instruction ("Move closer and hold still", "Add more light", "Avoid glare", "Remove hair covering the area", "Keep the lesion centred"). Tip texts live in config/coach_tips.yaml, not in code.
4. Add GET /v1/quality (multipart image) to the FastAPI app for direct testing.
5. tests/test_quality.py using real images from data/raw (skip with a clear message if data is absent) plus programmatically blurred copies.
Run the compute script, the validation, and the tests; show the metrics.
```

### Verify in the IDE
1. `python ai-service/training/compute_quality_thresholds.py` → `config/thresholds.json` appears; open it and confirm the values are numbers computed from your data (with sample sizes and date).
2. Check `models/metrics/quality_gate.json` for the detection and false-reject rates.
3. Run the server and call the endpoint with a **real sharp photo** (use any HAM10000 image):
```bash
curl -X POST http://localhost:8000/v1/quality -H "X-API-Key: <key>" -F "image=@data/raw/ham10000/HAM10000_images_part_1/ISIC_0024306.jpg"
```
→ `passed: true`. (If this exact filename is absent, use any file from that folder.)
4. Take a photo with your phone that is deliberately blurry or very dark → `passed: false` with tips.
5. `pytest ai-service/tests/test_quality.py -q` passes.

**Expected result:** a data-driven quality gate with proven detection and false-reject rates.

### Commit and push
```bash
git add -A && git commit -m "Step 7: Image quality gate with data-derived thresholds" && git tag step-7 && git push origin main --tags
```

---

## Step 8: Backbone and embedding extraction (GPU step)

**IDE + Model:** Use Antigravity — Claude Sonnet 4.6 (Thinking). *(Fallback: GPT-OSS 120B (Medium).)*

**Objective:** Load the pretrained DINOv2-small backbone and convert every dataset image into a feature vector that all small models train on.

**Design decision (important):** we pool **mean patch tokens** (384 numbers per image). For linear classifiers, the logit of the mean feature equals the mean of per-patch logits, so the same classifier gives **real patch-level scores** for the disagreement view. This is a principled approximation and must be described that way in the deck.

**Files:** `ai-service/app/pipeline/backbone.py`, `ai-service/training/extract_embeddings.py`, update `requirements.txt`, `models/MANIFEST.json` (generated).

### Prompt to paste
```text
Add the backbone and the embedding extraction pipeline.

1. Add to requirements.txt: torch, torchvision, transformers, timm, segmentation-models-pytorch, albumentations, scikit-image, scipy, kaggle, tqdm, matplotlib, pandas, pyyaml. Do not pin CUDA wheels in the file; document the correct torch install command for CPU and CUDA in README section "AI service".
2. app/pipeline/backbone.py: class Backbone loading the Hugging Face model whose id is read from ai-service/training/config.yaml (backbone_id: facebook/dinov2-small). Methods: embed(pil_images) -> (N,384) mean of patch tokens after the final layer norm; patch_tokens(pil_image) -> (grid_h, grid_w, 384). Fixed preprocessing from the model's own image processor (resize/crop values come from the processor config, not hardcoded). Use fp16 on CUDA. Verify the loaded model by embedding two different images and asserting the embeddings differ and have the expected shape. Cache downloads in the Hugging Face cache; read HF_TOKEN from env.
3. ai-service/training/extract_embeddings.py: for each split CSV in data/processed (ham10000, dermnet, fuseg images, nonskin) compute embeddings in batches with a tqdm progress bar, handle corrupt images by logging and skipping them (write skipped list), and save data/embeddings/<dataset>.npy plus data/embeddings/<dataset>_index.csv (row order, path, split, label columns). The script must be resumable (skip finished datasets) and print time per 1000 images.
4. After extraction create/refresh models/MANIFEST.json listing every artifact in models/ and data/embeddings with sha256, size, creation time, git commit hash, and backbone id.
5. A pytest that loads 8 real images from data/raw, embeds them, checks shape, determinism (same image twice gives identical vectors within tolerance), and that different images differ.
```

### Run it on a GPU (Google Colab recommended)

In a new Colab notebook (Runtime → T4 GPU), run these cells in order:
```python
# 1. get your code (use a GitHub personal access token with repo read access)
!git clone https://<YOUR_GITHUB_USERNAME>:<YOUR_TOKEN>@github.com/<YOUR_GITHUB_USERNAME>/skinsentry.git
%cd skinsentry/ai-service
!pip install -q -r requirements.txt
```
```python
# 2. Kaggle credentials (upload kaggle.json when prompted)
from google.colab import files; files.upload()
!mkdir -p ~/.kaggle && mv kaggle.json ~/.kaggle/ && chmod 600 ~/.kaggle/kaggle.json
```
```python
# 3. re-download the datasets from the repo root /content/skinsentry so files land in /content/skinsentry/data/raw/... (repeat the Step 5 and 6 download commands)
# 4. build splits and extract embeddings
%cd /content/skinsentry
!python ai-service/training/make_splits.py all
!python ai-service/training/extract_embeddings.py
```
```python
# 5. download results to your PC: zip embeddings and place them in skinsentry/data/embeddings/
!zip -r embeddings.zip data/embeddings data/processed
from google.colab import files; files.download('embeddings.zip')
```
> To keep work between Colab sessions, mount Google Drive (`from google.colab import drive; drive.mount('/content/drive')`) and save zips there.

### Verify in the IDE
1. Unzip `embeddings.zip` into your local repo. Confirm `data/embeddings/ham10000.npy` has shape `(10015, 384)` (run `python -c "import numpy as np; print(np.load('data/embeddings/ham10000.npy').shape)"`).
2. Compare row counts of each `*_index.csv` with the matching `.npy`.
3. Run `pytest ai-service/tests/test_backbone.py -q` locally (CPU is fine for 8 images).
4. Open `models/MANIFEST.json` → sha256 entries exist.

**Expected result:** real embeddings for every dataset and a verified backbone.

### Commit and push
```bash
git add -A && git commit -m "Step 8: DINOv2 backbone and embedding extraction pipeline" && git tag step-8 && git push origin main --tags
```

---

## Step 9: Models 1 to 3: the three Nurses (domain gates) and the OOD check

**IDE + Model:** Use Antigravity — GPT-OSS 120B (Medium). *(Fallback: Claude Sonnet 4.6 (Thinking).)*

**Objective:** Train three one-vs-rest classifiers (Ulcer nurse, Skin-disease nurse, Cancer nurse) on `nurse_domains.csv`, plus an out-of-distribution score, with honest evaluation on held-out data.

**Files:** `ai-service/training/train_nurses.py`, `ai-service/app/pipeline/nurses.py`, `models/nurses/*.joblib`, `models/metrics/nurses.json`.

### Prompt to paste
```text
Implement the three nurse models and the OOD detector.

TRAINING (ai-service/training/train_nurses.py)
- Load embeddings and data/processed/nurse_domains.csv. Train THREE independent binary logistic-regression models (ulcer, disease, cancer), each one-vs-rest against all other domains INCLUDING "none". Use class_weight=balanced. Choose C by validation AUROC over a grid defined in ai-service/training/config.yaml.
- Calibrate probabilities on the validation split (Platt or isotonic, choose by validation Brier score).
- Choose each nurse's decision threshold on the validation split so that recall reaches the target in ai-service/training/config.yaml (nurses must rarely miss a relevant image). Save thresholds into config/thresholds.json under "nurses".
- Evaluate ONLY on the test split: AUROC, precision, recall, F1, confusion matrix per nurse; also report a cross-domain confusion table (true domain vs which nurses fired). Save to models/metrics/nurses.json and print a table.
- OOD detector: compute class means and a shared covariance (use shrinkage) from TRAIN embeddings of all domains. Mahalanobis distance to the nearest domain mean is the OOD score. Set the flag threshold at the percentile from config computed on the validation split. Save params in models/nurses/ood.joblib and the threshold in config/thresholds.json.
- Known weakness to measure and report: nurses may learn dataset style (dermoscopy vs phone photo). Evaluate on DermNet clinical lesion photos labeled cancer to show how the cancer nurse behaves on non-dermoscopic images, and print it.

INFERENCE (app/pipeline/nurses.py)
- Load models and thresholds at startup, verify sha256 against MANIFEST.json, fail loudly if anything is missing or altered.
- Function run_nurses(embedding) -> dict {ulcer:{relevant,score}, disease:{...}, cancer:{...}, ood:{score,flagged}} matching the contract.
- Unit tests using real embeddings from each domain.
Update models/MANIFEST.json after training.
```

### Run (GPU not required; the embeddings already exist)
```bash
python ai-service/training/train_nurses.py
```

### Verify in the IDE
1. Open `models/metrics/nurses.json` → see AUROC, precision and recall per nurse. Write the numbers into `docs/MODEL_CARDS.md` (ask the assistant to generate the table from the file).
2. Run `pytest tests/test_nurses.py -q`.
3. Start the server and check `/health`: nurse files now show `exists: true`.
4. Take **three phone photos of your own** (a mole or freckle, a rash or any skin spot, and a random object). Add a temporary debug script that runs embeddings + nurses on them and prints the output. Note which nurse fires. If the cancer nurse rejects your phone photo of a mole, that is the domain-gap weakness; keep a note for `docs/MODEL_CARDS.md`.

**Expected result:** three trained nurses with measured test performance, an OOD detector, and verified model files.

### Commit and push
```bash
git add -A && git commit -m "Step 9: Nurse models (ulcer, disease, cancer) and OOD detector" && git tag step-9 && git push origin main --tags
```

---

## Step 10: Cancer Junior A (Model 4): classifier, MedSAM segmentation and ABCDE

**IDE + Model:** Use Antigravity — Claude Sonnet 4.6 (Thinking). *(Fallback: GPT-OSS 120B (Medium).)*

**Objective:** The Cancer Junior A analyst: a 7-class lesion classifier, a lesion mask from MedSAM, and measurable ABCDE features normalised against real data.

**Pretrained model:** MedSAM: **https://huggingface.co/wanglab/medsam-vit-base** (Apache-2.0). It downloads automatically through Transformers; no manual placement is needed. First run needs internet and about 375 MB.

### 10A. OPTIONAL ASK GATE (to measure segmentation quality)
```text
Ask me: "HAM10000 from Kaggle has no lesion masks. To measure segmentation Dice I need the ISIC 2018 Task 1 masks. Do you want to download them (optional)? If yes, I will give you the link and the folder to place them in. If no, I will state in the model card that segmentation is checked visually only."
```
If yes: open **https://challenge.isic-archive.com/data/** → find the **ISIC 2018** dataset, **Task 1** (images and ground-truth masks) and download it. Place it under `skinsentry/data/raw/isic2018_task1/{images,masks}/`. (If the page layout changed, search "ISIC 2018 Task 1 lesion segmentation data".)

### Prompt to paste
```text
Implement the Cancer Junior A analyst.

1. ai-service/training/train_cancer.py: train a 7-class multinomial logistic regression on HAM10000 embeddings (train split), tune C and class weights on validation using macro-F1, then calibrate with temperature scaling on validation. Evaluate on test: balanced accuracy, macro-F1, per-class recall and precision (highlight melanoma, bcc, akiec recall), confusion matrix, top-2 accuracy, ECE. Save models/cancer/junior_a_classifier.joblib and models/metrics/cancer_classifier.json. Keep the linear weights accessible because we need patch-level scores.
2. app/pipeline/cancer.py:
   a. Patch scores: because the classifier is linear on mean patch tokens, compute per-patch logits by applying the weights to each patch token and keeping the bias once; softmax of the mean equals the image prediction. Return an 8x8 grid (average-pool the model's patch grid) of the malignant-or-premalignant class mass (mel+bcc+akiec probability proxy from per-patch logits, normalised) as patch_scores.values. State in code docs that these are approximate attributions.
   b. Segmentation: MedSAM via transformers with a box prompt. Get the box from a classical initialiser (GrabCut or Otsu on a blurred, colour-normalised image inside the central region; params in ai-service/training/config.yaml). If the initial box is degenerate, return mask=None with reason "lesion_not_localised" (never fabricate a mask). Post-process: largest connected component, hole filling, smoothing by morphological opening.
   c. ABCDE: asymmetry = 1 - mean IoU of the mask with itself flipped across its two principal axes; border = compactness (perimeter^2 / (4*pi*area)) combined with 1 - solidity (weights in config/clinical_rules.yaml, documented); colour = number of distinct dominant colours (k-means in Lab inside the mask, k selection by silhouette) plus mean within-lesion Lab standard deviation; diameter_px = max Feret diameter; diameter_mm = diameter_px / px_per_cm * 10 ONLY if the user supplied px_per_cm, else null; evolution = null here (computed in Junior B).
   d. Normalisation: compute each raw ABCDE value for every HAM10000 train image (segment a sample of N images chosen in config; run on GPU), store empirical CDFs in config/thresholds.json under "abcde_norm", and report radar values as the percentile rank (0 to 1) of the raw value in that distribution, together with the raw value. Explain in code docs that these are percentile ranks against dermoscopy images.
3. If ISIC 2018 masks were provided: evaluate MedSAM+post-processing Dice/IoU on them and save models/metrics/cancer_segmentation.json. If not provided: save a visual QA sheet of 50 overlays to data/processed/preview/cancer_seg_qa.png and write "not quantitatively evaluated" in the metrics file.
4. Tests: classifier loads, outputs 7 probabilities summing to 1; segmentation returns a binary mask of the right size for 5 real images; ABCDE is finite; a perfectly round synthetic disc (a test fixture generated in the test, not data) gives asymmetry near 0.
Run everything and print the metrics.
```

### Run
Classifier training needs only the embeddings (CPU is fine). The ABCDE normalisation step needs MedSAM on many images: run it in Colab with the same cells as Step 8 (`!python ai-service/training/train_cancer.py`), then download the `models/cancer/` folder and updated `config/thresholds.json`.

### Verify in the IDE
1. `models/metrics/cancer_classifier.json`: read per-class recall. Melanoma recall is the number to watch.
2. Open `data/processed/preview/cancer_seg_qa.png` (or run the Dice) and look at the 50 overlays. If masks leak outside lesions often, tune the box initialiser in `ai-service/training/config.yaml` and rerun.
3. Run a single real image through a debug script: print class probabilities, ABCDE raw and percentile values, and save an overlay PNG. Open the PNG in the IDE and confirm the contour hugs the lesion.
4. `pytest tests/test_cancer.py -q`.

**Expected result:** a working classifier plus mask and ABCDE for any lesion image, with metrics saved.

### Commit and push
```bash
git add -A && git commit -m "Step 10: Cancer Junior A classifier, MedSAM segmentation and ABCDE" && git tag step-10 && git push origin main --tags
```

---

## Step 11: Ulcer Junior A (Model 5): U-Net wound segmentation and tissue colours

**IDE + Model:** Use Antigravity — Claude Sonnet 4.6 (Thinking). *(Fallback: GPT-OSS 120B (Medium).)*

**Objective:** Train a U-Net on the real FUSeg masks, then measure wound area and tissue colours.

**Pretrained model:** the U-Net encoder (ResNet-34) uses ImageNet weights downloaded automatically by `segmentation-models-pytorch`.

### 11A. OPTIONAL ASK GATE (tissue colour validation)
```text
Ask me: "The DFUTissue dataset has 110 expert-labeled tissue images (granulation, slough, necrotic). It lets me validate the tissue-colour rules. Do you want to download it (optional)? If no, I will label tissue percentages as 'colour-based estimates, not clinically validated'."
```
If yes: repository **https://github.com/uwm-bigdata/DFUTissueSegNet** → follow its README for the data download → place the files under `skinsentry/data/raw/dfutissue/`.

### Prompt to paste
```text
Implement the Ulcer Junior A analyst.

1. ai-service/training/train_ulcer.py: U-Net (segmentation_models_pytorch, encoder and image size from ai-service/training/config.yaml) trained on the FUSeg labeled train split, validated on val, evaluated on test. Albumentations augmentations (flips, rotations, brightness/contrast, colour jitter). Loss = Dice + BCE. AdamW, cosine schedule, early stopping on val Dice, mixed precision on CUDA. Log to a CSV. Save the best checkpoint to models/ulcer/unet.pt and metrics (Dice, IoU, precision, recall, per-image distribution) to models/metrics/ulcer_segmentation.json. Note in the metrics file the known patient-overlap leakage risk.
2. app/pipeline/ulcer.py: load the checkpoint (verify sha256), predict mask with test-time flip averaging, keep the largest relevant components (min area ratio from thresholds.json computed as a low percentile of train wound areas), return mask and area_px. area_cm2 = area_px / (px_per_cm^2) ONLY if px_per_cm is given; otherwise null with reason "no_scale".
3. Tissue composition inside the mask: classify pixels into granulation (red), slough (yellow/white), necrotic (dark/black), other using colour rules in Lab/HSV whose ranges are stored in config/clinical_rules.yaml with a comment that they are heuristics. If DFUTissue was supplied, tune and evaluate these rules against its labels and save agreement metrics; if not, mark tissue output as estimate_only=true.
4. Periwound redness: mean redness (a* channel in Lab) in a ring around the mask (ring width = fraction of wound equivalent diameter from config) versus normal skin far from the wound; return as a ratio.
5. Tests with real FUSeg images: the predicted mask overlaps ground truth above a minimum Dice stated in the test (read from the metrics file, not guessed), tissue fractions sum to 1.
Run training (GPU) and print the final metrics table.
```

### Run
Use the Colab cells from Step 8, then `!python ai-service/training/train_ulcer.py`. Typical runtime is 20 to 40 minutes on a T4 depending on epochs in `ai-service/training/config.yaml`. Download `models/ulcer/` and `models/metrics/`.

### Verify in the IDE
1. Check Dice in `models/metrics/ulcer_segmentation.json`.
2. Run the debug script on **5 test images**; open the saved overlay PNGs and confirm the wound outline matches the visible wound.
3. Run on a **phone photo of any non-wound skin patch** (do not photograph a real patient). The mask area should be very small or empty, and the ulcer nurse should not fire anyway.
4. `pytest tests/test_ulcer.py -q`.

**Expected result:** a trained wound segmenter with a measured Dice score, plus real area and tissue outputs.

### Commit and push
```bash
git add -A && git commit -m "Step 11: Ulcer Junior A U-Net segmentation and tissue analysis" && git tag step-11 && git push origin main --tags
```

---

## Step 12: Skin disease Junior A (Model 6): classifier with abstention

**IDE + Model:** Use Antigravity — GPT-OSS 120B (Medium). *(Fallback: Claude Sonnet 4.6 (Thinking).)*

**Objective:** A calibrated classifier over your chosen 6 to 8 DermNet classes with top-3 output and a data-driven abstain rule.

### Prompt to paste
```text
Implement the Disease Junior A analyst.

1. ai-service/training/train_disease.py: multinomial logistic regression on DermNet embeddings for the classes in ai-service/training/config.yaml (disease_classes). Add an extra "other_condition" decision rule instead of a class: abstention handles unknowns. Tune C by validation macro-F1, temperature-scale on validation.
2. Abstain rule: build a selective-prediction curve on validation (coverage vs accuracy) using max probability and entropy. Choose the confidence threshold that meets the target selective accuracy in ai-service/training/config.yaml; save in config/thresholds.json under "disease_abstain". Evaluate on the DermNet test split: top-1, top-3, macro-F1, per-class recall, ECE, and accuracy at the chosen coverage. Save models/metrics/disease.json and a reliability diagram PNG.
3. app/pipeline/disease.py: returns top-3 {label, probability}, abstain flag, and patch_scores (8x8, linear decomposition for the top-1 class). Every label shown to users is a "possible condition", never a diagnosis; put the wording in config/ui_text.yaml.
4. Tests on real DermNet test images.
Run, print metrics, save the plots.
```

### Verify in the IDE
1. Read `models/metrics/disease.json`; open the reliability diagram PNG.
2. Run the debug script on five test images of different classes; confirm top-3 contains the true class for most.
3. Run on an image of an **unrelated class not in your list** (for example a DermNet class you did not select): the abstain flag should fire often. Record the abstention rate in `docs/MODEL_CARDS.md`.
4. `pytest tests/test_disease.py -q`.

**Expected result:** a calibrated disease classifier with an evidence-based abstain threshold.

### Commit and push
```bash
git add -A && git commit -m "Step 12: Skin disease Junior A classifier with abstention" && git tag step-12 && git push origin main --tags
```

---

## Step 13: Junior B comparers (Models 7 to 9) for all three teams

**IDE + Model:** Use Antigravity — Claude Sonnet 4.6 (Thinking). *(Fallback: GPT-OSS 120B (Medium).)*

**Objective:** The three "Comparer" models. They use real inputs from the patient's history: a prior photo of the same spot, or other lesions of the same patient.

### Prompt to paste
```text
Implement Junior B for cancer, ulcer and disease in app/pipeline/junior_b.py.

COMMON
- Image registration: align a prior photo to the current one using OpenCV (try ECC with a homography or affine model on grayscale; fall back to ORB features + RANSAC). Return the transform, an alignment quality score (post-alignment correlation), and refuse to compute change if the quality is below the minimum in config/thresholds.json (return null with reason "alignment_failed").
- Patch-level scores for the disagreement view on the SAME 8x8 grid as Junior A: cosine distance between current and aligned-prior patch tokens (cancer/disease), or between current patch tokens and the mean patch embedding of the patient's other lesions when no prior exists. If neither exists, patch_scores=null with reason.

CANCER JUNIOR B
- Ugly duckling: embed the target lesion and the patient's OTHER lesions (from other_lesion_images or earlier cases supplied by the Node API). Require at least the minimum count from config; otherwise return score=null and reason="not_enough_other_lesions". Score = z-score of the target's mean distance to the others compared with the distribution of leave-one-out distances among the others.
- Change over time (needs prior): after registration and MedSAM masks for both photos, compute area change %, mean colour change (Lab delta-E), border compactness change and embedding cosine distance. Combine into an evolution score using weights stored in config/clinical_rules.yaml (documented as rule-based, not trained). Also compute the ABCDE "E" value to return in abcde.evolution.
ULCER JUNIOR B
- Healing trend: from the prior and current masks and their taken_at dates, compute area change %, change per week, tissue composition change; classify trajectory (improving, stalled, worsening) using the thresholds in config/clinical_rules.yaml. Needs at least one prior photo; otherwise null with reason.
DISEASE JUNIOR B
- Progression: embedding distance and probability change of the top class between aligned prior and current photo, plus relative change of the affected area if segmentation is available; null without a prior.

TESTS (using REAL images, with real geometric transforms applied only to build test inputs, clearly marked as test construction)
- Registration recovers a known rotation/shift applied to a real image (error below a tolerance stated in the test).
- Change metrics are near zero for an image compared with itself and larger for two different lesions.
- Ugly duckling flags an outlier when one lesion of a different diagnosis is mixed among similar ones from HAM10000 (use dx labels to build the set).
Run tests and print results.
```

### Verify in the IDE
1. Run `pytest tests/test_junior_b.py -q` (all pass).
2. Debug script: pick a real HAM10000 image, rotate it 7 degrees and shift it using OpenCV, and use that as the "prior". The output must show tiny change values. Then use a different lesion as the "prior": the change values must clearly increase.
3. Build a set with 4 `nv` (benign mole) images plus 1 `mel` image from the same split: the melanoma should have the highest ugly-duckling score most of the time. Run it 20 times with different random picks and report how often it ranks first. Write this honestly in `docs/MODEL_CARDS.md` (not all will).

**Expected result:** three working comparer modules with tested, honest behaviour.

### Commit and push
```bash
git add -A && git commit -m "Step 13: Junior B comparison models for all teams" && git tag step-13 && git push origin main --tags
```

---

## Step 14: Seniors (Models 10 to 12): cancer likelihood, ulcer rules, disease top-3

**IDE + Model:** Use Antigravity — Claude Opus 4.6 (Thinking). *(Fallback: Claude Sonnet 4.6 (Thinking).)*

**Objective:** The three Senior deciders. The cancer senior produces a **calibrated likelihood with a range**. Ulcer senior is rule-based. Disease senior returns calibrated top-3.

### Prompt to paste
```text
Implement the three Seniors.

CANCER SENIOR (ai-service/training/train_seniors.py and app/pipeline/seniors.py)
- Target: malignant_or_premalignant (mel, bcc, akiec) from data/processed/ham10000_splits.csv.
- Features: out-of-fold class probabilities from the Step 10 classifier (use 5-fold cross-validation GROUPED BY lesion_id on the train split so the senior never sees in-sample probabilities), the ABCDE raw values and percentile ranks from Step 10 (computed on every HAM10000 image used here; cache results in data/processed/abcde_features.parquet and reuse), age, sex, localization (one-hot). Handle missing age/sex/site by imputation learned from train and an "is_missing" flag.
- Model: gradient-boosted trees (XGBoost). Calibrate with isotonic regression on the validation split. Uncertainty range: train a bootstrap ensemble (size from config) and report the lower and upper percentiles (from config) around the calibrated point estimate.
- Evaluate on test: AUROC, AUPRC, Brier score, ECE, sensitivity at the specificity target from config, calibration curve data. Save to models/metrics/cancer_senior.json and a calibration plot PNG.
- Risk bands and urgency: derive band cutoffs from the validation set so that the sensitivity targets in ai-service/training/config.yaml are met; write the cutoffs to config/thresholds.json. Map bands to urgency (monitor, routine_visit, urgent_visit) via config/clinical_rules.yaml.
- IMPORTANT HONESTY: ugly-duckling and change features do NOT enter the XGBoost model (no longitudinal training data exists). They appear as warning_signs and can ESCALATE urgency by one level using rules in clinical_rules.yaml; the calibrated likelihood is never altered by them. Document this in docs/MODEL_CARDS.md.
- Domain warning: HAM10000 is dermoscopy. If the image is flagged as non-dermoscopic (OOD distance to HAM10000 centroid above the threshold from config), set reliability="reduced", widen the range by the factor in config and say so in warning_signs.
- warning_signs: list the ABCDE axes whose percentile rank exceeds the cutoff in config, with their raw values.

ULCER SENIOR (rules)
- config/clinical_rules.yaml holds all thresholds with a "source" field. Ask me to confirm each value before you save it. Propose commonly used wound-care benchmarks (for example, a stalled wound is often defined as less than about 50 percent area reduction over about 4 weeks) and mark each one "verify with a wound-care clinician".
- Output: trajectory (healing, stalled, worsening, unknown), red_flags (necrotic fraction above threshold, spreading periwound redness ratio above threshold, wound area increase above threshold, diabetic patient with foot wound), and urgency. Any red flag forces urgency=urgent_visit. No probability is invented for infection; output "possible infection warning signs" only.

DISEASE SENIOR
- Combine Junior A top-3 with the abstain rule; add progression flag from Junior B. Output top-3 possible conditions with calibrated probabilities, or "uncertain, see a clinician" when abstaining.

Tests: seniors refuse to run when upstream outputs are missing; likelihood is within [0,1] and low<=point<=high; ulcer red-flag override works.
Run training and print metrics tables.
```

### Run
Feature caching runs MedSAM on many images, so use Colab again (`!python ai-service/training/train_seniors.py`), then download `models/` and `data/processed/abcde_features.parquet`.

### Verify in the IDE
1. Open `models/metrics/cancer_senior.json`: AUROC, Brier, ECE, and the sensitivity at the target specificity. Open the calibration plot and check the curve follows the diagonal. If not, say so in the model card.
2. Run the senior on 10 test images (5 benign `nv`, 5 `mel`): read the likelihood and range for each.
3. Run `pytest tests/test_seniors.py -q`.
4. Open `config/clinical_rules.yaml` and confirm that you approved each ulcer rule value in Step 14. Ask a clinician or a trusted medical source to review them before any real use.

**Expected result:** calibrated cancer likelihood with an uncertainty range, rule-based ulcer decisions, and calibrated disease top-3, all with measured performance.

### Commit and push
```bash
git add -A && git commit -m "Step 14: Senior models for cancer, ulcer and skin disease" && git tag step-14 && git push origin main --tags
```

---

## Step 15: Safety layer, arbitration, orchestrator and the `/v1/analyze` endpoint

**IDE + Model:** Use Antigravity — Claude Opus 4.6 (Thinking). *(Fallback: Claude Sonnet 4.6 (Thinking).)*

**Objective:** Connect all 12 models into one pipeline with real safety rules, and expose it through the AI service endpoint.

### Prompt to paste
```text
Implement app/pipeline/safety.py, arbitration.py, orchestrator.py and the real POST /v1/analyze endpoint.

ORCHESTRATOR FLOW
1. Quality gate. If failed: return decision "abstain" with reasons and coach tips; do not run models.
2. Embed the image once (Backbone), get patch tokens once, reuse everywhere.
3. Run the three nurses and the OOD check.
4. For each team whose nurse is relevant: run Junior A, Junior B (if its inputs exist) and the Senior. Run teams concurrently with a thread pool. If no nurse is relevant: return primary_team "none" with the message that the image does not look like a lesion, ulcer or skin condition and the coach tips.
5. SAFETY (safety.py), every threshold read from config/thresholds.json or clinical_rules.yaml:
   - Agreement view: threshold each 8x8 patch-score map at the percentile defined in config to get flagged cells from Junior A and Junior B. Count cells flagged by both, by A only, by B only, by neither. agreement.score = cells flagged by both / cells flagged by either (null if Junior B patch scores do not exist, with reason).
   - Decision rules: "abstain" if quality failed, or the senior's confidence is below the abstain threshold, or OOD flagged on a team that needs in-domain data and the reliability is reduced beyond the allowed limit; "escalate" if agreement.score is below the minimum, or any red flag exists, or both cancer and disease nurses fire with conflicting urgency; else "proceed". Always list human-readable reasons.
6. ARBITRATION (arbitration.py): pick primary_team by the highest urgency, then by nurse score; list secondary teams; never hide a relevant team's output.
7. Overlay artifacts: render a PNG overlay (mask contour, heatmap) and a separate heatmap PNG as base64.
8. Model versions: read from models/MANIFEST.json.
9. Timings and request_id logged.

ENDPOINT
- POST /v1/analyze multipart (image, prior_image optional, other_lesion_images[] optional, patient_context JSON validated with Pydantic including taken_at dates). Validate content types and size limits from env or config; reject unsupported files with 415 and large files with 413. Load all models once at startup (lifespan), verify sha256 from MANIFEST.json, and refuse to start analysis (503) if any model is missing.
- The response must validate against schemas.py. The "explanation" field is filled in Step 16; until then return explanation.source="none" and no text.

TESTS
- End-to-end test with three real images (one HAM10000 lesion, one FUSeg wound, one DermNet disease image): the matching team's nurse fires, the output validates against the schema.
- A real non-skin image returns primary_team none.
- A blurry copy returns abstain with tips.
- Missing prior gives null change with reason, not an error.
Run the tests and show timing per stage.
```

### Verify in the IDE
```bash
cd ai-service && uvicorn app.main:app --port 8000
```
1. Open http://localhost:8000/docs → **Authorize** with your `X-API-Key` → try `POST /v1/analyze` with a real HAM10000 image. The response must show: nurses (cancer true), junior A/B/senior fields, agreement block, overlay base64.
2. Decode `overlay_png_b64` (ask the assistant to add a tiny script `scripts/save_overlay.py <json>`) and open the PNG.
3. Upload a **FUSeg wound** → ulcer team runs. Upload a **DermNet rash** → disease team runs.
4. Upload a **landscape photo** → `primary_team: none`.
5. Upload your **blurry phone photo** → `abstain` with tips.
6. Check `/health` → every model file `exists: true` and `models_loaded: true`.

**Expected result:** one endpoint that runs the full 12-model pipeline with real safety decisions and no faked values.

### Commit and push
```bash
git add -A && git commit -m "Step 15: Safety layer, arbitration and full analyze pipeline" && git tag step-15 && git push origin main --tags
```

---

## Step 16: Groq explanation service (validated, multilingual, with a real fallback)

**IDE + Model:** Use Antigravity — Claude Sonnet 4.6 (Thinking). *(Fallback: Cursor — Grok 4.6.)*

**Objective:** Turn the structured result into a clear explanation in English, Tamil or Hindi. The LLM may only repeat facts it is given.

### 16A. Choose the Groq model (do this yourself, once)
```bash
curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
```
Pick a current instruction-following model from the list that supports JSON output (check Groq's models documentation page for "JSON mode" support), then put its id in `ai-service/.env` as `GROQ_MODEL`. Model lists change often, which is why it is never hardcoded.

### Prompt to paste
```text
Implement the explanation service in app/llm/.

1. groq_client.py: async client (httpx) for the OpenAI-compatible chat completions endpoint at GROQ_BASE_URL using GROQ_API_KEY and GROQ_MODEL from env. Timeouts, retry with exponential backoff on 429/5xx, and a startup check that calls the models endpoint and confirms GROQ_MODEL is listed (log a clear error otherwise, but do not crash the whole service).
2. report.py: build a "facts" object from the analysis result containing ONLY de-identified features: team, likelihood point/low/high, band, urgency, likely types with probabilities, ABCDE raw and percentile values, warning signs, agreement score and cells, safety decision and reasons, quality notes, ulcer trajectory and red flags, language. NEVER include names, emails, patient IDs, dates of birth, or image data.
3. Prompt rules (store in app/llm/prompts/*.txt, not in code): the model must (a) use only the supplied facts, (b) not diagnose, (c) mention uncertainty and the range, (d) say that a low-risk or normal result never proves there is no problem, (e) recommend the supplied urgency action only, (f) output JSON {"summary": str, "key_findings": [str], "why_this_risk": str, "next_steps": [str], "limitations": [str]}, (g) keep all numbers as digits 0-9 exactly as given.
4. Validation: parse JSON with Pydantic; extract every number from the output and check that each one appears in the facts (tolerate rounding rules defined in config); reject text containing diagnosis phrases from config/banned_phrases.yaml ("you have cancer", "you are diagnosed" etc.). If validation fails, retry once with the validation error appended; if it fails again use the fallback.
5. Languages: en, ta, hi. For ta and hi, ask the model to write natural text in that language keeping digits and medical terms like ABCDE as supplied. Validate numbers the same way.
6. templates.py fallback: a deterministic template that formats the real values into sentences in en, ta, hi (store the sentence templates in config/report_templates.yaml; Tamil and Hindi texts must be reviewed by a native speaker before real use, note this in docs/MODEL_CARDS.md). Set explanation.source accordingly ("groq" or "template") and validated=true only if validation passed.
7. Wire it into /v1/analyze via a query parameter language. If GROQ fails entirely the endpoint still succeeds with the template.
8. Tests: facts builder never contains forbidden fields (check with a fixture result built from a REAL pipeline output); validator rejects a text with an invented number; fallback works when the API key is wrong (use a real call with an invalid key, expect 401, then fallback).
Run tests, then run a real call and print the generated English, Tamil and Hindi explanations.
```

### Verify in the IDE
1. Call `/v1/analyze?language=en` with a real image → `explanation.source: "groq"`, text mentions the actual likelihood and range from the response.
2. Repeat with `language=ta` and `language=hi`.
3. Temporarily set `GROQ_API_KEY` to a wrong value and restart → the response still works with `source: "template"`. Restore the key.
4. Compare every number in the explanation with the JSON. They must match.
5. Open the service log: no patient details and no raw prompts containing identifiers.

**Expected result:** validated, de-identified, multilingual explanations with a working fallback.

### Commit and push
```bash
git add -A && git commit -m "Step 16: Groq explanation service with validation and fallback" && git tag step-16 && git push origin main --tags
```

---

## Step 17: Cases API, secure uploads and the Node to AI integration

**IDE + Model:** Use Cursor — Grok 4.6. *(Fallback: Antigravity — Claude Sonnet 4.6 (Thinking).)*

**Objective:** Patients upload photos, the API stores them safely, sends them to the AI service with the patient's real history (earlier photos of the same spot, other lesions), saves the results, and pushes live status to the browser.

### 17A. Decide the new environment values (add them to `api/.env`)

| Variable | Meaning | Suggested starting value |
|---|---|---|
| `DEFAULT_TIMEZONE` | Timezone for doctor availability | `Asia/Kolkata` |
| `AI_TIMEOUT_MS` | Max wait for the AI service | `120000` |
| `AI_MAX_RETRIES` | Retries on 5xx or timeout | `2` |
| `MAX_UPLOAD_MB` | Max image size (also set in `ai-service/.env`) | `10` |
| `ALLOWED_IMAGE_TYPES` | Comma list | `image/jpeg,image/png` |
| `ANALYSIS_CONCURRENCY` | Analyses at once (match your GPU or CPU) | `1` on CPU, `2` on GPU |
| `FOLLOWUP_DEFAULT_DAYS` | Default follow-up photo interval | `28` |

Other variables from the template (payments, retention, legal) are decided in later steps. You choose the final values.

### Prompt to paste
```text
Implement the cases module in api/ and one new endpoint in ai-service/.

NODE API
1. GET /config/public (no auth): returns allowed image types, max upload MB, supported languages, min and max consultation fee, retention periods, refund policy text, organisation name, contact email and governing law, all read from env. The web app uses this as its single source for these values.
2. POST /cases (patient only, multipart/form-data): file field "image" (required) and fields bodySite, lesionLabel, takenAt (optional, default now), language, and a JSON "context" with skinType, sunExposure, familyHistorySkinCancer, isDiabetic, pxPerCm (optional). Validate with Zod. Validate the file by its MAGIC BYTES using file-type (not the filename or client MIME), reject others with 415, reject oversize with 413, reject images below a minimum pixel size (value from env or config). Use sharp to auto-orient and re-encode the image, which removes EXIF data including GPS. Save to STORAGE_DIR/patients/<patientId>/<caseId>/<sha256>.jpg. Never serve files from a public static folder.
3. History linking (real data only): find the most recent completed case of the same patient with the same lesionLabel and bodySite and attach its image as prior_image with its takenAt; collect up to the configured number of the most recent images of the patient's OTHER lesionLabels as other_lesion_images. If none exist, send none (no placeholders).
4. Analysis job: an in-process queue (write it yourself, no Redis) with concurrency ANALYSIS_CONCURRENCY. The worker calls POST AI_SERVICE_URL/v1/analyze with axios and form-data, header X-API-Key, timeout AI_TIMEOUT_MS, and the language. Handle: 200 with decision proceed or escalate -> case.status completed; decision abstain -> status abstained and keep the reasons and coach tips; 5xx or timeout -> retry up to AI_MAX_RETRIES with backoff, then status failed with a readable error. Save an Analysis document. Save mask, overlay and heatmap PNGs (base64 in the AI response) as files under the case folder and store only their file names in Analysis.result, never base64 in MongoDB. For ulcer results, also save a WoundMeasurement (areaPx, areaCm2 or null, tissue fractions, takenAt).
5. Socket.IO: authenticate sockets by JWT, join room user:<userId>, emit "case:update" {caseId, status} on every status change. Provide a polling fallback endpoint GET /cases/:id/status.
6. Endpoints: GET /cases (own, paginated, filter by lesionLabel), GET /cases/:id (owner, a doctor with an ACTIVE consent for this case, or admin), GET /cases/:id/image/:imageId and GET /cases/:id/artifact/:name (same access rules, stream from disk, correct content types, path traversal impossible), POST /cases/:id/explanation {language} (calls the AI service /v1/explain, caches one Report per case and language), PATCH /cases/:id/followup {days} (sets followUpAt), DELETE /cases/:id (owner; deletes files and records, writes an audit entry).
7. Every action writes an AuditLog. Never log image bytes or tokens.
8. Tests (Vitest + Supertest against MONGODB_URI_TEST, with the AI service running locally for the integration test): wrong file type 415, oversize 413, another patient cannot read my case (404), prior-photo linking picks the right earlier case, abstained and failed paths, EXIF removed (check with sharp metadata on the stored file).

AI SERVICE ADDITION
9. POST /v1/explain (X-API-Key required): body {result: <analysis result JSON>, language}. It reuses the Step 16 facts builder, Groq client and validation and returns the explanation object. No image needed. Add tests.
Run all tests and show output.
```

### Verify in the IDE
1. Start both services (`uvicorn` in `ai-service/`, `npm run dev` in `api/`).
2. With Thunder Client or curl, log in as your patient and `POST /cases` with a real image (for development you can use a file from `data/raw/ham10000/...`; for the final demo use your own consented photos).
3. `GET /cases/<id>` repeatedly: `queued`, then `processing`, then `completed`, with a real `result` block.
4. Compass → `analyses` shows the JSON without base64 blobs; the `storage/patients/...` folder contains the image and artifact PNGs.
5. Check EXIF is gone: `python -c "from PIL import Image; print(Image.open(r'<stored file>').getexif())"` prints an empty result.
6. Log in as a **second patient** and request the first patient's case → `404`.
7. Upload a `.txt` file renamed to `.jpg` → `415`.
8. Stop the AI service and upload again → status becomes `failed` after retries with a readable error. Start it again.
9. `npm test` passes.

**Expected result:** a secure case pipeline with real history linking and live status.

### Commit and push
```bash
git add -A && git commit -m "Step 17: Cases API, secure uploads and AI service integration" && git tag step-17 && git push origin main --tags
```

---

## Step 18: Frontend foundation and design system

**IDE + Model:** Use Antigravity — Claude Sonnet 4.6 (Thinking). *(Fallback: Gemini 3.8 Flash (Medium).)*

**Objective:** A Next.js app with a strict design system that follows the rules in section 6, so the site looks like a real clinical product.

### Commands
```bash
npx create-next-app@latest web --ts --tailwind --eslint --app --src-dir --import-alias "@/*"
cd web
npm i recharts socket.io-client lucide-react zod react-hook-form @hookform/resolvers clsx
npm i -D @playwright/test @axe-core/playwright
cp .env.example .env.local   # create .env.example first from section 5 if create-next-app did not
```

### The design system (give this to the assistant exactly)

**Colour tokens**

| Token | Value | Use |
|---|---|---|
| `--ink` | `#17252A` | Body text, dark surfaces |
| `--teal` | `#2B7A78` | Primary buttons, links on paper, key lines |
| `--teal-light` | `#3AAFA9` | Accents, chart fills, borders on dark. Text on it must be ink |
| `--mist` | `#DEF2F1` | Section backgrounds, table stripes. Text on it must be ink |
| `--paper` | `#FEFFFF` | Page background |
| `--line` | `rgba(23,37,42,0.16)` | 1px borders and dividers |
| `--muted` | `rgba(23,37,42,0.72)` | Secondary text |
| `--risk-low` | `#1E6B3A` | Low band text and border |
| `--risk-moderate` | `#8A5A00` | Moderate band |
| `--risk-high` | `#B54708` | High band |
| `--risk-severe` | `#B42318` | Very high, urgent, errors |

Each risk token also has a 12 percent tint for backgrounds. No other colours. **No purple, no gradients.** Risk is always shown with a text label and an icon, never colour alone.

**Shape and layout:** `--radius: 4px` on buttons, inputs, cards, badges. 1px borders, no drop shadows (a 1px border instead). 8px spacing grid. Content width 1200px max, text columns 70 characters max. Dense, calm layouts like a clinical tool.

**Type:** IBM Plex Sans for text and IBM Plex Mono for numbers and IDs, loaded with `next/font/google` (self-hosted at build time). Sizes: 14px base in dashboards, 16px for reading text, clear heading scale 28/22/18. Tabular numbers for measurements.

**Components to build (each with all states, keyboard support and focus rings):** Button (primary, secondary, danger, text), Input, Textarea, Select, FileDropzone, Card, Badge (square 4px), Alert (info, warning, error, disclaimer), Table, Tabs, Dialog, Toast, Spinner (the only animated element), FormField with label, hint and error, StatusBadge for case states.

**Icons:** `lucide-react` only, 1.75 stroke, 16 or 20 px, always with a text label or `aria-label`.

**Motion:** 150ms colour transitions on hover and focus. Nothing else. No scroll effects, no animated counters, no custom cursor, no animation libraries. Honour `prefers-reduced-motion`.

### Prompt to paste
```text
Build the frontend foundation in web/ following the design system I give you. Create docs/DESIGN_SYSTEM.md containing the tokens, rules and component list first, then implement.

1. Tailwind configuration (use the Tailwind version that create-next-app installed; for v4 define tokens in CSS with @theme, for v3 in tailwind.config): only the tokens above, radius 4px everywhere, disable the default colour palette so purple or other colours cannot be used by accident.
2. Global CSS: body background paper, text ink, visible focus ring (2px teal outline, 2px offset), prefers-reduced-motion respected, no scroll-behavior effects.
3. Components in src/components/ui as listed, accessible (labels, aria attributes, focus management in Dialog, escape to close).
4. Layout: a top navigation bar (logo as plain text "SkinSentry", links, login or account menu), a footer (organisation name, links to Privacy Policy, Terms and Conditions, Model performance, contact email; all from /config/public), and an app shell for signed-in pages with a left navigation.
5. src/lib/api.ts: typed fetch client with the access token in memory (never localStorage), automatic refresh using the httpOnly cookie, consistent error objects. src/lib/socket.ts: socket.io-client connected with the access token.
6. Auth pages: /login and /register with react-hook-form and Zod. Register collects role, name, email, phone, language, password and (for patients) the profile fields from the Patient schema, (for doctors) specialty, registration number and bio. Doctors see a clear note that they must be verified by an administrator before they appear to patients.
7. Auth context with route protection by role; pages for forbidden and not found; an error boundary with a readable message.
8. Add the permanent disclaimer component: "Decision support only. A normal or low-risk result never proves there is no problem. A doctor makes the diagnosis." Use it on every page that shows results.
9. Do NOT add any imagery, gradients, emoji, animation libraries, analytics, or tracking scripts.
Run lint and the build, then start the dev server.
```

### Verify in the IDE
1. `npm run dev` → open http://localhost:3000.
2. Register a patient with a real email (the API must be running). Log in. Reload the page: you stay signed in through the cookie refresh. Check **DevTools → Application → Local Storage**: no token is stored there.
3. Tab through the login form with the keyboard only: the focus ring is visible on every control.
4. DevTools → Elements: select any button and confirm `border-radius` is 4px or less.
5. Resize to 360px wide: the layout still works with no horizontal scroll.
6. `npm run build` completes without errors.

**Expected result:** a working, accessible shell with the design system in place and no decorative effects.

### Commit and push
```bash
git add -A && git commit -m "Step 18: Frontend foundation, design system and authentication UI" && git tag step-18 && git push origin main --tags
```

---

## Step 19: Landing page, How it works, Privacy Policy, Terms and Conditions, and consent

**IDE + Model:** Use Antigravity — Claude Sonnet 4.6 (Thinking). *(Fallback: Gemini 3.8 Flash (Medium).)*

**Objective:** Public pages that say exactly what the product does, with no vague claims, plus real legal pages and consent capture at sign-up.

### 19A. ASK GATE (the assistant must ask these before writing legal text)
```text
Ask me these questions one at a time and wait for each answer:
1. "What is the legal or team name that should appear as the operator of this service?"
2. "What contact email should appear for privacy and support requests?"
3. "Which country or state's law should govern the Terms?"
4. "What is the refund policy? For example: full refund if the doctor does not join, no refund after a completed session."
5. "How long should we keep case images and results (days)? How long audit logs (days)? How many days between a deletion request and permanent deletion?"
6. "What is the minimum age to use the service?"
Save the answers into api/.env (ORG_NAME, CONTACT_EMAIL, GOVERNING_LAW, REFUND_POLICY_TEXT, RETENTION_CASE_DAYS, RETENTION_AUDIT_DAYS, DELETION_GRACE_DAYS) and record the minimum age in api/.env as MIN_AGE.
Do not invent any of these values.
```

### Approved landing page copy (use exactly, then follow the same plain style for anything else)

- **Heading (H1):** Check a skin lesion, wound or rash, then talk to a doctor.
- **Subheading:** Upload a photo. SkinSentry measures the area, estimates how concerning it looks, shows which parts of the image drove the result, and lets you book a chat, audio or video consultation with a verified doctor. It supports a doctor's decision. It does not replace one.
- **Buttons:** "Start a check" (primary, links to register) and "How it works" (secondary).
- **Section "What it checks":**
  - *Skin lesions (moles and spots):* Sorts a lesion into one of seven types seen in dermoscopy images, outlines it, and scores asymmetry, border, colour and diameter. Gives an estimated likelihood with a range, not a diagnosis.
  - *Wounds and ulcers:* Outlines the wound, estimates its area and tissue colours, and compares your photos over time to show whether it is healing, stalled or getting worse.
  - *Skin conditions:* Lists up to three possible conditions from a limited set, or says it is not sure. The full list is on the Model performance page.
- **Section "How it works":** 1. Upload a clear photo. 2. The app checks the photo quality and tells you how to retake it if needed. 3. Three specialist checks run (lesion, wound, skin condition). Only the ones that apply to your photo report. 4. You see the result, the measurements behind it, and a plain-language explanation in English, Tamil or Hindi. 5. You can book a verified doctor.
- **Section "What it cannot do":** It cannot diagnose. It cannot rule out a problem. Photos taken with a phone are less reliable than clinical images. It was trained on public image sets that contain mostly lighter skin tones, so it may be less reliable on darker skin. See the Model performance page for the measured results and limits.
- **Disclaimer bar:** the standard disclaimer.
- **Visual:** one inline SVG diagram of the real pipeline (photo, quality check, three specialist checks, safety check, result, doctor), drawn with the palette, square corners, no photographs, no illustrations.

### Prompt to paste
```text
Build the public pages in web/ using the approved copy exactly. Follow every design and copy rule in the project rules. Do not add anything that is not true of the product.

PAGES
1. / (landing): approved copy, the SVG pipeline diagram, links to Register, How it works, Model performance. No testimonials, no numbers about users, no stock images, no hero animation.
2. /how-it-works: expand each of the five steps in plain language, including photo tips (steady hand, daylight, include a ruler or coin for scale if you want size in centimetres, keep the spot centred, remove hair if possible), what each result field means (likelihood and range, ABCDE scores as percentile ranks against dermoscopy images, the agreement view, warning signs), and what happens when the system is not sure.
3. /privacy (Privacy Policy) and 4. /terms (Terms and Conditions), written in plain language from the REAL data flows of this project. First create docs/DATA_FLOW.md listing every piece of personal data and where it goes (database collections, storage folder, AI service, Groq receives only de-identified measured features and never images or identity, Razorpay processes payments and we store only order and payment ids, the SMTP provider sends emails, a STUN server sees IP addresses during calls, doctors see a case only with the patient's consent). Then write each policy statement from that file and cite the code location in the file. List any statement that is not yet true because a feature arrives in a later step (data export and deletion arrive in Step 26) and keep a checklist to re-verify in Step 26 and Step 28.
   Privacy Policy sections: operator and contact, what we collect, why we use it, who processes it, how long we keep it (values from /config/public), security measures that actually exist, your rights (access and export, correction, deletion, withdrawing consent) and how to use them, children and minimum age, cookies (one essential sign-in cookie and nothing else, no analytics or advertising trackers), international transfers (name the processors and where they may process data, as far as known), changes to the policy, contact.
   Terms sections: what the service is and is not (decision support, not a diagnosis, not for emergencies, with the instruction to contact a doctor or emergency services urgently for rapid change, bleeding, spreading redness, fever or severe pain), eligibility and accounts, your content and permission to process it, doctors are independent practitioners and the consultation relationship is between patient and doctor, fees and payments (Razorpay) and the refund policy from config, acceptable use, AI limitations, dataset and model attribution (HAM10000 non-commercial licence and citation, DermNet, FUSeg, DINOv2, MedSAM), availability, limitation of liability, governing law from config, changes, contact.
   Both pages show an effective date and a version string stored in one place (web/src/content/legalMeta.ts: version and effectiveDate set from the real date of the last edit). Both are readable without logging in and linked in the footer and on the register page.
5. CONSENT: on registration require two unticked checkboxes (accept Terms and Privacy Policy; for patients also explicit consent to process health photos for the analysis). Send termsVersionAccepted, termsAcceptedAt and healthDataConsentAt to the API and store them. The API rejects registration without them. If the version changes later, the app asks existing users to accept again.
6. Make the layout of legal pages easy to read: a table of contents on the left on wide screens, numbered headings, 70-character line length.
Run the copy lint script once it exists (Step 27); until then manually check there are no em dashes, no emoji, no gradients and no banned words.
```

### Verify in the IDE
1. Open http://localhost:3000 and read the landing page aloud: every sentence says something specific. No counters, no logos, no photographs.
2. Open `/privacy` and `/terms`: effective date and version show; the contact email and organisation name match your answers.
3. Register without ticking the boxes → blocked with a clear error. Tick both → account created. In Compass, the `users` document has `termsVersionAccepted`, `termsAcceptedAt`, `healthDataConsentAt`.
4. Open `docs/DATA_FLOW.md` and spot-check three statements against the code (for example, search the code for what is sent to Groq).
5. Search the source: `grep -rn $'\xe2\x80\x94' web/src` returns nothing (this searches for the em dash character).

**Expected result:** honest public pages, real legal pages tied to the actual data flows, and consent stored on every account.

### Commit and push
```bash
git add -A && git commit -m "Step 19: Landing, How it works, Privacy Policy, Terms and consent capture" && git tag step-19 && git push origin main --tags
```

---

## Step 20: Check flow UI (upload, live status and results)

**IDE + Model:** Use Antigravity — Claude Sonnet 4.6 (Thinking). *(Fallback: Gemini 3.8 Flash (Medium).)*

**Objective:** The core patient experience: upload a photo, watch real status, and read results that show the evidence behind every number.

### Prompt to paste
```text
Build the case pages in web/. Every value shown must come from the API. Follow all design and copy rules.

PAGES
1. /cases: the patient's cases (paginated) grouped by lesionLabel with the latest status, band or trajectory, and date. Empty state explains how to start a check. No fake rows.
2. /cases/new: form with FileDropzone (client checks type and size using values from /config/public, shows a preview), body site (select), lesion label (text with suggestions from the patient's existing labels, explained as "use the same label every time you photograph the same spot so we can compare"), photo date, optional scale ("pixels per centimetre" explained with a how-to: place a ruler or coin next to the spot), skin context fields prefilled from the patient profile, language. Before upload show the photo tips. Submit calls POST /cases.
3. /cases/[id]: 
   - Status: show only REAL states from the API and Socket.IO: queued, processing, completed, abstained, failed. Do not animate fake stage-by-stage progress; the AI service does not stream stages. Use a spinner and the real status text. If socket is unavailable, poll GET /cases/:id/status.
   - Quality failure or abstain: a clear banner with the reasons and coach tips and a "Retake photo" button.
   - Image panel: the photo with a canvas overlay and toggles for Mask outline, Heatmap and Agreement grid. Overlay PNGs come from /cases/:id/artifact/:name (fetched with the auth token and drawn as blobs).
   - Agreement view (disagreement view): 8x8 grid over the lesion box. Cell styles: flagged by both models = solid 2px teal outline plus cross-hatch; Model A only = diagonal hatch one way; Model B only = diagonal hatch the other way; neither = no mark. Always show a legend and a one-sentence plain summary built from the real counts, for example "Both models flagged N cells, only A flagged M, only B flagged K." If Junior B had no comparison input, show "Not available: no earlier photo or other lesions to compare" instead of an empty grid.
   - Cancer team card: estimated likelihood shown as a number with its range (point, low, high) and a horizontal interval bar with the band label; urgency (Monitor, Routine visit, Urgent visit) with icon and text; likely types with probabilities; warning signs list; reliability notice if reliability is reduced (explain that the likelihood model was trained on dermoscopy images and phone photos are less reliable). 
   - ABCDE radar (Recharts RadarChart, teal line, flat teal 20 percent fill, no gradient) with axes Asymmetry, Border, Colour, Diameter and Evolution, plotted as percentile ranks, and next to it a table with the raw values, units and what the percentile is relative to (dermoscopy images in the training data). Evolution shows "Not available" without an earlier photo. Diameter shows millimetres only when a scale was supplied.
   - Ulcer team card: trajectory (healing, stalled, worsening, unknown) with the numbers behind it; a Recharts line chart of wound area over time built from the patient's real WoundMeasurement records (px or cm squared, labelled); tissue composition bar labelled "Colour-based estimate"; red flags with urgency.
   - Skin condition card: "Possible conditions, not a diagnosis" with up to three conditions and probabilities, or "The system is not sure" when it abstains.
   - Safety panel: decision (proceed, escalate, abstain), plain-language reasons, agreement score, OOD notice.
   - Explanation panel: tabs English, Tamil, Hindi (calls POST /cases/:id/explanation on first open per language). Under the text show its source: "Written by a language model from the measured values and checked against them" or "Generated from a fixed template". Show the model versions and date used in a collapsed "Technical details" section.
   - Actions: Book a doctor (Step 21 page), Download report (Step 25), Set follow-up reminder (days input, default from config), Delete this case (confirmation dialog).
   - Disclaimer component on top of the results.
4. Doctors with an active consent also see this page (read-only) plus a Feedback form (accept, correct, reject, notes, corrected label) that posts to POST /cases/:id/feedback. Add that endpoint to the API with validation and an audit log.
5. Show every percentile and probability with a tooltip or note explaining what it means in one sentence. Never show a number without its unit or meaning.
```

### Verify in the IDE
1. Log in as a patient. Go to `/cases/new`, upload a real image, submit. The page moves to the case page and the status changes by itself (open DevTools → Network → WS to see the `case:update` frames).
2. Check each card against the raw JSON from `GET /cases/<id>` (open it in a second tab): the likelihood, range, ABCDE raw values and agreement counts are identical.
3. Toggle Mask, Heatmap and Agreement grid: the overlays line up with the lesion. Resize the window: the overlay scales with the image.
4. Open the Tamil and Hindi tabs. Numbers match the English tab.
5. Upload a blurry phone photo: the abstain banner shows real coach tips.
6. For an ulcer, upload two photos with the **same lesion label** on different dates (use the photo date field): the second case shows a trajectory and the line chart has two real points.
7. Check the browser console: no errors or warnings.

**Expected result:** a complete case flow where every number on screen traces back to the API.

### Commit and push
```bash
git add -A && git commit -m "Step 20: Case upload and results UI with agreement view and radar" && git tag step-20 && git push origin main --tags
```

---

## Step 21: Doctors, availability, fees and live online status

**IDE + Model:** Use Cursor — Grok 4.6. *(Fallback: Antigravity — Claude Sonnet 4.6 (Thinking).)*

**Objective:** Verified doctors set their schedule and fees; patients see who is online right now, updated live.

### Prompt to paste
```text
Implement doctor profiles, availability, fees and presence in api/ and web/.

API
1. Doctor self-service (verified doctors only): PUT /doctors/me/profile (specialty, bio), PUT /doctors/me/fees {chat, audio, video} in INR as whole rupees; the server stores paise and enforces MIN_FEE_INR and MAX_FEE_INR from env; PUT /doctors/me/availability (weekly ranges with weekday, start, end; validation: end after start, no overlaps; plus exception dates); PATCH /doctors/me/presence {mode: auto|offline}.
2. Public to signed-in users: GET /doctors (verified only; filters specialty, online; sorted online first then name), GET /doctors/:id, GET /doctors/:id/slots?date=YYYY-MM-DD (computed from availability in the doctor's timezone, minus appointments in status awaiting_payment, paid or in_progress, and minus past times).
3. Presence with Socket.IO: authenticated sockets; keep a Map of userId to connected socket ids so multiple tabs work; a verified doctor with presenceMode auto is online while at least one socket is connected; when the last socket disconnects wait PRESENCE_GRACE_SECONDS before marking offline (cancel the timer if they reconnect); update Doctor.isOnline and lastSeenAt; broadcast "doctor:presence" {doctorId, isOnline} to the room "presence-watchers"; clients join it with the event "presence:subscribe". On server start reset all isOnline flags to false. If presenceMode is offline, never show online.
4. Tests: fee limits, overlapping availability rejected, slot generation across timezone and exceptions, presence grace and multi-tab behaviour (use real socket.io-client connections in the test), unverified doctor cannot appear in lists.

WEB
5. /doctors: cards listing name, specialty, bio excerpt, fee per mode, and a live status badge with text "Online" or "Offline" plus an icon (never colour alone) that updates in real time through the socket. Filters for specialty and online only. No ratings, no review counts, no photos (use a square initials block).
6. /doctors/[id]: profile, fees, a date picker with real slots, and the booking panel (Step 22 and 23 complete the booking).
7. /doctor/dashboard (doctor role): online/offline toggle with explanation, today's appointments, pending requests (real, from the API), quick links.
8. /doctor/availability: weekly editor and exception dates. /doctor/fees: three fee inputs with the min and max shown from config. Validation messages are specific.
9. Unverified doctors see a clear "Awaiting verification" screen and cannot edit public details.
```

### Verify in the IDE
1. Register a second real account as a doctor; verify it from the admin account (Step 4 endpoints, or the admin page later). Log in as the doctor in one browser and set fees and availability.
2. In a second browser profile, log in as the patient and open `/doctors`: the doctor shows **Online**.
3. Close the doctor's tab. After `PRESENCE_GRACE_SECONDS` the badge changes to **Offline** on the patient's screen **without reloading**.
4. Open the doctor's dashboard in two tabs, close one: the doctor stays online. Close both: offline after the grace period.
5. Turn on "appear offline" in the doctor dashboard: the patient sees Offline immediately even while the doctor is connected.
6. Try fees below the minimum → clear error. Overlapping availability → clear error.
7. Compass → `doctors` shows paise values, `availabilities` shows ranges.

**Expected result:** live, truthful doctor presence and real schedules and fees.

### Commit and push
```bash
git add -A && git commit -m "Step 21: Doctor profiles, availability, fees and live presence" && git tag step-21 && git push origin main --tags
```

---

## Step 22: Appointments and Nodemailer emails (offline doctor flow)

**IDE + Model:** Use Cursor — Grok 4.6. *(Fallback: Antigravity — Claude Sonnet 4.6 (Thinking).)*

**Objective:** When a doctor is offline, the patient sends a request. The doctor is emailed, sets a time on the dashboard, and the patient is emailed the confirmed time.

### 22A. SMTP check (do this yourself first)
Fill `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` in `api/.env` (Gmail with an app password, from Step 1). `MAIL_FROM` must be an address your SMTP account is allowed to send from.

### Prompt to paste
```text
Implement appointments and email notifications.

EMAIL SERVICE (api/src/services/mailer.js)
1. Nodemailer transporter from env; call transporter.verify() at startup and log the result clearly (do not crash the app if it fails, but expose the state in GET /health as mail: ok|failed).
2. Templates in api/src/templates/ as plain text plus simple HTML (no images, no tracking pixels, no emoji, no em dashes), one file per email: request_to_doctor, request_received_to_patient, confirmed_to_patient (time in the PATIENT's timezone and the doctor's, payment deadline from PAYMENT_WINDOW_MINUTES, a link to pay), confirmed_to_doctor, payment_received_to_doctor, receipt_to_patient (amount, order id, payment id; no card data), cancelled, expired, reminder (used in Step 25). Subject lines are plain ("New consultation request", "Your appointment is confirmed for <date and time>"). Emails never contain photos, measurements or diagnoses, only the mode, time, a first name and a link to sign in.
3. Every send is recorded in EmailLog (template, to, status, messageId, error). Failures are caught, logged, and retried once; a failed email never breaks the API request, but the UI must show "We could not send the email" where relevant.

APPOINTMENT RULES (api/src/routes/appointments.js)
4. POST /appointments {doctorId, mode, caseId (optional), note (optional), scheduledAt (optional)}.
   - If the doctor is ONLINE and the patient chose "talk now": create kind=instant, status=awaiting_payment (Step 23 handles payment, then the session starts).
   - If the doctor is OFFLINE: create kind=scheduled, status=requested, and email the doctor (request_to_doctor) with a link to /doctor/dashboard. Also email the patient (request_received_to_patient).
   - If the patient picks a free slot from GET /doctors/:id/slots (doctor online or offline): create kind=scheduled with that scheduledAt as the requested time and status=requested. The doctor accepts it, or proposes another time, through the schedule endpoint in item 5.
5. PATCH /appointments/:id/schedule (doctor): {scheduledAt, durationMin}; validate that the time is in the future, inside availability, and not overlapping another awaiting_payment, paid or in_progress appointment of this doctor (do this atomically so two parallel requests cannot double-book: use a unique index on doctorId plus scheduledAt for active statuses and handle the duplicate key error as 409). On success set confirmedAt (the time the doctor set), set status=awaiting_payment, set a payment deadline (PAYMENT_WINDOW_MINUTES), and email the patient (confirmed_to_patient).
6. PATCH /appointments/:id/cancel (patient or doctor, with reason) and automatic expiry of awaiting_payment appointments after the payment window (a node-cron job every minute): status expired, slot released, patient emailed.
7. GET /appointments (own, filter by status), GET /appointments/:id.
8. Consent: when a case is attached, require the patient's consent to share it with that doctor (POST /consents {doctorId, caseId}); store in Consent; the patient can revoke at any time (DELETE /consents/:id), and access to the case ends immediately.
9. All state changes write AuditLog entries.
10. Tests: instant vs scheduled path, double-booking race (two parallel schedule requests, exactly one succeeds), expiry job, email sent calls recorded (test database from MONGODB_URI_TEST and a real SMTP inbox you own), forbidden transitions rejected.

WEB
11. Booking panel on /doctors/[id]: choose mode (chat, audio, video) with the fee shown, optionally attach a case (with a clear consent statement), then either "Talk now" (online doctor) or "Send request" (offline doctor) with plain text explaining what happens next. After sending, the request appears under /appointments with its real status.
12. /appointments for patients and doctors: tabs for upcoming, requests, past; doctors get a "Set time" dialog (date and time from their availability, duration) on pending requests.
```

### Verify in the IDE
1. Check the server log at startup: `mail: ok` (or the SMTP error to fix) and `GET /health` shows it.
2. Turn the doctor **offline** (appear offline). As the patient, send a request. Within seconds the **doctor's real inbox** receives the email with a working link. The patient's inbox receives the "request received" email.
3. As the doctor, open the dashboard → Set time → submit. The patient's inbox receives "Your appointment is confirmed for ..." showing the correct local time.
4. Open both emails in the raw view: no photos, no health details.
5. Compass → `appointments` shows the status change; `emaillogs` shows `sent` entries with message ids.
6. Try double-booking: open two doctor tabs and set the same time for two patients' requests at the same moment → one is rejected with a clear conflict message.
7. Leave an appointment in awaiting payment past the window → it becomes `expired` and the patient receives an email.
8. `npm test` passes.

**Expected result:** a real, email-driven offline flow with safe scheduling and consent.

### Commit and push
```bash
git add -A && git commit -m "Step 22: Appointments, scheduling rules and Nodemailer notifications" && git tag step-22 && git push origin main --tags
```

---

## Step 23: Razorpay payments (test mode, verified on the server)

**IDE + Model:** Use Antigravity — Claude Sonnet 4.6 (Thinking). *(Fallback: Cursor — Grok 4.6.)*

**Objective:** Charge the doctor's fee for chat, audio or video with Razorpay, verify every payment on the server, and unlock the session only after verification.

### 23A. Do this yourself first
1. Razorpay dashboard in **Test Mode**: copy Key Id and Key Secret into `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
2. Webhooks need a public HTTPS URL while you develop locally. Install a tunnel (for example `ngrok http 5000` or a Cloudflare Tunnel) and copy the HTTPS URL.
3. Razorpay dashboard → Settings → Webhooks → add `https://<your-tunnel>/payments/webhook`, choose the events `payment.captured`, `payment.failed`, `order.paid`, set a secret, and put the same secret in `RAZORPAY_WEBHOOK_SECRET`.
4. Test payment details come from Razorpay's own test documentation (search "Razorpay test card details" on razorpay.com/docs). Use only those in Test Mode.

### Prompt to paste
```text
Implement payments with Razorpay in api/ and web/.

API
1. POST /payments/order {appointmentId} (patient who owns the appointment; status must be awaiting_payment and within the payment window): compute the amount ONLY from the doctor's stored fee for that mode (never trust an amount from the client), create a Razorpay order with razorpay.orders.create({amount in paise, currency INR, receipt: appointmentId, notes: {appointmentId}}), save a Payment (status created, razorpayOrderId, amountPaise), and return {orderId, amount, currency, keyId}. Reuse the existing unpaid order if one already exists for this appointment.
2. POST /payments/verify {razorpay_order_id, razorpay_payment_id, razorpay_signature}: verify the signature with HMAC SHA256 over "orderId|paymentId" using the key secret and a timing-safe comparison; the order must belong to this patient. On success: Payment.status=paid, signatureVerified=true, appointment.status=paid (for instant appointments set in_progress when both sides join), email the receipt (receipt_to_patient) and payment_received_to_doctor, audit log. On failure respond 400 and keep the appointment awaiting_payment.
3. POST /payments/webhook: use the RAW request body (express.raw for this route only), verify the X-Razorpay-Signature header with RAZORPAY_WEBHOOK_SECRET, handle payment.captured, order.paid and payment.failed idempotently (record each event id in Payment.webhookEvents and ignore repeats). The webhook is the backup path: if the browser closed before /payments/verify, the webhook still marks the appointment paid.
4. Admin refund: POST /admin/payments/:id/refund {amountPaise optional, reason} calling razorpay.payments.refund, updating Payment.status=refunded, emailing the patient, audit log. Refund rules text comes from REFUND_POLICY_TEXT; the code does not decide eligibility.
5. Money safety: use integers in paise everywhere, never floats; store currency; never log the key secret or webhook secret; rate limit the payment routes.
6. Tests: tampered signature rejected, wrong user rejected, amount cannot be changed by the client, duplicate webhook is idempotent, expired appointment cannot create an order, webhook with invalid signature returns 400. Generate valid signatures in tests with the real secret from the test env (crypto HMAC), not hard-coded strings.

WEB
7. On /appointments (or the booking page) show a "Pay" button for awaiting_payment appointments with the amount and the remaining time in the payment window. Load https://checkout.razorpay.com/v1/checkout.js on demand, open Checkout with the order from the API, and on success call /payments/verify. Show clear states: paying, verifying, paid, failed (with a retry), and expired.
8. After payment the page shows the receipt details (amount, order id, payment id) and a button to "Join session" when the session is available (Step 24).
```

### Verify in the IDE
1. Start the tunnel and confirm Razorpay shows the webhook as active.
2. As a patient, request an **online** doctor (Talk now), click Pay, complete payment with Razorpay's **test** details. The page shows **Paid**; Compass `payments` shows `status: paid`, `signatureVerified: true`; the doctor and patient both receive their emails.
3. In the Razorpay dashboard (Test Mode) the payment appears with the same ids.
4. Webhook test: complete a payment and **close the browser tab before the redirect**. A few seconds later the appointment is still marked paid (via the webhook).
5. Tamper test: in DevTools, edit the signature in the verify request (Network → Copy as cURL → change one character) → `400`.
6. Fee test: change the fee in the doctor's dashboard, then create a new order: the amount follows the new fee.
7. Admin refund of a test payment: Razorpay dashboard shows the refund; the patient gets an email.
8. `npm test` passes.

**Expected result:** real, verified, idempotent payments in test mode with fees that come from the database.

### Commit and push
```bash
git add -A && git commit -m "Step 23: Razorpay payments with signature verification and webhooks" && git tag step-23 && git push origin main --tags
```

---

## Step 24: Real-time chat, WebRTC audio and video calls, and consent-based case sharing

**IDE + Model:** Use Antigravity — Claude Opus 4.6 (Thinking). *(Fallback: Claude Sonnet 4.6 (Thinking).)*

**Objective:** After payment, the patient and doctor can chat, or start an audio or video call, with the patient's case visible to the doctor only under consent.

### 24A. Optional TURN server (do this if calls fail between different networks)
WebRTC connects directly when it can. Strict networks need a TURN relay. Use a TURN service you trust (for example a hosted free tier or your own coturn server), then fill `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` in `api/.env`. Public STUN (`STUN_URLS`) is already set. You will find out whether you need TURN in the Verify step 5 below.

### Prompt to paste
```text
Implement sessions in api/ (Socket.IO) and web/.

ACCESS RULES (server side, every event)
1. A session for an appointment can open only if: the user is the appointment's patient or doctor; status is paid or in_progress; for scheduled appointments the current time is within [scheduledAt - SESSION_GRACE_MINUTES, scheduledAt + durationMin + SESSION_GRACE_MINUTES]; instant appointments are open for durationMin from the first join (durationMin comes from config per mode). Reject everything else with a clear error event.
2. When both have joined, set status=in_progress; when the doctor ends the session or time is over, set completed and notify both.

CHAT
3. Room appointment:<id>. Events: chat:join, chat:history (last messages from the Message collection), chat:message (validated length, saved, delivered to the room), chat:typing. Text is rendered ESCAPED on the client (no HTML). Messages persist; reconnecting restores history.

CALLS (WebRTC with Socket.IO signalling)
4. GET /rtc/config (auth required) returns iceServers built from STUN_URLS and, if set, TURN_URL with TURN_USERNAME and TURN_CREDENTIAL. Never hard-code servers in the client.
5. Signalling events: rtc:ready, rtc:offer, rtc:answer, rtc:ice. Only relay between the two participants of that appointment. One call per appointment at a time.
6. Web: /consult/[appointmentId] page with: chat panel always; for audio and video appointments a call panel using getUserMedia (audio only for audio mode), local and remote streams, mute, camera on and off (video mode), end call, connection state shown in text, clear permission-denied and device-not-found messages, automatic ICE restart on connection failure, cleanup of tracks on leave.
7. A countdown shows the remaining session time.

CASE SHARING
8. If the appointment has a caseId and the patient's consent is active, the doctor sees a "Patient case" side panel (read-only version of /cases/[id]) inside the session. Without consent, the panel says the patient has not shared a case. The patient can revoke consent during the session and the panel disappears for the doctor immediately (emit an event). Every doctor view of a case writes an AuditLog entry.
9. After the session the doctor can write a short summary visible to the patient (stored on the Appointment) and use the Feedback form on the case.

TESTS
10. Socket tests with real socket.io-client connections: unauthorised user rejected, outside time window rejected, message persisted and received by both, signalling not relayed to a non-participant, consent revocation removes access.
```

### Verify in the IDE
1. Use two **different browser profiles** (or two devices) logged in as the paid patient and the doctor. Open the paid appointment on both and press **Join session**.
2. **Chat:** send messages both ways; reload one side: history returns. Send `<b>test</b>`: it shows as plain text.
3. **Audio mode:** both sides hear each other (use headphones to avoid echo). Mute works.
4. **Video mode:** both video streams show; camera off works; End call stops the camera light.
5. **Different networks:** put one device on a phone hotspot and the other on home Wi-Fi. If the call does not connect, add TURN (24A) and retest.
6. As the patient, attach a case and grant consent: the doctor sees the case panel. Revoke it: the panel disappears for the doctor without a reload. Compass → `auditlogs` shows the doctor's views.
7. Try opening the session URL as a third account → refused. Try opening it long before the scheduled time → refused with a clear message.
8. `npm test` passes.

**Expected result:** a working real-time consultation room with persistent chat, real calls and consent-controlled case access.

### Commit and push
```bash
git add -A && git commit -m "Step 24: Realtime chat, WebRTC calls and consent-based case sharing" && git tag step-24 && git push origin main --tags
```

---

## Step 25: Printable report, follow-up reminders and appointment reminders

**IDE + Model:** Use Antigravity — Claude Sonnet 4.6 (Thinking). *(Fallback: Gemini 3.8 Flash (Medium).)*

**Objective:** A case report patients can save as PDF (correct Tamil and Hindi text), reminders to re-photograph a spot, and reminders before appointments.

**Design decision:** the PDF is produced with the browser's own print engine from a print-styled page. This renders Tamil and Hindi correctly, needs no PDF library and no extra server, and uses the same real data as the results page.

### Prompt to paste
```text
Implement the report and the reminder jobs.

REPORT (web)
1. Route /cases/[id]/report: an A4 print layout (CSS @media print, page size A4, margins, no navigation, no backgrounds that waste ink). Contents, all from the API: organisation name and date, the disclaimer, patient first name and age band only (not email or phone), the case label, body site, photo date, the photo with the overlay, the result block for each relevant team (likelihood with range and band, or trajectory, or possible conditions), ABCDE table with raw values and percentile ranks, agreement counts, warning signs, safety decision and reasons, the explanation in the selected language with its source, model versions and the date of analysis, and a footer "Decision support only. A doctor makes the diagnosis."
2. A "Download report" button on the case page opens this route and calls window.print(); explain in one line that the user can choose "Save as PDF". The language selector on the report page uses the existing explanation endpoint.
3. Font files for Tamil and Hindi come from the system or from next/font (Noto Sans Tamil and Noto Sans Devanagari, self-hosted at build time) so printing works on every device.

JOBS (api, node-cron, in src/jobs/)
4. appointmentReminders: every minute, find paid or awaiting_payment scheduled appointments starting in about 24 hours and about 1 hour (window width from config) whose reminderSent flag is false; send the reminder email to both parties; set the flag atomically so no duplicate is ever sent, even with two server instances.
5. followUpReminders: daily, find cases with followUpAt due and no newer case with the same lesionLabel; email the patient "Time to photograph <label> again" with a link to /cases/new?label=<label>. Never put health results in the email.
6. retentionCleanup: daily, delete case images, artifacts and records older than RETENTION_CASE_DAYS, and audit logs older than RETENTION_AUDIT_DAYS, writing one summary audit entry per run.
7. All jobs log their results and are safe to run twice. Add an admin-only endpoint POST /admin/jobs/:name/run for manual runs during testing.
8. Tests: the reminder job sends exactly once; retention job deletes old test records and files created with an old date, and leaves newer ones.
```

### Verify in the IDE
1. Open a completed case → **Download report** → the print preview shows an A4 layout with the real photo, overlay and numbers. Choose Save as PDF and open the file.
2. Switch the language to Tamil and Hindi and print again: the characters render correctly in the PDF (no boxes).
3. Create a scheduled, paid appointment about 1 hour ahead (set the time as the doctor). Run the job from the admin endpoint, or wait a minute: both inboxes receive one reminder. Run again: no duplicate.
4. Set a follow-up of 1 day on a case, change `followUpAt` in Compass to a past date, run the follow-up job: the patient receives the email, which contains no health results.
5. Create an old record in the test database with an old date and run the retention job: it is removed with its files.

**Expected result:** a real saved-PDF report in three languages and reliable, non-duplicated reminders.

### Commit and push
```bash
git add -A && git commit -m "Step 25: Printable report, follow-up and appointment reminders" && git tag step-25 && git push origin main --tags
```

---

## Step 26: Privacy tools, admin console and the Model performance page

**IDE + Model:** Use Antigravity — Claude Sonnet 4.6 (Thinking). *(Fallback: Cursor — Grok 4.6.)*

**Objective:** Make the privacy policy true (export and delete), give the admin a working console, and publish an honest Model performance page built from the real evaluation files.

### Prompt to paste
```text
Implement the three areas below.

PRIVACY TOOLS (api and web)
1. GET /me/export: returns a JSON file with everything stored about the signed-in user: account, patient profile, cases and analyses, wound measurements, appointments, payments (ids and amounts), messages, consents, feedback given, and audit entries about them. Images are included as a downloadable zip streamed from storage. Requires a fresh login (re-enter password) before export.
2. DELETE /me: requires password; sets deletionRequestedAt and signs the user out everywhere; a daily job permanently deletes the account after DELETION_GRACE_DAYS (images, cases, analyses, messages, consents, tokens), keeping only payment records in anonymised form because of financial record keeping, and says so in the Privacy Policy. The user can cancel deletion by logging in during the grace period.
3. Settings page /settings/privacy: shows the data held, buttons "Download my data" and "Delete my account" with plain explanations, current consents, the accepted terms version, and withdraw consent for case sharing per doctor.
4. Re-verify every statement in /privacy and /terms against docs/DATA_FLOW.md and the code now that these features exist; update the checklist created in Step 19 and fix any statement that is not true.

ADMIN CONSOLE (/admin, admin role only)
5. Pages: Doctor verification (pending, verified, rejected with the registration number visible), Users (search, deactivate), Payments (list, refund action from Step 23), Email log, Audit log (filter by actor, action, date), Jobs (run manually). Every table is real data, paginated, with empty states.

MODEL PERFORMANCE PAGE (public /performance)
6. Create ai-service/training/evaluate.py that gathers every file in models/metrics/*.json into models/metrics/summary.json with the date, git commit, dataset names, split sizes and the exact metrics. Add GET /v1/metrics to the AI service and GET /metrics/models to the Node API (cached, public) returning this summary and the list of disease classes in use.
7. The page shows, in plain language with a table per model team: what the model was trained on (dataset names, licences, sizes), how it was tested (held-out split, grouped by lesion where relevant), the real numbers (balanced accuracy, melanoma recall, AUROC, Brier score, calibration error, Dice for wound segmentation, abstention rate), a calibration plot image generated by the training scripts, the known limitations (dermoscopy versus phone photos, skin tone coverage of the datasets, patient overlap in FUSeg, rule-based ulcer thresholds needing clinician review, Tamil and Hindi text needing native review), the dates, and the list of possible skin conditions. No claims that are not in the files. If a metric file is missing, the page says "Not evaluated" for that item.
8. Add dataset citations and licences (HAM10000 non-commercial and citation, DermNet, FUSeg, DINOv2, MedSAM) at the bottom.
```

### Verify in the IDE
1. Log in as a patient → `/settings/privacy` → **Download my data**: the JSON and zip contain your real records.
2. Request deletion on a throwaway real account (a second email you own). Log in again within the grace period → the banner offers to cancel. Set `deletionRequestedAt` back in Compass past the grace period and run the deletion job from the admin page: the account, images, cases and messages are gone, `payments` keep only anonymised entries.
3. Log in as admin: verify a pending doctor, open the audit log and filter by action, refund a test payment.
4. Open http://localhost:3000/performance: every number matches `models/metrics/summary.json`. Rename one metrics file temporarily: that item shows "Not evaluated". Restore it.
5. Open `/privacy` and confirm the deletion and export statements now match the app's behaviour.

**Expected result:** a privacy policy that is true, a usable admin console, and a public page whose numbers all come from your own evaluation.

### Commit and push
```bash
git add -A && git commit -m "Step 26: Privacy tools, admin console and model performance page" && git tag step-26 && git push origin main --tags
```

---

## Step 27: Hardening, accessibility, scan scripts, Docker and documentation

**IDE + Model:** Use Antigravity — Claude Opus 4.6 (Thinking) for the security and Docker work, then **Use VS Code — GitHub Copilot Free Tier** for the README polish at the end. *(Fallback for Opus: Claude Sonnet 4.6 (Thinking).)*

**Objective:** Close security gaps, add the two enforcement scripts below, create Docker files and a README that lets a stranger run the project from a clean checkout.

### 27A. Create the two scan scripts yourself (exact contents)

**`scripts/scan_placeholders.sh`**
```bash
#!/usr/bin/env bash
# Fails if placeholder, mock or unfinished-code markers, or hardcoded secrets, are found in source files.
cd "$(dirname "$0")/.." || exit 2

INCLUDES=(--include=*.js --include=*.mjs --include=*.ts --include=*.tsx --include=*.jsx --include=*.py --include=*.yaml --include=*.yml --include=*.json --include=*.css --include=*.html --include=*.sh)
EXCLUDES=(--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=.venv --exclude-dir=__pycache__ --exclude-dir=data --exclude-dir=storage --exclude-dir=models --exclude-dir=coverage --exclude-dir=playwright-report --exclude-dir=tests --exclude-dir=e2e --exclude=package-lock.json --exclude=scan_placeholders.sh --exclude=check_copy.py)
MARKERS='TODO|FIXME|XXX|HACK|lorem ipsum|dummy|mock|fake|placeholder|sample data|hardcoded|changeme|your_api_key|your-api-key|NotImplemented|coming soon'
SECRETS='rzp_(test|live)_[A-Za-z0-9]{8,}|gsk_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|mongodb(\+srv)?://[^[:space:]"$]+:[^[:space:]"$@]+@|-----BEGIN [A-Z ]*PRIVATE KEY-----|hf_[A-Za-z0-9]{30,}'
fail=0

echo "== Placeholder and unfinished-code markers =="
out=$(grep -rIniE "$MARKERS" "${INCLUDES[@]}" "${EXCLUDES[@]}" . | grep -vE 'placeholder[=:-]|::placeholder')
if [ -n "$out" ]; then echo "$out"; fail=1; else echo "none found"; fi

echo "== Hardcoded secrets =="
out=$(grep -rIniE "$SECRETS" "${INCLUDES[@]}" "${EXCLUDES[@]}" .)
if [ -n "$out" ]; then echo "$out"; fail=1; else echo "none found"; fi

echo "== Committed env files =="
out=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$')
if [ -n "$out" ]; then echo "$out"; fail=1; else echo "none found"; fi

exit $fail
```
(The `placeholder` filter allows only the HTML and Tailwind `placeholder` attribute and utility, which are legitimate in forms.)

**`scripts/check_copy.py`**
```python
#!/usr/bin/env python3
"""Copy and design lint for SkinSentry. Exits with code 1 if any rule is violated."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCAN_DIRS = ["web/src", "web/public", "api/src", "ai-service/app/llm", "ai-service/config"]
TEXT_EXT = {".ts", ".tsx", ".js", ".mjs", ".jsx", ".css", ".html", ".json", ".yaml", ".yml", ".txt"}
SKIP_PARTS = {"node_modules", ".next", "__pycache__", ".venv", "tests"}

RULES = [
    ("em or en dash", re.compile("[\u2014\u2013]")),
    ("emoji", re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B50\u2B55\uFE0F]")),
    ("pill or large rounding", re.compile(r"rounded-(full|xl|2xl|3xl)|9999px|border-radius:\s*(50%|999)")),
    ("gradient", re.compile(r"gradient\(|bg-gradient|from-\[|via-\[")),
    ("purple family", re.compile(r"\b(purple|violet|indigo|fuchsia)\b", re.I)),
    ("scroll or heavy animation", re.compile(r"framer-motion|gsap|lottie|IntersectionObserver|animate-(?!spin)|data-aos|parallax")),
    ("cursor effects", re.compile(r"cursor:\s*(url|none)|cursor-none|mousemove")),
    ("banned marketing words", re.compile(r"\b(revolutionize|revolutionary|cutting-edge|seamless(ly)?|empower(s|ing)?|unlock(s|ing)?|next-generation|game-changing|supercharge|leverage|elevate|world-class|state-of-the-art|your journey)\b", re.I)),
    ("fake social proof", re.compile(r"testimonial|trusted by|happy customers|\d[\d,]*\+?\s+(users|patients|doctors|clinics|customers)", re.I)),
]

problems = 0
for d in SCAN_DIRS:
    base = ROOT / d
    if not base.exists():
        continue
    for path in base.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_EXT:
            continue
        if SKIP_PARTS & set(path.parts):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for lineno, line in enumerate(text.splitlines(), start=1):
            for name, pattern in RULES:
                if pattern.search(line):
                    problems += 1
                    print(f"{path.relative_to(ROOT)}:{lineno}: {name}: {line.strip()[:120]}")

if problems:
    print(f"\n{problems} problem(s) found.")
    sys.exit(1)
print("Copy and design check passed.")
```

Make the shell script runnable: `chmod +x scripts/scan_placeholders.sh`. Run both from the repo root:
```bash
bash scripts/scan_placeholders.sh
python scripts/check_copy.py
```
Fix every finding in the code (never by weakening the scripts).

### Prompt to paste
```text
Harden and document the project. Do the following and show command output for each.

SECURITY
1. API: helmet with a Content Security Policy for the Next.js app (allow only self plus checkout.razorpay.com for scripts and frames, and the API and socket origins), HSTS in production, CORS limited to CLIENT_URL, cookie flags (httpOnly, sameSite, secure in production), request size limits, rate limits on auth, uploads, payments and messages, NoSQL injection protection (reject keys starting with $ or containing dots in bodies and queries), consistent error handling that never leaks stack traces in production.
2. Dependency audit: run npm audit in api and web, pip-audit in ai-service, and fix or document every high or critical finding.
3. Secret scan: confirm no secrets in git history (git log -p search for the key patterns; if any key was ever committed, rotate it and tell me).
4. Web: error and not-found pages, no console errors, no secrets in the client bundle (search .next output for key names).

ACCESSIBILITY AND DESIGN
5. Fix every finding from scripts/check_copy.py. Add Playwright + axe tests in web/e2e/a11y.spec.ts that open every public page and every signed-in page and fail on any serious or critical axe violation. Add web/e2e/design.spec.ts that, on every page, asserts: all button and link-as-button elements have computed border-radius of 6px or less; no element has a background-image containing "gradient"; no element animates other than the spinner; fonts load. Run both.

OPERATIONS
6. Create Dockerfiles for ai-service (CPU torch by default, note GPU variant), api and web; docker-compose.yml that runs the three services with env files, a models volume mounted from ./models, and a storage volume; MongoDB is external (Atlas) so the compose file does not include it. Document the build and run commands.
7. Create scripts/train_all.sh that runs, in order: validate datasets, make_splits all, compute_quality_thresholds, extract_embeddings, train_nurses, train_cancer, train_ulcer, train_disease, train_seniors, evaluate. It stops on the first error. Also create scripts/fetch_models.py: it downloads the zip of the models/ folder from MODELS_ARCHIVE_URL (env; a private Hugging Face repo file or any private storage link you control, with the token read from env), unpacks it into models/, and verifies every file's sha256 against models/MANIFEST.json. Document in the README how to produce and upload that zip after training.
8. Add GET /health to the web app routes (or reuse Next's) and make the API /health report db, mail, and AI service reachability.

DOCUMENTATION
9. Write README.md: what the project is, the disclaimer, prerequisites, how to get every dataset (links from the plan), how to train (Colab and local), the environment variables and how to obtain each credential, how to run each service, how to run tests and the scan scripts, how to deploy with Docker, the project structure, known limitations, and dataset and model licences and citations. No placeholder text.
10. Write docs/MODEL_CARDS.md from models/metrics/summary.json: one card per team with data, method, metrics, limitations.
```

### Verify in the IDE
1. `bash scripts/scan_placeholders.sh` → all three sections print `none found`, exit code 0 (`echo $?`).
2. `python scripts/check_copy.py` → "Copy and design check passed."
3. From `web/`: `npx playwright test` → accessibility and design tests pass.
4. `npm audit --omit=dev` in `api/` and `web/`; `pip-audit` in `ai-service/` → no unresolved high or critical items.
5. `docker compose build` succeeds. `docker compose up` brings up the three services; `/health` of each returns OK.
6. Open the README and follow only its first two sections on a second computer or fresh folder (the full clean-setup test is in the Testing Phase).

**Expected result:** a hardened, accessible, documented project with automatic checks that enforce your no-placeholder and design rules.

### Commit and push
```bash
git add -A && git commit -m "Step 27: Hardening, accessibility, scan scripts, Docker and documentation" && git tag step-27 && git push origin main --tags
```

---

# PART B: TESTING PHASE

> Do not start this phase until Step 27 is committed. Record every result, screenshot path and fix in `docs/TEST_REPORT.md` (create it in T1). **Rule for the whole phase:** when a test fails, fix the real cause in the code, re-run the failing test and the tests around it, then commit with the message `Fix (Tn): <what was fixed>`. Never weaken a test, a threshold or a scan script to make it pass.

**Test accounts are real:** create three real accounts through the UI (a patient, a doctor verified by the admin, and the admin from `.env`) using email addresses you own. Put their credentials only in `web/e2e/.env.e2e` (git-ignored) as `E2E_PATIENT_EMAIL`, `E2E_PATIENT_PASSWORD`, `E2E_DOCTOR_EMAIL`, `E2E_DOCTOR_PASSWORD`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, and `E2E_IMAGE_DIR` (a folder with your own consented photos and a few dataset images). Tests read these values; none are written in code.

---

## T1: Static checks, scans and test baseline

**IDE + Model:** Use Antigravity — Gemini 3.8 Flash (Medium). *(Fallback: VS Code — GitHub Copilot Free Tier.)*

```text
Create docs/TEST_REPORT.md with sections T1 to T10 and a results table (Test, Date, Result, Evidence, Fix commit). Then run and record the output of each command below, fix every problem found, and re-run until clean:
1. bash scripts/scan_placeholders.sh
2. python scripts/check_copy.py
3. ESLint and TypeScript type check in web/ (npx tsc --noEmit), ESLint in api/
4. ruff or flake8 in ai-service/ (add ruff to requirements-dev if missing)
5. npm audit --omit=dev in api/ and web/, pip-audit in ai-service/
6. Full unit test runs: pytest in ai-service/, npm test in api/
7. Search the whole repo (excluding node_modules, data, models) for: console.log of variables that may hold tokens or patient data, commented-out code blocks, empty catch blocks, hardcoded http://localhost URLs outside env files and tests, hardcoded email addresses, hardcoded numbers used as thresholds in ai-service/app (they must come from config).
Report each finding and the fix.
```
**Verify:** every command exits with code 0 and the report table is filled with real output. **Commit:** `git add -A && git commit -m "Testing T1: Static checks, scans and baseline" && git push origin main`

---

## T2: AI service and model tests (success and failure)

**IDE + Model:** Use Antigravity — Claude Sonnet 4.6 (Thinking). *(Fallback: GPT-OSS 120B (Medium).)*

```text
Write and run an exhaustive test suite for the AI service in ai-service/tests/test_e2e_pipeline.py and ai-service/tests/test_invalid_inputs.py using REAL images from data/raw and from E2E_IMAGE_DIR.

SUCCESS CASES
1. One real image per domain (HAM10000, FUSeg, DermNet) returns the right nurse relevant, a schema-valid response, finite numbers, likelihood low <= point <= high, ABCDE percentiles in [0,1], mask size equal to the image size.
2. The same image twice gives identical outputs (determinism) except timing and request_id.
3. Prior photo supplied (a real second photo of the same lesion if available, otherwise the same image transformed by a real rotation and shift as a test construction) gives non-null change values; without it, change is null with a reason.
4. Explanation in en, ta, hi validates (numbers match) and the fallback template path works when GROQ is unreachable (set an invalid GROQ_BASE_URL for this test).

FAILURE AND EDGE CASES (each must return the exact documented status and message, never a stack trace)
5. No API key 401, wrong key 403, missing image 422, zero-byte file, corrupt JPEG, a PDF renamed to .jpg (415), an image over the size limit (413), a 1x1 image, a very large resolution image, a CMYK or palette PNG, an image with EXIF rotation, grayscale image.
6. patient_context with invalid JSON, missing keys, negative age, impossible pxPerCm, unknown body site.
7. prior_image corrupt or from a different body site: change null with reason, request still succeeds.
8. Model file missing or altered (temporarily rename one model file or change one byte in a copy, use a temp MODELS_DIR): startup refuses with a clear error and /health reports it; the sha256 check detects tampering.
9. Concurrency: 8 parallel requests all succeed; memory does not grow without bound over 50 sequential requests (record peak memory).
10. Latency: record p50 and p95 per stage on this machine and write them to docs/TEST_REPORT.md.
Run everything; fix failures in the code, not the tests.
```
**Verify:** `pytest -q` in `ai-service/` is all green; the report has the latency table. **Commit:** `git add -A && git commit -m "Testing T2: AI service end-to-end and invalid input tests" && git push origin main`

---

## T3: API tests (auth, access control, cases, network failures)

**IDE + Model:** Use Cursor — Grok 4.6. *(Fallback: Antigravity — Claude Sonnet 4.6 (Thinking).)*

```text
Extend the Vitest + Supertest suite in api/src/tests/ (test database from MONGODB_URI_TEST, real AI service running).

1. AUTH: register and login success; duplicate email; weak password; SQL or NoSQL injection strings in every field ({"$gt":""} as password, "$ne" operators); token expired (start the API with JWT_EXPIRES_IN=2s, wait, expect 401 and a successful refresh); refresh token reuse after rotation is rejected; logout invalidates the refresh token; tampered JWT; JWT signed with another secret; deactivated user.
2. ROLE MATRIX: write one table-driven test that calls every route with each of: no token, patient, patient of another account, doctor unverified, doctor verified, admin, and asserts the expected status for each. Every route in the API must appear in the table; fail the test if a route exists that is not listed.
3. CASES: wrong type, oversize, missing fields, invalid dates, huge JSON context, path traversal in artifact names (../../.env), IDOR (another patient's case, image, artifact, explanation, report), delete removes files from disk, prior linking correctness.
4. FAILURES: stop the AI service during an upload (case becomes failed with retries and a readable error); AI returns 5xx (use a real failure by sending a request that triggers it, not a stub); MongoDB connection lost mid-request (start with a wrong URI in a child process) returns 503 and recovers; SMTP wrong password does not break the API request and is logged in EmailLog as failed; invalid Razorpay keys produce a handled 502 with a clear message.
5. RATE LIMITS: login, upload and payment routes return 429 after the configured limit.
Run all tests, fix failures in the code, and add the route list and results to docs/TEST_REPORT.md.
```
**Verify:** `npm test` all green; the route matrix test lists every route. **Commit:** `git add -A && git commit -m "Testing T3: API authentication, access control and failure tests" && git push origin main`

---

## T4: Patient journey, end to end in a real browser

**IDE + Model:** Use Antigravity — Claude Sonnet 4.6 (Thinking), with the Antigravity browser agent for the manual navigation checks. *(Fallback: Gemini 3.8 Flash (Medium).)*

```text
Create Playwright tests in web/e2e/patient.spec.ts (config: baseURL from env, webServer entries that start web, api and ai-service, trace on first retry, screenshots saved to docs/qa/). Read credentials and image folder from web/e2e/.env.e2e. Write the tests as a real user would act:

1. Visit /, read the hero, click "How it works", open Privacy and Terms from the footer.
2. Register a NEW patient with a unique email alias of the E2E address (for example plus-addressing if your provider supports it) and check validation errors (empty fields, weak password, missing consents).
3. Log in, create a case with a real lesion image, wait for completion using real status updates, and assert: result cards are visible, the likelihood text has a number and a range, the radar and table agree, the agreement view shows counts or the "not available" message, overlays toggle, explanation tabs switch languages.
4. Upload a blurry image: the abstain banner and tips appear. Upload a landscape photo: the "does not look like..." message appears. Upload a .txt file: client and server errors are shown clearly.
5. Create two cases with the same lesion label (ulcer image, two different dates) and check the trajectory and the chart.
6. Open the report page and trigger print to PDF (Playwright page.pdf) and check the file is not empty.
7. Delete a case and confirm it disappears and its files are gone.
8. Settings: export data, then request deletion and cancel it.
9. Mobile viewport (360x800) run of steps 1 to 3.
Then use the Antigravity browser agent to repeat steps 1 to 3 manually and list anything that feels confusing, slow, or inconsistent with the copy rules. Record screenshots.
Fix every failure in the code.
```
**Verify:** `npx playwright test patient.spec.ts` passes; screenshots exist in `docs/qa/`. **Commit:** `git add -A && git commit -m "Testing T4: Patient journey end-to-end tests" && git push origin main`

---

## T5: Doctor journey, real-time behaviour, payments and emails

**IDE + Model:** Use Cursor — Grok 4.6. *(Fallback: Antigravity — Claude Sonnet 4.6 (Thinking).)*

```text
Create web/e2e/doctor.spec.ts using TWO browser contexts at once (patient and doctor), plus manual checks I will do.

AUTOMATED
1. Doctor logs in, sets fees and availability, turns presence to auto. The patient's /doctors page shows Online without reload. The doctor closes the page; after PRESENCE_GRACE_SECONDS the patient's badge shows Offline without reload.
2. Offline path: doctor appears offline; patient sends a request; poll the real doctor inbox (read it over IMAP or check EmailLog through the admin API) and assert the email exists; doctor sets a time; assert the patient email exists and the appointment becomes awaiting_payment.
3. Double booking: two patient contexts request the same slot and the doctor schedules both at the same instant (parallel API calls); exactly one succeeds.
4. Payment window expiry: set PAYMENT_WINDOW_MINUTES=1 in a test run and assert expiry and the email.
5. Chat: after a paid appointment (create it through the real Razorpay test checkout manually in step M1, then reuse its id), both contexts exchange messages; reload restores history; HTML in a message is escaped.
6. Call signalling: launch Chromium with --use-fake-ui-for-media-stream and --use-fake-device-for-media-stream (Chromium test flags for the camera and microphone only; the app code is unchanged) and assert the connection state reaches "connected" on both sides for audio and video appointments.
7. Consent: patient grants, doctor sees the case panel; patient revokes, panel disappears; the audit log has entries.
8. Socket reconnect: use context.setOffline(true) for 10 seconds on the patient side; the chat reconnects and no messages are lost.

MANUAL (do these yourself and write the outcome in docs/TEST_REPORT.md)
M1. Complete a Razorpay test payment through the real Checkout with Razorpay's test details. Confirm: Paid state, receipt email, doctor email, Compass payment record, Razorpay dashboard entry.
M2. Close the tab right after paying and confirm the webhook marks it paid.
M3. Make a real audio call and a real video call between two physical devices on different networks. Note whether TURN was needed.
M4. Refund a test payment as admin and confirm the email.
```
**Verify:** automated tests pass; the manual checklist is filled in with dates and evidence. **Commit:** `git add -A && git commit -m "Testing T5: Doctor journey, realtime, payment and email tests" && git push origin main`

---

## T6: Failure injection across integrations

**IDE + Model:** Use Antigravity — GPT-OSS 120B (Medium). *(Fallback: Claude Sonnet 4.6 (Thinking).)*

```text
Create scripts/failure_drills.md (a runnable checklist) and, where possible, automated scripts in api/src/tests/drills/. For each drill: how to inject the failure, the expected app behaviour, and the evidence to capture. Run all of them and record results.

1. Groq API unreachable, wrong key, rate limited: explanation falls back to the template and says so.
2. AI service down, slow (add a real delay with a proxy or by loading the CPU), and returning 500: cases fail gracefully with retries and a readable message; the UI shows a clear failure state with a retry button.
3. MongoDB unreachable for 30 seconds: the API returns 503 and recovers by itself; no data corruption.
4. SMTP down: appointment actions succeed, EmailLog shows failed, the UI shows "We could not send the email" and the admin can resend.
5. Razorpay API unreachable or wrong keys: clear error, no appointment state change, no duplicate orders after recovery.
6. Webhook delivered twice and out of order: state stays correct.
7. Browser offline during upload and during a call: clear messages and recovery.
8. Disk full or storage folder not writable: upload fails with a clear error and no half-written case.
9. Server restart during a processing job: the case is not stuck forever (a startup routine re-queues or fails cases left in processing).
Fix any drill that fails in the code and re-run it.
```
**Verify:** every drill has a recorded pass in `docs/TEST_REPORT.md`. **Commit:** `git add -A && git commit -m "Testing T6: Failure injection drills and fixes" && git push origin main`

---

## T7: Model validity and honesty audit

**IDE + Model:** Use Antigravity — Claude Opus 4.6 (Thinking). *(Fallback: Claude Sonnet 4.6 (Thinking).)*

```text
Audit the models and the claims made about them.

1. Leakage checks as code: assert no lesion_id, sha256 or file path appears in more than one split for HAM10000, DermNet and FUSeg; assert the senior's training features were out-of-fold; assert thresholds in config/thresholds.json were computed on validation, not test.
2. Rebuild models/metrics/summary.json with ai-service/training/evaluate.py and diff it against the committed one; explain any difference.
3. Compare every number on /performance, in README.md, in docs/MODEL_CARDS.md and in the project deck against summary.json; list mismatches and fix them.
4. Out-of-scope tests: run 30 real out-of-scope images (landscapes, hands, faces, drawings, screenshots) and record the nurse outputs, the abstention rate and any wrong confident outputs. Run 20 real images of unlisted DermNet classes through the disease model and record the abstention rate.
5. Own-photo check: with consented photos of your own skin (a mole, a freckle, a healthy patch, a minor scrape) run the pipeline and record the nurse routing, outputs, and the reliability notice. Write down where the system is wrong or unsure. Do not photograph other people without consent.
6. Calibration check: plot reliability diagrams from the test split and confirm the likelihood range covers the true outcome at roughly the stated rate (report the real coverage).
7. Skin tone check: if Fitzpatrick or skin tone information is not available in the datasets, state that the performance across skin tones was not measured and make sure the website says so.
8. Update docs/MODEL_CARDS.md and the limitations list on /performance with every weakness found.
```
**Verify:** no mismatch between documents and files; weaknesses documented. **Commit:** `git add -A && git commit -m "Testing T7: Model validity audit and documentation corrections" && git push origin main`

---

## T8: Security tests

**IDE + Model:** Use Antigravity — Claude Opus 4.6 (Thinking). *(Fallback: Cursor — Grok 4.6.)*

```text
Perform and record these security tests, with a fix and re-test for every failure.
1. IDOR on every id-bearing route (cases, images, artifacts, appointments, payments, messages, consents) with a second real account.
2. JWT: none algorithm, tampered payload, wrong secret, expired token, refresh cookie missing or from another user.
3. Injection: NoSQL operators in JSON and query strings, very long strings, unicode edge cases, null bytes.
4. XSS: script payloads in lesionLabel, doctor bio, chat messages, notes, names; confirm all are escaped in the UI, emails and the report page.
5. CSRF: the refresh endpoint rejects cross-site requests (sameSite and an origin check).
6. Upload: polyglot files, huge dimensions (decompression bombs: limit pixels), wrong magic bytes, double extensions, path traversal in names.
7. Headers: run a headers check on the running site (CSP, HSTS in production mode, X-Content-Type-Options, Referrer-Policy, frame protections).
8. Secrets: confirm no secret appears in the Next.js client bundle, API responses, logs or error messages.
9. Rate limiting and brute force on login, password reset (if any), payment and chat routes.
10. Socket security: unauthenticated connection refused; joining another appointment's room refused; message size and frequency limits.
11. Privacy: Groq prompts and logs contain no names, emails, ids or images (inspect real prompts in a debug run); emails contain no health details.
```
**Verify:** all items pass with evidence in `docs/TEST_REPORT.md`. **Commit:** `git add -A && git commit -m "Testing T8: Security tests and fixes" && git push origin main`

---

## T9: Design, accessibility and copy audit

**IDE + Model:** Use Antigravity — Gemini 3.8 Flash (Medium). *(Fallback: VS Code — GitHub Copilot Free Tier.)*

```text
Audit the website against the design and copy rules.
1. Run python scripts/check_copy.py and the Playwright design and axe tests from Step 27 on every page at widths 360, 768 and 1280. Save screenshots to docs/qa/.
2. Read every page's text from top to bottom and list: vague sentences, repeated phrases, marketing words, claims that are not true of the product, any number that does not come from the API or a metrics file, any text that sounds machine-written (for example three-part slogans, "seamlessly", "empowering"). Rewrite them in plain, specific language. Do not add em dashes or en dashes.
3. Confirm: no gradients, no purple, no pill-shaped buttons, no emoji, no stock or generated photos, no scroll-triggered animation, no parallax, no animated counters, no custom cursor effects, no testimonials, no reviews, no customer counters.
4. Confirm that /privacy and /terms exist, are linked in the footer and at registration, show version and date, and match docs/DATA_FLOW.md.
5. Keyboard test of the full patient journey with no mouse; screen reader labels on the radar chart (provide a text alternative with the same values) and on the agreement grid.
6. Contrast: verify every text and background pair used meets WCAG AA (4.5 to 1 for normal text); list pairs and ratios in docs/DESIGN_SYSTEM.md.
7. prefers-reduced-motion: confirm nothing animates except the spinner.
Fix every finding.
```
**Verify:** all checks pass with screenshots saved. **Commit:** `git add -A && git commit -m "Testing T9: Design, accessibility and copy audit" && git push origin main`

---

## T10: Clean-setup test

**IDE + Model:** Use Antigravity — Claude Sonnet 4.6 (Thinking), and **Use VS Code — GitHub Copilot Free Tier** for the commit messages. *(Fallback: Gemini 3.8 Flash (Medium).)*

```text
Prove the project runs from a clean machine state.
1. In a NEW empty folder (or a fresh computer or container) run: git clone <my repo URL>. Follow ONLY README.md. Record every place the README was unclear or wrong and fix the README.
2. Create fresh .env files from the .env.example files, obtain credentials as the README describes.
3. Restore models with python scripts/fetch_models.py (MODELS_ARCHIVE_URL) and verify sha256 against MANIFEST.json. Also confirm scripts/train_all.sh runs its first stages on a small subset flag (add a --max-images option to the training scripts so the pipeline can be proven end to end quickly) without errors.
4. Start the three services (npm and uvicorn, then again with docker compose). Run: pytest, npm test, npx playwright test, scan_placeholders.sh, check_copy.py.
5. Fix every defect found and push each fix with "Fix (T10): <description>".
```
**Verify:** a person following only the README gets a working system. **Commit:** `git add -A && git commit -m "Testing T10: Clean-setup test and README corrections" && git push origin main`

---

# PART C: FINAL AUDIT AND COMPLETION

---

## Step 28: Final audit and completion report

**IDE + Model:** Use Antigravity — Claude Opus 4.6 (Thinking). *(Fallback: Claude Sonnet 4.6 (Thinking).)*

**Objective:** Prove that every step was done, every feature works with real data, nothing placeholder remains, and the final version is on GitHub.

### Prompt to paste
```text
Perform the final audit of SkinSentry. Do not trust earlier reports: re-run everything and capture real evidence (command output, API responses, screenshots saved in docs/qa/). Create docs/AUDIT_REPORT.md with one section per item below, each marked PASS or FAIL with evidence. Fix any FAIL in the code, re-run, and commit the fix with "Fix (Audit): <description>". Repeat until every item is PASS.

A. STEP-BY-STEP VERIFICATION (prove the output of each step exists and works)
1. Repo, rule files in three IDE locations, .gitignore, README.
2. AI service: /health with all models present and sha256 verified; API key protection.
3. API: /health with db, mail and AI reachability; all collections in MongoDB Compass (list them).
4. Auth: register, login, refresh, logout, admin seed, doctor verification.
5. to 7. Datasets validated (run scripts/validate_datasets.py for all four), splits exist without leakage, quality thresholds file with metrics.
8. Embeddings exist for every dataset with matching row counts; MANIFEST.json valid.
9. to 14. All 12 models load; metrics files exist for each team; run one real image per team through the models and show the outputs.
15. /v1/analyze end to end for cancer, ulcer, disease, none-of-the-above and blurry images.
16. Explanations in en, ta, hi from Groq with validation, and the template fallback.
17. Case creation, history linking, EXIF stripping, access control.
18. to 19. Design system tokens, landing page copy, how it works, privacy, terms, consent records.
20. Results page with overlays, radar, agreement view, explanation tabs.
21. Doctor profiles, fees, availability, live presence.
22. Offline request flow with real emails, scheduling rules.
23. Razorpay test payment, signature verification, webhook, refund.
24. Chat, audio call, video call, consent.
25. Report print, reminders, retention job.
26. Export, deletion, admin console, performance page.
27. Scan scripts, security headers, accessibility tests, Docker builds, README.

B. WHOLE-PROJECT CHECKS
1. bash scripts/scan_placeholders.sh and python scripts/check_copy.py both exit 0.
2. grep the repository for: TODO, FIXME, mock, dummy, placeholder, lorem, hardcoded, changeme, "coming soon", and explain any remaining match (legitimate HTML placeholder attributes only).
3. Every environment variable in all three .env.example files has a documented purpose in README.md and a real value in my local .env files; the apps fail with a clear message if one is missing.
4. Every API route is listed in docs/API_CONTRACT.md and covered by the role-matrix test.
5. Every frontend page loads without console errors in a real browser; list the routes visited.
6. Every number displayed on the website traces to the API, the database or models/metrics/summary.json (spot check at least 20 numbers and write where each comes from).
7. The three legal statements checklist from Step 19 is fully verified.
8. All tests pass: pytest, npm test (api), npx playwright test (web). Paste the summaries.
9. The clean-setup procedure from T10 still works on the final commit.
10. git status is clean, all steps have tags step-1 to step-27 on GitHub, and the final commit is pushed.

C. FINISH
Create the final tag: git tag v1.0.0 && git push origin main --tags. Then write the completion report in the format below into docs/AUDIT_REPORT.md and print it.
```

### Verify in the IDE
1. Open `docs/AUDIT_REPORT.md`: every line is PASS and has evidence.
2. On GitHub, check the commit list shows one commit per step (`Step 1:` to `Step 27:`), the Testing commits, and the final tag `v1.0.0`.
3. Open the running site and use it once as a real patient and once as a real doctor, from sign-up to a completed paid consultation.

**Expected result:** a complete, working, real-data project with a clean audit.

### Commit and push
```bash
git add -A && git commit -m "Step 28: Final audit and completion report" && git tag step-28 && git push origin main --tags
```

---

## Final completion report format

Copy this into `docs/AUDIT_REPORT.md` and fill every field with real values.

```text
SKINSENTRY FINAL COMPLETION REPORT
Date:                      <date>
Repository:                <GitHub URL>   Final commit: <hash>   Tag: v1.0.0
Team:                      Green Lights (HCINTL018), Team Leader S. Pradeep Kumar

1. STEPS COMPLETED
   Steps 1 to 28: <count> of 28 complete. Testing phase T1 to T10: <count> of 10 complete.

2. MODELS (12)
   For each model: name, role, data, method, key metric from summary.json, file sha256.

3. DATASETS AND MODELS USED
   Name, link, licence, local path, date obtained, validation result.

4. FEATURE CHECKLIST (PASS or FAIL, evidence path)
   Quality gate | 3 nurses | Cancer team | Ulcer team | Disease team | Safety and arbitration
   Groq explanations (en, ta, hi) | ABCDE radar | Agreement view | Cancer likelihood with range
   Ulcer healing trend | Cases and history | Doctor dashboard | Live presence | Offline request and emails
   Razorpay payments | Chat | Audio call | Video call | Consent sharing | Report | Reminders
   Privacy export and deletion | Admin console | Performance page | Privacy Policy | Terms

5. QUALITY RESULTS
   pytest: <passed/total>   api tests: <passed/total>   playwright: <passed/total>
   scan_placeholders.sh: exit <code>   check_copy.py: exit <code>   axe violations: <count>
   npm audit and pip-audit: <summary>

6. REAL-DATA CONFIRMATION
   No mock data, dummy responses, placeholder values, hardcoded secrets or thresholds: CONFIRMED / NOT CONFIRMED
   Every number shown on the website traced to a real source: CONFIRMED / NOT CONFIRMED

7. KNOWN LIMITATIONS (honest list)
   <phone photos, skin tone coverage, dermoscopy-trained likelihood, FUSeg patient overlap,
    ulcer rules pending clinician review, Tamil and Hindi text pending native review, other>

8. NOT MEDICAL ADVICE
   Decision support only. Not a medical device. Requires clinical validation and regulatory review before real-world use.

Signed: <name>   Date: <date>
```

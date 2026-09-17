# GeoHist AI

GeoHist AI is an AI-powered teaching platform for History and Geography. The main application runs on port `3020` and helps teachers turn their own lesson materials into grounded learning experiences: RAG-based Q&A, summaries, flashcards, quizzes, assignments, and student results.

The repository also includes VietGeoAI, a geospatial module for exploring Vietnam's province-level units, resolving latitude/longitude to current administrative units, normalizing legacy addresses, and looking up geographic and tourism information.

## What the system does

- **Teacher workspace:** create classes, manage students, upload teaching materials, organize lessons, and review learning activity.
- **RAG learning assistant:** answer questions using indexed classroom materials, with filters for class, subject, lesson, and grade level.
- **AI content generation:** generate quiz drafts, multiple-choice questions, flashcards, summaries, and revision material; teachers can edit and approve generated content before publishing.
- **Assessment workflow:** publish quizzes to a class, collect submissions, calculate scores, show explanations, and retain student results.
- **VietGeoAI:** display Vietnam's 34 province-level units, resolve coordinates and addresses, crosswalk legacy administrative names, and expose province information.
- **Role-based access:** separate Admin, Teacher, and Student experiences with session-based authentication.

## Architecture

The repository is organized as several cooperating services:

| Service | Port | Purpose |
| --- | ---: | --- |
| `edugeo-ai` | `3020` | Main Next.js application, UI, authentication, classes, documents, quizzes, RAG actions, and proxy routes |
| `notebooklm` | `8020` | Local document indexing and RAG generation for answers, quizzes, flashcards, and summaries |
| `backend` | `8787` | VietGeoAI Express service for maps, administrative resolution, address lookup, chat, and legacy quiz APIs |

The EduGeo launcher checks the health of NotebookLM and VietGeoAI and starts available services automatically. If the external RAG service is unavailable, the application falls back to deterministic local responses so the UI remains usable during development.

## Tech stack

- Next.js, React, TypeScript
- Node.js and Express
- Python RAG/NotebookLM service
- Turf.js and GeoJSON for geospatial resolution
- In-memory repositories for the local prototype
- Optional OpenAI-compatible and Google AI integrations

## Run locally

Install the root and EduGeo dependencies:

```powershell
npm install
cd edugeo-ai
npm install
```

Copy `.env.example` to `.env` and provide the required API keys. Then start the main application:

```powershell
cd edugeo-ai
npm run dev
```

Open [http://127.0.0.1:3020](http://127.0.0.1:3020).

The launcher attempts to start NotebookLM on `8020` and VietGeoAI on `8787`. The services can also be checked directly:

```text
http://127.0.0.1:8020
http://127.0.0.1:8787/api/health
```

For a production build:

```powershell
cd edugeo-ai
npm run build
npm run start
```

## Public preview with ngrok

Expose the main application:

```powershell
ngrok http 3020
```

If the VietGeoAI iframe must be reachable by remote browsers, expose port `8787` with a second ngrok endpoint and set `NEXT_PUBLIC_VIETGEO_URL` to that public URL before starting EduGeo. Accounts that allow only one ngrok endpoint should use the main `3020` tunnel or place VietGeoAI behind a reverse proxy.

## Main routes

The main UI includes:

- `/` — teacher/student dashboard
- `/workspace` — documents and AI learning tools
- `/quiz` — quiz creation, review, publishing, and statistics
- `/vietgeo` — integrated VietGeoAI experience

Important API groups include `/api/auth/*`, `/api/classes`, `/api/documents`, `/api/rag/chat`, `/api/quizzes`, `/api/assignments`, `/api/submissions`, `/api/flashcards`, `/api/summaries`, and `/api/vietgeo/*`.

## Data and prototype scope

The repository contains local seed data, example course material, question-generation pipelines, RAG scripts, and GeoJSON-compatible administrative data. The current prototype uses synthetic or lightweight commune data and an in-memory application store; production hardening would replace these with a persistent database, versioned official datasets, durable object storage, background workers, and production authentication.

## Repository layout

```text
.
├── edugeo-ai/          # Main Next.js application on port 3020
├── backend/            # VietGeoAI Express service on port 8787
├── notebooklm/         # Local RAG/NotebookLM service on port 8020
├── RAG/                # Standalone RAG pipeline and API utilities
├── QuestionGeneration/ # Question-generation pipeline and exports
├── frontend/           # Legacy VietGeoAI React/Vite frontend
├── books/              # Course source material
└── scripts/            # Extraction, indexing, and deployment utilities
```

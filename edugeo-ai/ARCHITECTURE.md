# EduGeo AI Architecture

## Goal

EduGeo AI is split into a Next.js app with API route handlers and a modular backend service layer. The current implementation keeps the prototype UI almost intact while adding real boundaries for authentication, class membership, documents, RAG, quiz review/publish, submissions, notifications, flashcards and summaries.

## Frontend

- `src/app/page.tsx`: app entry.
- `src/components/EduGeoApp.tsx`: client state orchestration for landing/auth/app mode, session, active view, modals, toast and selected quiz.
- `src/components/AuthView.tsx`: login and student self-registration flow.
- `src/components/views/*`: Teacher and Student screens from the prototype.
- `src/components/views/AdminView.tsx`: Admin teacher-account management.
- `src/components/shared/*`: cards, buttons, pills, chat assistant and modals.
- `src/app/globals.css`: migrated visual system from the prototype with responsive desktop/mobile behavior.

## Backend

- `src/app/api/*`: HTTP route handlers.
- `src/server/auth.ts`: bearer-session authentication and role-based authorization boundary.
- `src/server/repositories/memoryStore.ts`: in-memory repository implementing the database shape for local development.
- `src/server/services/*`: modules for classes, documents, RAG, quizzes, notifications, flashcards and summaries.
- `src/server/proxy.ts`: same-origin proxy boundary for NotebookLM and VietGeoAI legacy backends.
- `prisma/schema.prisma`: production database schema target.

## Human In The Loop

Quiz generation creates a draft first. Teachers edit questions/options, mark the correct option, approve the quiz, then broadcast it to one class. Students only see published assignments.

## RAG/AI Pipeline

The app calls the existing NotebookLM service if `NOTEBOOKLM_API_BASE` is available. If it is not running, services return deterministic fallback content so the product UI remains usable during development. NotebookLM asset URLs are rewritten through `/api/integrations/notebooklm/*` so images can render in the new UI.

VietGeoAI is connected through `/api/integrations/vietgeo/*`, with `VIETGEO_API_BASE` defaulting to `http://127.0.0.1:8787`.

## Data Model

The Prisma schema covers:

- Users and roles
- Auth sessions and account audit logs
- Classes and memberships
- Documents and RAG indexes
- AI jobs
- Quizzes, questions, options and assignments
- Student submissions and answers
- Notifications
- Flashcard sets and summary artifacts

## Next Steps

1. Replace in-memory store with Prisma client.
2. Replace local PBKDF2/session store with production auth cookies/JWT/SSO.
3. Persist uploads to object storage.
4. Move AI/RAG jobs to a queue worker.
5. Add teacher analytics for question quality and student misconceptions.

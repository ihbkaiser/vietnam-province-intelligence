# EduGeo AI

Production-oriented Next.js prototype migrated from `edugeo_ui_prototype_v2.html`.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3020` or the port printed by Next.js.

The `dev` and `start` commands also check and start the VietGeoAI Express backend
on port `8787` automatically when it is available in the repository. This keeps
the VietGeoAI section ready when the EduGeo port is exposed through ngrok. Set
`VIETGEOAI_PORT` or `VIETGEO_ROOT` if the backend uses a different port or path.

## Accounts

The app now uses session-based auth for the local prototype:

- Admin: `Admin195` / `19052005`
- Teacher demo: `colan` / `colan123`
- Student demo: `mkhang10a1` / `123456`

Students can register themselves. Teacher accounts are school-issued by Admin.

## Optional integrations

- `NOTEBOOKLM_API_BASE=http://127.0.0.1:8020` connects RAG, Quiz, Flashcard and Summary generation to the existing local NotebookLM pipeline.
- `VIETGEO_API_BASE=http://127.0.0.1:8787` connects the VietGeoAI backend through `/api/integrations/vietgeo/*`.
- `NEXT_PUBLIC_VIETGEO_URL=http://127.0.0.1:5173` embeds the old VietGeoAI UI in the VietGeoAI section.

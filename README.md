# UM Commercial Project Tracker

Tracks the UrbanMop Commercial Segmentation and LuxoClean Transition projects.

- `server.js` serves the app and stores records in Postgres (`DATABASE_URL`).
- `public/index.html` is the built app. Its source is in `src/`.
- `seed/seed.json` is imported once, the first time the app starts on an empty database.

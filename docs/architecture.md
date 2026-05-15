# AetherMail Architecture

AetherMail is a React/Vite mobile-ready PWA with an email-only product boundary. The app currently runs with realistic local fixtures and provider adapter definitions so the product experience, UI states, and tests are available before secret-backed OAuth/IMAP credentials are wired in.

## Client

- `src/App.jsx`: complete inbox shell, account switcher, search, labels, message reader, archive/delete actions, and compose/reply/forward composer.
- `src/styles/app.css`: responsive app layout with desktop three-pane mode and mobile overlay navigation/reader.
- `public/manifest.webmanifest` and `public/sw.js`: installable PWA manifest and offline shell caching.
- `src/services/mailApi.js`: browser-safe API client for local real-mail testing.

## Domain Services

- `src/services/mailEngine.js`: provider-neutral filtering, AI-priority ordering, labels, archive/delete state transitions, reply/forward composition, and AI reply text.
- `src/services/providerAdapters.js`: integration boundary for Gmail, Office 365, and IMAP/SMTP.
- `src/data/accounts.js` and `src/data/messages.js`: seed data representing Gmail, Microsoft 365, Yahoo/AOL-style IMAP, labels, priority, and AI metadata.

## Local Backend

- `server/index.js`: Express API for status, inbox sync, send, archive, and delete actions.
- `server/mailClient.js`: IMAPFlow and Nodemailer integration using `.env.local` credentials.
- `server/emailAi.js`: local heuristic summaries, priority scoring, and suggested replies for real messages.

Credentials stay server-side in `.env.local`; they are never bundled into the PWA.

## Provider Plan

Gmail uses OAuth 2.0 with Gmail API scopes, historyId incremental sync, Gmail labels, archive/delete mutations, and `users.messages.send`. Office 365 uses Microsoft identity OAuth, Graph delta query, categories/folders, archive/delete mutations, and `/sendMail`. IMAP uses app passwords or OAuth where available, UID checkpoints, IMAP IDLE polling fallback, folder moves for archive/delete, and SMTP submission.

## AI Plan

AI runs as a provider-neutral mail copilot layer after sync normalization. It stores summary, suggested reply, and priority score on normalized messages. The UI makes those fields first-class: priority sorted inbox, AI brief in the reader, one-tap draft reply, and composer improvement.

## Deployment

The app builds to static assets with `npm run build` and can be deployed directly to Vercel. Production needs OAuth app registrations, encrypted token storage, provider webhook/delta workers, and an AI gateway endpoint before real mailbox access is enabled.

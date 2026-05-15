# Workflow Writeup

I used a specs-driven single-agent workflow in Codex, substituting Codex for Claude Code as requested.

1. Product scope was constrained to email only: unified inbox, provider switching, compose/reply/forward, search, labels, archive/delete, AI summaries, reply drafts, and prioritization.
2. Architecture was split into provider-neutral domain services and provider adapter contracts for Gmail, Office 365, and IMAP/SMTP.
3. UI was implemented as a mobile-ready PWA with desktop three-pane layout, mobile navigation, offline shell, and install manifest.
4. AI-first behavior was placed in the main workflow instead of a side panel: priority sorting, message summaries, and draft generation are visible from the inbox and reader.
5. Verification was added with Vitest service tests and React Testing Library UI tests for search and AI reply drafting.

Vercel deployment command:

```bash
npm install
npm run test
npm run build
npx vercel --prod
```

I cannot create a free Vercel account from this environment. Once authenticated locally with `npx vercel login`, the project is ready to deploy.

## Real Email Test Workflow

The app now includes a local IMAP/SMTP backend for testing with a real mailbox.

1. Create an app password with your mail provider. Do not use or share your normal account password.
2. Copy `.env.local.example` to `.env.local`.
3. Fill in the IMAP and SMTP fields for your provider.
4. Run `npm run dev:server` in one terminal.
5. Run `npm run dev` in another terminal.
6. Open `http://localhost:5173/` and press `Sync`.

Common provider settings:

```bash
# Gmail with app password
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true

# Yahoo/AOL with app password
IMAP_HOST=imap.mail.yahoo.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=465
SMTP_SECURE=true
```

For Office 365 production use, OAuth via Microsoft Graph is the right path. Basic IMAP auth may be disabled by many Microsoft tenants.

## OpenAI AI Features

Add a fresh OpenAI key to `.env.local` to replace local heuristic AI with model-generated summaries, priority, and reply drafts:

```bash
OPENAI_API_KEY=sk-your-new-key-here
OPENAI_MODEL=gpt-4.1-mini
```

The key is read only by the local Express server. It is not bundled into the browser app.

Test the key before syncing mail:

```bash
npm run test:openai
```

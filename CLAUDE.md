# AetherMail Agent Guide

This repository was built using Codex as the implementation agent in place of Claude Code. The intended discipline mirrors Claude Code style work: specs first, narrow agents, clear hooks, repeatable tests, and deployment-ready output.

## Product Spec

Build an AI-first universal email client as a mobile-ready PWA for email only. The product supports Gmail, Office 365, and IMAP-style accounts such as Yahoo and AOL through adapter boundaries, a unified inbox, account switching, compose/reply/forward, search, labels, archive/delete, AI summaries, reply drafts, and priority ranking.

## Working Rules

- Keep email as the only domain. Do not add contacts, tasks, notes, or calendar surfaces.
- Treat Gmail, Office 365, and IMAP as provider adapters behind `src/services/providerAdapters.js`.
- Keep AI features visible in the core inbox workflow: summary, priority, draft reply, and writing improvement.
- Every behavior change needs a focused service test or UI test.
- Run `npm run test` and `npm run build` before deployment.

## Agent OS Methodology

1. Spec: define the user workflow and provider contracts before UI implementation.
2. Slice: build small vertical slices, starting with inbox, message reader, composer, and AI assistant.
3. Verify: test service logic and core UI paths.
4. Ship: build a Vercel-compatible static PWA.

## Agent Map

- Product agent: owns user journeys, email-only scope, and mobile UX.
- Architecture agent: owns provider boundaries, data model, sync model, and PWA shape.
- UI agent: owns React components, responsive layout, accessibility, and interaction states.
- AI agent: owns summary, priority, draft reply, and compose-improvement flows.
- QA agent: owns Vitest coverage, build checks, and regression risks.

## Skills

- `email-provider-adapters`: Gmail API, Microsoft Graph, IMAP/SMTP provider modeling.
- `ai-inbox-workflows`: summary, ranking, drafting, and tone improvement design.
- `mobile-pwa-quality`: installability, offline shell, responsive navigation.
- `specs-driven-dev`: keep implementation linked to product requirements.

## Hooks

- `pre-commit`: run lint and tests.
- `pre-deploy`: run tests and production build.
- `post-sync`: recompute AI priority and refresh summaries after provider sync.

## Plugins

- `gmail-adapter`: Gmail OAuth, history sync, labels, archive/delete, send.
- `m365-adapter`: Microsoft OAuth, Graph delta sync, categories, archive/delete, sendMail.
- `imap-smtp-adapter`: IMAP IDLE/UID sync, folders, SMTP send, provider app-password handling.
- `ai-mail-copilot`: summarization, priority scoring, reply drafting, compose rewrite.

## Commands

```bash
npm install
npm run dev
npm run dev:server
npm run dev:full
npm run test
npm run build
```

## Real Mail Testing

Use `.env.local.example` as the template for a local IMAP/SMTP test mailbox. Use an app password, not a normal password. Run `npm run dev:server` and `npm run dev`, then press `Sync` in the UI.

Set `OPENAI_API_KEY` in `.env.local` to use OpenAI for real summaries, priority scores, and reply drafts. Without it, the app uses local fallback heuristics.

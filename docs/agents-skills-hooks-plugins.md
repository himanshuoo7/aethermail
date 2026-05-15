# Agents, Skills, Hooks, Plugins

## Agents

- Product agent: email-only scope, user journeys, mobile UX acceptance.
- Architecture agent: provider adapter contracts, normalized message model, PWA boundaries.
- UI agent: responsive React implementation, accessibility, interaction states.
- AI agent: summaries, priority ranking, draft reply and rewrite flows.
- QA agent: automated tests, build verification, release checks.

## Skills

- `specs-driven-dev`: convert requirements into implementation slices and acceptance tests.
- `email-provider-adapters`: model Gmail, Office 365, and IMAP/SMTP capabilities.
- `ai-inbox-workflows`: design summary, ranking, and draft response behavior.
- `mobile-pwa-quality`: installability, offline shell, responsive view checks.

## Hooks

- `pre-commit`: `npm run lint && npm run test`
- `pre-deploy`: `npm run test && npm run build`
- `post-sync`: normalize messages, update labels, recompute AI summaries and priorities

## Plugins

- `gmail-adapter`: OAuth, history sync, labels, archive/delete, send.
- `m365-adapter`: Microsoft identity, Graph delta sync, categories, archive/delete, sendMail.
- `imap-smtp-adapter`: IMAP IDLE/UID sync, folder moves, SMTP send.
- `ai-mail-copilot`: summarization, priority scoring, reply drafting, compose improvement.

# email-provider-adapters

Provider integrations stay behind adapter contracts:

- Gmail: OAuth, historyId sync, labels, archive/delete, send.
- Office 365: OAuth, Graph delta sync, categories/folders, archive/delete, sendMail.
- IMAP/SMTP: app password or OAuth, UID checkpoints, IDLE/polling, folder moves, SMTP send.

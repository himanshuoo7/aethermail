export const providerAdapters = {
  gmail: {
    auth: "OAuth 2.0 with Gmail API scopes",
    sync: "Gmail historyId incremental sync",
    send: "Gmail users.messages.send",
  },
  office365: {
    auth: "OAuth 2.0 with Microsoft identity platform",
    sync: "Microsoft Graph delta query",
    send: "Graph /sendMail",
  },
  imap: {
    auth: "Provider app password or OAuth where available",
    sync: "IMAP IDLE plus UID checkpoints",
    send: "SMTP submission",
  },
};

export function getAdapter(provider) {
  return providerAdapters[provider];
}

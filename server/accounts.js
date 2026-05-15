// In-memory account registry. Seeded from env on startup; cleared on server restart.
const store = new Map();

export function registerAccount(account) {
  store.set(account.id, account);
}

export function getAccountEntry(id) {
  return store.get(id);
}

export function listAccountMeta() {
  return Array.from(store.values()).map(({ imap, smtp, ...meta }) => meta);
}

export function removeAccount(id) {
  return store.delete(id);
}

export function hasAccount(id) {
  return store.has(id);
}

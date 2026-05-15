const KEY = "aethermail_accounts";

export function getStoredAccounts() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveAccount(account) {
  const all = getStoredAccounts();
  const idx = all.findIndex((a) => a.id === account.id);
  if (idx >= 0) all[idx] = account;
  else all.push(account);
  localStorage.setItem(KEY, JSON.stringify(all));
  return account;
}

export function updateToken(id, patch) {
  const all = getStoredAccounts();
  const account = all.find((a) => a.id === id);
  if (account) {
    Object.assign(account, patch);
    localStorage.setItem(KEY, JSON.stringify(all));
  }
}

export function removeStoredAccount(id) {
  const all = getStoredAccounts().filter((a) => a.id !== id);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function isExpired(account) {
  if (!account.expiresAt) return false;
  return Date.now() > account.expiresAt - 60_000;
}

// Refreshes access token via /api/auth/refresh and updates localStorage
export async function refreshAccessToken(account) {
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: account.provider, refreshToken: account.refreshToken }),
  });
  if (!res.ok) throw new Error("Token refresh failed. Please sign in again.");
  const data = await res.json();
  updateToken(account.id, data);
  return { ...account, ...data };
}

// Returns the account with a valid (possibly refreshed) access token
export async function getValidAccount(account) {
  if (isExpired(account)) return refreshAccessToken(account);
  return account;
}

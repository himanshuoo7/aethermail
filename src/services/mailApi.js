export async function getMailStatus() {
  const response = await fetch("/api/status");
  if (!response.ok) throw new Error("Mail API is not available.");
  return response.json();
}

export async function getAuthStatus() {
  const response = await fetch("/api/auth/status");
  if (!response.ok) return { google: false, microsoft: false };
  return response.json();
}

export async function getRealMessages(accountId) {
  const url = accountId ? `/api/messages?limit=40&accountId=${accountId}` : "/api/messages?limit=40";
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Unable to load real mailbox.");
  return payload;
}

export async function connectAccount({ provider, label, email, password, imap, smtp }) {
  const response = await fetch("/api/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, label, email, password, imap, smtp }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Unable to connect account.");
  return payload;
}

export async function removeAccount(id) {
  const response = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Unable to remove account.");
  return payload;
}

export async function sendRealMessage(message) {
  const response = await fetch("/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Unable to send message.");
  return payload;
}

export async function moveRealMessage(uid, action) {
  const response = await fetch(`/api/messages/${uid}/${action}`, { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Unable to ${action} message.`);
  return payload;
}

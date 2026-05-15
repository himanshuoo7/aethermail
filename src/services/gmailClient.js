const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

function header(headers, name) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function decodeBody(data) {
  if (!data) return "";
  return atob(data.replace(/-/g, "+").replace(/_/g, "/"));
}

function extractText(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBody(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      const t = extractText(part);
      if (t) return t;
    }
  }
  if (payload.body?.data) return decodeBody(payload.body.data);
  return "";
}

function preview(text = "", len = 150) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > len ? clean.slice(0, len - 1) + "…" : clean;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function scorePriority(msg) {
  let score = 50;
  if (msg.unread) score += 15;
  if (msg.starred) score += 20;
  const subj = msg.subject.toLowerCase();
  if (/urgent|asap|important|deadline|action required/i.test(subj)) score += 15;
  if (/unsubscribe|newsletter|noreply|no-reply/i.test(msg.fromEmail)) score -= 20;
  return Math.max(0, Math.min(99, score));
}

async function apiFetch(url, accessToken) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) throw new Error("EXPIRED_TOKEN");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gmail API error ${res.status}`);
  }
  return res.json();
}

export async function fetchGmailMessages(account, { limit = 40 } = {}) {
  const { id: accountId, email, accessToken } = account;

  const list = await apiFetch(
    `${BASE}/messages?maxResults=${limit}&labelIds=INBOX&q=in:inbox`,
    accessToken,
  );

  const ids = (list.messages || []).slice(0, limit);
  if (!ids.length) return [];

  const messages = await Promise.all(
    ids.map(async ({ id: msgId }) => {
      const msg = await apiFetch(`${BASE}/messages/${msgId}?format=full`, accessToken);
      const hdrs = msg.payload?.headers || [];
      const fromRaw = header(hdrs, "From");
      const match = fromRaw.match(/^(.*?)\s*<(.+)>$/);
      const fromName = match ? match[1].replace(/^"|"$/g, "").trim() : fromRaw;
      const fromEmail = match ? match[2] : fromRaw;
      const bodyText = extractText(msg.payload) || msg.snippet || "";
      const labelIds = msg.labelIds || [];
      const customLabels = labelIds.filter(
        (l) => !["INBOX","UNREAD","IMPORTANT","STARRED","SENT","DRAFT","SPAM","TRASH",
                  "CATEGORY_PERSONAL","CATEGORY_PROMOTIONS","CATEGORY_UPDATES",
                  "CATEGORY_FORUMS","CATEGORY_SOCIAL"].includes(l),
      );
      const normalized = {
        id: `${accountId}:${msgId}`,
        uid: msgId,
        accountId,
        from: fromName || fromEmail,
        fromEmail,
        to: email,
        subject: header(hdrs, "Subject") || "(No subject)",
        preview: preview(bodyText || msg.snippet),
        body: bodyText || msg.snippet || "No body available.",
        timestamp: formatDate(header(hdrs, "Date")),
        labels: customLabels.length ? customLabels : ["Inbox"],
        folder: "inbox",
        unread: labelIds.includes("UNREAD"),
        starred: labelIds.includes("STARRED"),
      };
      return { ...normalized, priority: scorePriority(normalized), aiSummary: preview(bodyText, 120) };
    }),
  );

  return messages;
}

export async function sendGmailMessage({ accessToken, from, to, subject, body }) {
  const mime = [`From: ${from}`, `To: ${to}`, `Subject: ${subject}`, "", body].join("\r\n");
  const encoded = btoa(unescape(encodeURIComponent(mime)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const res = await fetch(`${BASE}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "Failed to send email");
  }
  return res.json();
}

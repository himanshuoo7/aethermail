const BASE = "https://graph.microsoft.com/v1.0/me";

function preview(text = "", len = 150) {
  const clean = text.replace(/\s+/g, " ").replace(/<[^>]*>/g, " ").trim();
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
  if (/urgent|asap|important|deadline|action required/i.test(msg.subject)) score += 15;
  if (/unsubscribe|newsletter|noreply|no-reply/i.test(msg.fromEmail)) score -= 20;
  return Math.max(0, Math.min(99, score));
}

async function apiFetch(url, accessToken) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) throw new Error("EXPIRED_TOKEN");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Graph API error ${res.status}`);
  }
  return res.json();
}

export async function fetchOutlookMessages(account, { limit = 40 } = {}) {
  const { id: accountId, email, accessToken } = account;

  const data = await apiFetch(
    `${BASE}/mailFolders/inbox/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview,body,isRead,flag,categories`,
    accessToken,
  );

  return (data.value || []).map((msg) => {
    const fromName = msg.from?.emailAddress?.name || "";
    const fromEmail = msg.from?.emailAddress?.address || "";
    const bodyText = msg.body?.contentType === "text"
      ? msg.body.content
      : (msg.body?.content || "").replace(/<[^>]*>/g, " ");

    const normalized = {
      id: `${accountId}:${msg.id}`,
      uid: msg.id,
      accountId,
      from: fromName || fromEmail,
      fromEmail,
      to: email,
      subject: msg.subject || "(No subject)",
      preview: preview(msg.bodyPreview || bodyText),
      body: bodyText || msg.bodyPreview || "No body available.",
      timestamp: formatDate(msg.receivedDateTime),
      labels: msg.categories?.length ? msg.categories : ["Inbox"],
      folder: "inbox",
      unread: !msg.isRead,
      starred: msg.flag?.flagStatus === "flagged",
    };
    return { ...normalized, priority: scorePriority(normalized), aiSummary: preview(bodyText, 120) };
  });
}

export async function sendOutlookMessage({ accessToken, from, to, subject, body }) {
  const res = await fetch(`${BASE}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "Text", content: body },
        toRecipients: [{ emailAddress: { address: to } }],
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "Failed to send email");
  }
  return { accepted: [to] };
}

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { enrichMessageWithAi } from "./emailAi.js";

const bool = (value, fallback) => {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === "true";
};

export function isMailConfigured(env = process.env) {
  const host = env.IMAP_HOST || "";
  // Ignore placeholder values from .env.local.example
  if (!host || host.includes("example.com")) return false;
  return Boolean(host && env.IMAP_USER && env.IMAP_PASS && env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

export function getConfiguredAccount(env = process.env) {
  return {
    id: env.MAIL_ACCOUNT_ID || "real-imap",
    provider: env.MAIL_ACCOUNT_PROVIDER || "imap",
    name: env.MAIL_ACCOUNT_NAME || "Real IMAP",
    email: env.MAIL_ACCOUNT_EMAIL || env.IMAP_USER,
    color: "#0f766e",
    status: isMailConfigured(env) ? "synced" : "not-configured",
  };
}

function makeImapClient({ host, port = 993, secure = true, user, pass, accessToken }) {
  const auth = accessToken ? { user, accessToken } : { user, pass };
  return new ImapFlow({ host, port: Number(port), secure, auth, logger: false });
}

function makeSmtpTransport({ host, port = 465, secure = true, user, pass, accessToken }) {
  const auth = accessToken ? { type: "OAuth2", user, accessToken } : { user, pass };
  return nodemailer.createTransport({ host, port: Number(port), secure, auth });
}

function createImapClient(env = process.env) {
  return makeImapClient({
    host: env.IMAP_HOST,
    port: env.IMAP_PORT,
    secure: bool(env.IMAP_SECURE, true),
    user: env.IMAP_USER,
    pass: env.IMAP_PASS,
  });
}

function createSmtpTransport(env = process.env) {
  return makeSmtpTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: bool(env.SMTP_SECURE, true),
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  });
}

function formatTimestamp(date) {
  if (!date) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function textPreview(text = "") {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 150 ? `${clean.slice(0, 147)}...` : clean;
}

async function parseMessageBody(source) {
  if (!source) return { text: "", html: "" };
  const parsed = await simpleParser(source);
  return {
    text: parsed.text || parsed.html?.replace(/<[^>]*>/g, " ") || "",
    html: parsed.html || "",
  };
}

async function fetchMessages(client, accountId, accountEmail, mailbox = "INBOX", limit = 30) {
  const lock = await client.getMailboxLock(mailbox);
  try {
    const messages = [];
    const total = client.mailbox.exists || 0;
    if (!total) return [];
    const start = Math.max(1, total - Number(limit) + 1);

    for await (const item of client.fetch(`${start}:*`, { uid: true, envelope: true, flags: true, source: true })) {
      const body = await parseMessageBody(item.source);
      const from = item.envelope?.from?.[0];
      const normalized = {
        id: `${accountId}:${item.uid}`,
        uid: item.uid,
        accountId,
        from: from?.name || from?.address || "Unknown sender",
        fromEmail: from?.address || "",
        to: accountEmail,
        subject: item.envelope?.subject || "(No subject)",
        preview: textPreview(body.text),
        body: body.text || "No plain-text body was available.",
        timestamp: formatTimestamp(item.envelope?.date),
        labels: Array.from(item.flags || []).filter((f) => !f.startsWith("\\")),
        folder: "inbox",
        unread: !Array.from(item.flags || []).includes("\\Seen"),
        starred: Array.from(item.flags || []).includes("\\Flagged"),
      };
      const ai = await enrichMessageWithAi(normalized);
      messages.push({ ...normalized, labels: normalized.labels.length ? normalized.labels : ["Inbox"], ...ai });
    }

    return messages.sort((a, b) => b.uid - a.uid);
  } finally {
    lock.release();
  }
}

// ── Gmail REST API (used for Gmail OAuth accounts) ────────────────────────────

function gmailHeader(headers, name) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function decodeGmailBody(data) {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function extractGmailText(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeGmailBody(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractGmailText(part);
      if (text) return text;
    }
  }
  return payload.body?.data ? decodeGmailBody(payload.body.data) : "";
}

async function fetchGmailApiMessages(accountEntry, { limit = 30 } = {}) {
  const { id: accountId, email, imap: { accessToken } } = accountEntry;
  const headers = { Authorization: `Bearer ${accessToken}` };

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&labelIds=INBOX`,
    { headers },
  );
  if (!listRes.ok) {
    const err = await listRes.json();
    throw new Error(err.error?.message || `Gmail API error ${listRes.status}`);
  }
  const listData = await listRes.json();
  const messageIds = (listData.messages || []).slice(0, limit);

  const messages = await Promise.all(
    messageIds.map(async ({ id: msgId }) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
        { headers },
      );
      const msg = await msgRes.json();
      const hdrs = msg.payload?.headers || [];
      const fromRaw = gmailHeader(hdrs, "From");
      const fromMatch = fromRaw.match(/^(.*?)\s*<(.+)>$/);
      const fromName = fromMatch ? fromMatch[1].replace(/^"|"$/g, "").trim() : fromRaw;
      const fromEmail = fromMatch ? fromMatch[2] : fromRaw;
      const dateStr = gmailHeader(hdrs, "Date");
      const body = extractGmailText(msg.payload) || msg.snippet || "";
      const labelIds = msg.labelIds || [];
      const customLabels = labelIds.filter(
        (l) => !["INBOX", "UNREAD", "IMPORTANT", "STARRED", "SENT", "DRAFT", "SPAM", "TRASH",
                  "CATEGORY_PERSONAL", "CATEGORY_PROMOTIONS", "CATEGORY_UPDATES",
                  "CATEGORY_FORUMS", "CATEGORY_SOCIAL"].includes(l),
      );
      const normalized = {
        id: `${accountId}:${msgId}`,
        uid: msgId,
        accountId,
        from: fromName || fromEmail,
        fromEmail,
        to: email,
        subject: gmailHeader(hdrs, "Subject") || "(No subject)",
        preview: textPreview(body),
        body: body || "No body available.",
        timestamp: formatTimestamp(dateStr ? new Date(dateStr) : new Date()),
        labels: customLabels.length ? customLabels : ["Inbox"],
        folder: "inbox",
        unread: labelIds.includes("UNREAD"),
        starred: labelIds.includes("STARRED"),
      };
      const ai = await enrichMessageWithAi(normalized);
      return { ...normalized, ...ai };
    }),
  );

  return messages;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function testConnection(imapCreds) {
  const client = makeImapClient(imapCreds);
  await client.connect();
  await client.logout();
}

export async function listMessagesForAccount(accountEntry, { limit = 30 } = {}) {
  // Gmail OAuth accounts: use Gmail REST API (no IMAP needed)
  if (accountEntry.provider === "gmail" && accountEntry.imap?.accessToken) {
    return fetchGmailApiMessages(accountEntry, { limit });
  }

  const { id, email, imap } = accountEntry;
  const client = makeImapClient(imap);
  await client.connect();
  try {
    return await fetchMessages(client, id, email, imap.mailbox || "INBOX", limit);
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function listMessages({ limit = 30 } = {}) {
  if (!isMailConfigured()) {
    throw new Error("Mail credentials are not configured.");
  }
  const account = getConfiguredAccount();
  const client = createImapClient();
  await client.connect();
  try {
    return await fetchMessages(client, account.id, account.email, process.env.IMAP_MAILBOX || "INBOX", limit);
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function sendMessage({ to, subject, body, accountEntry }) {
  if (!to || !subject) throw new Error("Recipient and subject are required.");
  let transport, fromName, fromEmail;
  if (accountEntry) {
    transport = makeSmtpTransport(accountEntry.smtp);
    fromName = accountEntry.name;
    fromEmail = accountEntry.email;
  } else {
    if (!isMailConfigured()) throw new Error("SMTP credentials are not configured.");
    transport = createSmtpTransport();
    const account = getConfiguredAccount();
    fromName = account.name;
    fromEmail = account.email;
  }
  const info = await transport.sendMail({ from: `${fromName} <${fromEmail}>`, to, subject, text: body || "" });
  return { id: info.messageId, accepted: info.accepted };
}

async function moveByUid(uid, destination) {
  if (!destination) return { moved: false };
  const client = createImapClient();
  await client.connect();
  try {
    const lock = await client.getMailboxLock(process.env.IMAP_MAILBOX || "INBOX");
    try {
      await client.messageMove(uid, destination, { uid: true });
      return { moved: true, destination };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function archiveMessageByUid(uid) {
  return moveByUid(uid, process.env.IMAP_ARCHIVE_MAILBOX || "Archive");
}

export async function deleteMessageByUid(uid) {
  return moveByUid(uid, process.env.IMAP_TRASH_MAILBOX || "Trash");
}

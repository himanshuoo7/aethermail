import { randomUUID } from "crypto";
import dotenv from "dotenv";
import express from "express";
import { registerAccount, getAccountEntry, listAccountMeta, removeAccount } from "./accounts.js";
import {
  archiveMessageByUid,
  deleteMessageByUid,
  getConfiguredAccount,
  isMailConfigured,
  listMessages,
  listMessagesForAccount,
  sendMessage,
  testConnection,
} from "./mailClient.js";
import {
  exchangeGoogleCode,
  exchangeMicrosoftCode,
  getGoogleAuthUrl,
  getGoogleUserInfo,
  getMicrosoftAuthUrl,
  getMicrosoftUserInfo,
  isGoogleConfigured,
  isMicrosoftConfigured,
  oauthErrorPage,
  oauthSuccessPage,
} from "./oauth.js";

dotenv.config({ path: ".env.local" });
dotenv.config();

// Seed env-configured IMAP account into registry on startup
if (isMailConfigured()) {
  const meta = getConfiguredAccount();
  registerAccount({
    ...meta,
    imap: {
      host: process.env.IMAP_HOST,
      port: Number(process.env.IMAP_PORT || 993),
      secure: String(process.env.IMAP_SECURE).toLowerCase() !== "false",
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS,
      mailbox: process.env.IMAP_MAILBOX || "INBOX",
    },
    smtp: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE).toLowerCase() !== "false",
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const PROVIDER_COLORS = {
  gmail: "#d84939",
  office365: "#2563eb",
  yahoo: "#7c3aed",
  aol: "#e03d00",
  imap: "#0f766e",
};

const app = express();
const port = Number(process.env.SERVER_PORT || 8787);
// Short-lived state tokens for OAuth CSRF protection
const oauthStates = new Map();

app.use(express.json({ limit: "1mb" }));

app.get("/api/status", (_req, res) => {
  res.json({
    configured: isMailConfigured(),
    account: isMailConfigured() ? getConfiguredAccount() : null,
    accounts: listAccountMeta(),
  });
});

// Which OAuth providers are ready to use
app.get("/api/auth/status", (_req, res) => {
  res.json({
    google: isGoogleConfigured(),
    microsoft: isMicrosoftConfigured(),
  });
});

// ── Google OAuth ──────────────────────────────────────────────────────────────

app.get("/api/auth/google", (req, res) => {
  if (!isGoogleConfigured()) {
    return res.status(400).send(oauthErrorPage("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set in .env.local"));
  }
  const state = randomUUID();
  oauthStates.set(state, { provider: "google", ts: Date.now() });
  res.redirect(getGoogleAuthUrl(state));
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.send(oauthErrorPage(error));
  if (!oauthStates.has(state)) return res.send(oauthErrorPage("Invalid or expired OAuth state."));
  oauthStates.delete(state);

  try {
    const tokens = await exchangeGoogleCode(code);
    const userInfo = await getGoogleUserInfo(tokens.access_token);
    const id = `gmail-${Date.now()}`;
    const account = {
      id,
      provider: "gmail",
      name: userInfo.name || userInfo.email,
      email: userInfo.email,
      color: PROVIDER_COLORS.gmail,
      status: "synced",
      imap: { host: "imap.gmail.com", port: 993, secure: true, user: userInfo.email, accessToken: tokens.access_token, mailbox: "INBOX" },
      smtp: { host: "smtp.gmail.com", port: 465, secure: true, user: userInfo.email, accessToken: tokens.access_token },
      tokens,
    };
    registerAccount(account);
    const { imap: _i, smtp: _s, tokens: _t, ...meta } = account;
    res.send(oauthSuccessPage(meta));
  } catch (err) {
    res.send(oauthErrorPage(err.message));
  }
});

// ── Microsoft OAuth ───────────────────────────────────────────────────────────

app.get("/api/auth/microsoft", (req, res) => {
  if (!isMicrosoftConfigured()) {
    return res.status(400).send(oauthErrorPage("MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET are not set in .env.local"));
  }
  const state = randomUUID();
  oauthStates.set(state, { provider: "microsoft", ts: Date.now() });
  res.redirect(getMicrosoftAuthUrl(state));
});

app.get("/api/auth/microsoft/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.send(oauthErrorPage(req.query.error_description || error));
  if (!oauthStates.has(state)) return res.send(oauthErrorPage("Invalid or expired OAuth state."));
  oauthStates.delete(state);

  try {
    const tokens = await exchangeMicrosoftCode(code);
    const userInfo = await getMicrosoftUserInfo(tokens.access_token);
    const id = `office365-${Date.now()}`;
    const email = userInfo.mail || userInfo.userPrincipalName;
    const account = {
      id,
      provider: "office365",
      name: userInfo.displayName || email,
      email,
      color: PROVIDER_COLORS.office365,
      status: "synced",
      imap: { host: "outlook.office365.com", port: 993, secure: true, user: email, accessToken: tokens.access_token, mailbox: "INBOX" },
      smtp: { host: "smtp.office365.com", port: 587, secure: false, user: email, accessToken: tokens.access_token },
      tokens,
    };
    registerAccount(account);
    const { imap: _i, smtp: _s, tokens: _t, ...meta } = account;
    res.send(oauthSuccessPage(meta));
  } catch (err) {
    res.send(oauthErrorPage(err.message));
  }
});

// ── Account management ────────────────────────────────────────────────────────

app.get("/api/accounts", (_req, res) => {
  res.json(listAccountMeta());
});

app.post("/api/accounts", async (req, res) => {
  const { provider = "imap", label, email, password, imap, smtp } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

  const imapCreds = { ...imap, user: email, pass: password };
  const smtpCreds = { ...smtp, user: email, pass: password };

  try {
    await testConnection(imapCreds);
  } catch (err) {
    return res.status(400).json({ error: `Could not connect to ${imap?.host}: ${err.message}` });
  }

  const id = `${provider}-${Date.now()}`;
  const accountEntry = {
    id,
    provider,
    name: label || email,
    email,
    color: PROVIDER_COLORS[provider] || "#0f766e",
    status: "synced",
    imap: imapCreds,
    smtp: smtpCreds,
  };
  registerAccount(accountEntry);
  const { imap: _i, smtp: _s, ...meta } = accountEntry;
  res.json(meta);
});

app.delete("/api/accounts/:id", (req, res) => {
  removeAccount(req.params.id);
  res.json({ removed: true });
});

// ── Messages ──────────────────────────────────────────────────────────────────

app.get("/api/messages", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 30), 100);
    const { accountId } = req.query;

    if (accountId) {
      const entry = getAccountEntry(accountId);
      if (!entry) return res.status(404).json({ error: "Account not found." });
      const messages = await listMessagesForAccount(entry, { limit });
      const { imap: _i, smtp: _s, tokens: _t, ...meta } = entry;
      return res.json({ account: meta, messages });
    }

    res.json({ account: getConfiguredAccount(), messages: await listMessages({ limit }) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/send", async (req, res) => {
  try {
    const { accountId, ...message } = req.body;
    const accountEntry = accountId ? getAccountEntry(accountId) : null;
    res.json(await sendMessage({ ...message, accountEntry }));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/messages/:uid/archive", async (req, res) => {
  try {
    res.json(await archiveMessageByUid(Number(req.params.uid)));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/messages/:uid/delete", async (req, res) => {
  try {
    res.json(await deleteMessageByUid(Number(req.params.uid)));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Mail API listening on http://localhost:${port}`);
  if (isGoogleConfigured()) console.log("  Google OAuth: ready");
  else console.log("  Google OAuth: add GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET to .env.local");
  if (isMicrosoftConfigured()) console.log("  Microsoft OAuth: ready");
  else console.log("  Microsoft OAuth: add MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET to .env.local");
});

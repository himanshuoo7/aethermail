const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v1/userinfo";
const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MICROSOFT_USERINFO_URL = "https://graph.microsoft.com/v1.0/me";

function serverBase() {
  return `http://localhost:${process.env.SERVER_PORT || 8787}`;
}

function appBase() {
  return process.env.APP_URL || "http://localhost:5173";
}

export function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function isMicrosoftConfigured() {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

export function getGoogleAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${serverBase()}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile https://mail.google.com/",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(code) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${serverBase()}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data;
}

export async function getGoogleUserInfo(accessToken) {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

export function getMicrosoftAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    redirect_uri: `${serverBase()}/api/auth/microsoft/callback`,
    response_type: "code",
    scope: "openid email profile offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send",
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeMicrosoftCode(code) {
  const res = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      redirect_uri: `${serverBase()}/api/auth/microsoft/callback`,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data;
}

export async function getMicrosoftUserInfo(accessToken) {
  const res = await fetch(MICROSOFT_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

// Renders a popup close page that posts the account back to the opener
export function oauthSuccessPage(account) {
  return `<!DOCTYPE html>
<html>
<head><title>Connected</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px;background:#fffaf2">
  <p style="font-size:1.1rem;color:#172026">✓ Connected to <strong>${account.name}</strong></p>
  <p style="color:#68737d;font-size:0.9rem">Closing…</p>
  <script>
    if (window.opener) {
      window.opener.postMessage(${JSON.stringify({ type: "OAUTH_ACCOUNT_ADDED", account })}, "*");
      setTimeout(() => window.close(), 800);
    } else {
      document.body.innerHTML += '<p>You can close this tab and return to AetherMail.</p>';
    }
  </script>
</body>
</html>`;
}

export function oauthErrorPage(message) {
  return `<!DOCTYPE html>
<html>
<head><title>Sign-in failed</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px;background:#fff5f5">
  <p style="font-size:1.1rem;color:#b42318">Sign-in failed</p>
  <p style="color:#5c4d30">${message}</p>
  <script>
    if (window.opener) {
      window.opener.postMessage(${JSON.stringify({ type: "OAUTH_ERROR", message })}, "*");
      setTimeout(() => window.close(), 2500);
    }
  </script>
</body>
</html>`;
}

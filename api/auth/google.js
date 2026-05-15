import { randomBytes } from "node:crypto";

function getBase(req) {
  if (process.env.APP_URL) return process.env.APP_URL;
  const host = req.headers.host;
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

export default function handler(req, res) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).send("GOOGLE_CLIENT_ID is not configured.");
  }
  const state = randomBytes(16).toString("hex");
  const redirectUri = `${getBase(req)}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile https://mail.google.com/",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  // ACTIVE DEBUG: View this in your browser at /api/auth/google
  res.setHeader("Content-Type", "text/plain");
  return res.send(`DEBUG OAUTH CONFIGURATION:
---------------------------
Client ID: [${process.env.GOOGLE_CLIENT_ID}]
Redirect URI: [${redirectUri}]
APP_URL Env: [${process.env.APP_URL || "not set"}]
---------------------------
Note: Redirect is disabled. If you see this, the code is live.`);
}

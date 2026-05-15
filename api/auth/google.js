import { randomBytes } from "node:crypto";

export default function handler(req, res) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).send("GOOGLE_CLIENT_ID is not configured in environment variables.");
  }
  const state = randomBytes(16).toString("hex");
  const host = req.headers.host;
  const proto = host.startsWith("localhost") ? "http" : "https";
  const redirectUri = `${proto}://${host}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile https://mail.google.com/",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  res.setHeader("Set-Cookie", `g_state=${state}; HttpOnly; Path=/api/auth/google; SameSite=Lax; Max-Age=600`);
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

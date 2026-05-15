import { randomBytes } from "node:crypto";

export default function handler(req, res) {
  if (!process.env.MICROSOFT_CLIENT_ID) {
    return res.status(500).send("MICROSOFT_CLIENT_ID is not configured in environment variables.");
  }
  const state = randomBytes(16).toString("hex");
  const host = req.headers.host;
  const proto = host.startsWith("localhost") ? "http" : "https";
  const redirectUri = `${proto}://${host}/api/auth/microsoft/callback`;

  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile offline_access Mail.ReadWrite Mail.Send",
    state,
  });

  res.setHeader("Set-Cookie", `ms_state=${state}; HttpOnly; Path=/api/auth/microsoft; SameSite=Lax; Max-Age=600`);
  res.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`);
}

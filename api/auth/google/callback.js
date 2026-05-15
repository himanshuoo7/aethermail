function closePage(payload) {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!DOCTYPE html><html><head><title>Signing in…</title></head>
<body style="font-family:sans-serif;text-align:center;padding:48px;background:#fffaf2">
<p style="font-size:1.05rem;color:#172026">Connecting your account…</p>
<script>
try {
  const data = ${json};
  if (window.opener) {
    window.opener.postMessage(data, "*");
    setTimeout(() => window.close(), 600);
  } else {
    document.body.innerHTML = data.type === "OAUTH_SUCCESS"
      ? "<p style='color:#0f766e'>✓ Connected! You can close this tab.</p>"
      : "<p style='color:#b42318'>Error: " + data.message + "</p>";
  }
} catch(e) { document.body.textContent = "Error: " + e.message; }
</script></body></html>`;
}

export default async function handler(req, res) {
  const { code, error, state } = req.query;

  if (error) {
    res.setHeader("Content-Type", "text/html");
    return res.send(closePage({ type: "OAUTH_ERROR", message: error }));
  }

  if (!code) {
    res.setHeader("Content-Type", "text/html");
    return res.send(closePage({ type: "OAUTH_ERROR", message: "No authorization code received." }));
  }

  try {
    const host = req.headers.host;
    const proto = host.startsWith("localhost") ? "http" : "https";
    const redirectUri = `${proto}://${host}/api/auth/google/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    const userRes = await fetch("https://www.googleapis.com/oauth2/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const user = await userRes.json();

    const account = {
      id: `gmail-${user.id}`,
      provider: "gmail",
      name: user.name || user.email,
      email: user.email,
      picture: user.picture,
      color: "#d84939",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
    };

    res.setHeader("Content-Type", "text/html");
    res.send(closePage({ type: "OAUTH_SUCCESS", account }));
  } catch (err) {
    res.setHeader("Content-Type", "text/html");
    res.send(closePage({ type: "OAUTH_ERROR", message: err.message }));
  }
}

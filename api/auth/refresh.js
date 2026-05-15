export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { provider, refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: "refreshToken is required" });

  try {
    let tokenRes, tokens;

    if (provider === "gmail") {
      tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });
      tokens = await tokenRes.json();
    } else if (provider === "office365") {
      tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.MICROSOFT_CLIENT_ID,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
          scope: "openid email profile offline_access Mail.ReadWrite Mail.Send",
        }),
      });
      tokens = await tokenRes.json();
    } else {
      return res.status(400).json({ error: "Unsupported provider" });
    }

    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    res.json({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || refreshToken,
      expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

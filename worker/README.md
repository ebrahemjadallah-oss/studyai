# StudyAI AI Proxy (Cloudflare Workers)

This proxy keeps Groq and OpenRouter API keys on the server instead of inside the public app.

## Deploy

1. Install Node.js 22+ and Wrangler: `npm install -g wrangler`.
2. Sign in: `wrangler login`.
3. From this folder, add provider keys as Worker secrets:

   ```sh
   wrangler secret put GROQ_API_KEY
   wrangler secret put OPENROUTER_API_KEY
   ```

   You can configure only one provider; the other will return a clear not-configured error.

4. Review `ALLOWED_ORIGINS` in `wrangler.toml`. Keep only the exact website and native WebView origins you control.
5. Deploy:

   ```sh
   wrangler deploy
   ```

6. Copy the Worker URL into StudyAI → Settings → Secure StudyAI Proxy URL.

## Security notes

- Provider URLs are fixed in the Worker; users cannot submit an arbitrary upstream URL.
- API secrets are read from Worker environment secrets and are never returned to clients.
- Origins are allow-listed; messages, roles, model identifiers and body size are validated.
- A weighted Cloudflare Rate Limiting binding is configured at 30 units per minute per client IP and charges more units for larger prompts. Cloudflare documents these limits as approximate and location-specific, so also configure provider budget limits and a Cloudflare WAF rate-limiting rule.
- This public demo proxy does not implement user accounts or per-user quotas. Treat it as an early-stage gateway, monitor usage, and do not launch public paid access until identity, billing and stricter abuse controls are added.
- This Worker intentionally does not store prompts or responses. The AI providers process prompts according to their own terms and retention settings.
- Do not add provider secrets to `wrangler.toml`, Git, browser storage, or the Capacitor app.

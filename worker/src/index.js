const PROVIDERS = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions'
};

function corsHeaders(origin, allowed) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers || {})
  });
}

function validMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 16) return false;
  let total = 0;
  for (const message of messages) {
    if (!message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string') return false;
    if (message.content.length > 24000) return false;
    total += message.content.length;
  }
  return total <= 100000;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);

    if (!allowed.includes(origin)) {
      return json({ error: 'Origin not allowed.' }, 403);
    }

    const headers = corsHeaders(origin, allowed);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname !== '/chat/completions' || request.method !== 'POST') {
      return json({ error: 'Not found.' }, 404, headers);
    }

    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > 250000) return json({ error: 'Request too large.' }, 413, headers);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON.' }, 400, headers);
    }

    const provider = body && body.provider;
    const model = body && body.model;
    const messages = body && body.messages;
    const secret = provider === 'groq' ? env.GROQ_API_KEY :
      provider === 'openrouter' ? env.OPENROUTER_API_KEY : null;
    const endpoint = PROVIDERS[provider];

    if (!endpoint || !secret) return json({ error: 'Provider is not configured.' }, 400, headers);
    if (typeof model !== 'string' || model.length > 128 || !/^[a-zA-Z0-9._:/-]+$/.test(model)) {
      return json({ error: 'Invalid model.' }, 400, headers);
    }
    if (!validMessages(messages)) return json({ error: 'Invalid or oversized messages.' }, 400, headers);

    try {
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + secret,
          'Content-Type': 'application/json',
          ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://ebrahemjadallah-oss.github.io/studyai', 'X-Title': 'StudyAI' } : {})
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: Number.isFinite(body.temperature) ? Math.min(1, Math.max(0, body.temperature)) : 0.4,
          max_tokens: 4096
        })
      });

      const responseText = await upstream.text();
      if (!upstream.ok) {
        return json({ error: 'The AI provider returned HTTP ' + upstream.status + '.', providerStatus: upstream.status }, upstream.status, headers);
      }
      return new Response(responseText, {
        status: 200,
        headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers)
      });
    } catch {
      return json({ error: 'Unable to reach the AI provider.' }, 502, headers);
    }
  }
};

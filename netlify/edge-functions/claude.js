export default async (request, context) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const apiKey = Netlify.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured on the server.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { system, messages, max_tokens } = payload;
  if (!messages) {
    return new Response(JSON.stringify({ error: 'Missing messages.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: max_tokens || 4096,
        system,
        messages,
        stream: true
      })
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to reach Anthropic API: ' + err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => '');
    return new Response(JSON.stringify({ error: 'Anthropic API error ' + upstream.status + ': ' + errText }), {
      status: upstream.status || 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Stream Anthropic's SSE straight through to the client so the connection
  // keeps receiving bytes the whole time (avoids idle-connection/proxy timeouts
  // on long generations) instead of buffering the full response server-side.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};

export const config = { path: '/api/claude' };

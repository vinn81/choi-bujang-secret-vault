function sendJson(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.status(status).json(body);
}

export async function handleNotes(request, response, {
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { error: 'method_not_allowed' });
  }

  const supabaseUrl = env.SUPABASE_URL?.trim();
  const supabaseSecretKey = env.SUPABASE_SECRET_KEY?.trim();
  if (!supabaseUrl || !supabaseSecretKey) {
    return sendJson(response, 500, { error: 'server_not_configured' });
  }

  try {
    const parsedUrl = new URL(supabaseUrl);
    if (parsedUrl.protocol !== 'https:') {
      return sendJson(response, 500, { error: 'server_not_configured' });
    }

    const endpoint = new URL('/rest/v1/notes', parsedUrl);
    endpoint.searchParams.set('select', 'title,content,created_at');
    endpoint.searchParams.set('order', 'created_at.asc,title.asc');
    const upstream = await fetchImpl(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        apikey: supabaseSecretKey,
      },
      redirect: 'error',
    });
    if (!upstream.ok) {
      return sendJson(response, 500, { error: 'notes_unavailable' });
    }
    const data = await upstream.json();

    if (!Array.isArray(data)
        || data.some(note => typeof note?.title !== 'string'
          || typeof note?.content !== 'string')) {
      return sendJson(response, 500, { error: 'notes_unavailable' });
    }

    return sendJson(response, 200, {
      notes: data.map(({ title, content }) => ({ title, content })),
    });
  } catch {
    return sendJson(response, 500, { error: 'notes_unavailable' });
  }
}

export default function handler(request, response) {
  return handleNotes(request, response);
}

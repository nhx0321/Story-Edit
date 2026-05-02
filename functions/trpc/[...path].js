export default async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const pathParts = url.pathname.replace('/trpc/', '');
  const targetUrl = `http://39.107.102.43:3001/trpc/${pathParts}${url.search}`;

  try {
    const resp = await fetch(targetUrl, {
      method: request.method,
      headers: {
        'Content-Type': request.headers.get('content-type') || 'application/json',
      },
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : null,
    });

    const data = await resp.text();
    return new Response(data, {
      status: resp.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response('Backend unreachable', { status: 502 });
  }
}
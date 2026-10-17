import inject from 'light-my-request';
import { createApp } from '@harvestgo/api';

// Run on Node (not Edge) and never cache: this is the whole HarvestGo API.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Build the Express app once per server instance and reuse it between requests.
const app = createApp();

/**
 * Hands the incoming request to the Express app and turns its answer back into a
 * normal web Response. This is what lets the website and the API live in ONE
 * Vercel project: /api/v1/... is answered by this file, no second server needed.
 */
async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (key !== 'content-length') headers[key] = value;
  });

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const payload = hasBody ? Buffer.from(await request.arrayBuffer()) : undefined;

  const res = await inject(app, {
    method: request.method as 'GET',
    url: url.pathname + url.search,
    headers,
    payload,
    remoteAddress: headers['x-forwarded-for']?.split(',')[0]?.trim(),
  });

  const out = new Headers();
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === undefined || key === 'content-length' || key === 'transfer-encoding') continue;
    if (Array.isArray(value)) value.forEach((v) => out.append(key, v)); // e.g. several Set-Cookie
    else out.set(key, String(value));
  }
  const noBody = res.statusCode === 204 || res.statusCode === 304 || request.method === 'HEAD';
  return new Response(noBody ? null : new Uint8Array(res.rawPayload), { status: res.statusCode, headers: out });
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as HEAD,
  handler as OPTIONS,
};

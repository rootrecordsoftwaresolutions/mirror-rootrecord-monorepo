import { NextRequest, NextResponse } from 'next/server';

/** Same host as `NEXT_PUBLIC_ROOTRECORD_API_BASE`; defaults to production API. */
function rootrecordApiBase(): string {
  const b =
    process.env.ROOTRECORD_API_BASE?.trim() ||
    process.env.NEXT_PUBLIC_ROOTRECORD_API_BASE?.trim() ||
    'https://api.rootrecord.info';
  return b.replace(/\/+$/, '');
}

/**
 * Server-side proxy: attaches `X-RR-Wallet-Admin-Key` (if `WALLET_ADMIN_PROXY_SECRET` is set) or
 * `X-RR-Push-Admin-Key` (if only `RR_PUSH_ADMIN_SECRET`) so rootrecord-primary accepts the request.
 * Never expose that secret to the browser — only this route reads it.
 */
async function proxy(request: NextRequest, pathSegments: string[], method: 'GET' | 'POST'): Promise<NextResponse> {
  const proxySecret = process.env.WALLET_ADMIN_PROXY_SECRET?.trim() || '';
  const pushSecret = process.env.RR_PUSH_ADMIN_SECRET?.trim() || '';
  if (!proxySecret && !pushSecret) {
    return NextResponse.json(
      {
        detail:
          'Wallet admin proxy is not configured. Set WALLET_ADMIN_PROXY_SECRET on Vercel (recommended; same as Worker wrangler secret put WALLET_ADMIN_PROXY_SECRET), or RR_PUSH_ADMIN_SECRET matching the Worker.',
      },
      { status: 503 },
    );
  }

  const subPath = pathSegments.filter(Boolean).join('/');
  const search = request.nextUrl.search || '';
  const upstreamUrl = `${rootrecordApiBase()}/api/dev/wallet-admin/${subPath}${search}`;

  const authorization = request.headers.get('Authorization') || '';
  const headers: HeadersInit = {
    ...(proxySecret
      ? { 'X-RR-Wallet-Admin-Key': proxySecret }
      : { 'X-RR-Push-Admin-Key': pushSecret }),
    ...(authorization ? { Authorization: authorization } : {}),
  };

  let body: string | undefined;
  if (method === 'POST') {
    body = await request.text();
    const ct = request.headers.get('Content-Type');
    if (ct) (headers as Record<string, string>)['Content-Type'] = ct;
    else (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const res = await fetch(upstreamUrl, { method, headers, body });
  const text = await res.text();
  const ct = res.headers.get('Content-Type') || 'application/json; charset=utf-8';
  return new NextResponse(text, { status: res.status, headers: { 'Content-Type': ct } });
}

export async function GET(request: NextRequest, context: { params: { path: string[] } }) {
  const path = context.params.path ?? [];
  return proxy(request, path, 'GET');
}

export async function POST(request: NextRequest, context: { params: { path: string[] } }) {
  const path = context.params.path ?? [];
  return proxy(request, path, 'POST');
}

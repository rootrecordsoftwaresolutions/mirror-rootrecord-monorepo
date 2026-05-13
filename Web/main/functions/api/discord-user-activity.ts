/**
 * Same-origin proxy: GET /api/discord-user-activity → rootrecord-api-weather internal route.
 * Requires Pages secret `RR_PUSH_ADMIN_SECRET` (same value as on the Weather API Worker).
 * Optional [vars] `ROOTRECORD_API_WEATHER_BASE` (no trailing slash); defaults to *.workers.dev.
 */
type Env = {
  ROOTRECORD_API_WEATHER_BASE?: string;
  RR_PUSH_ADMIN_SECRET?: string;
};

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  const secret = String(context.env.RR_PUSH_ADMIN_SECRET || "").trim();
  if (!secret) {
    return new Response(JSON.stringify({ ok: false, detail: "RR_PUSH_ADMIN_SECRET is not set on Pages." }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const base =
    String(context.env.ROOTRECORD_API_WEATHER_BASE || "")
      .trim()
      .replace(/\/+$/, "") || "https://rootrecord-api-weather.rootrecord.workers.dev";
  const incoming = new URL(context.request.url);
  const upstream = new URL(`${base}/api/internal/discord-user-activity`);
  const limit = incoming.searchParams.get("limit");
  if (limit) upstream.searchParams.set("limit", limit);

  const res = await fetch(upstream.toString(), {
    headers: {
      "X-RR-Push-Admin-Key": secret,
      "User-Agent": "rootrecord-website/1 (discord-user-activity proxy)",
    },
  });
  const body = await res.arrayBuffer();
  const headers = new Headers();
  const ct = res.headers.get("Content-Type");
  if (ct) headers.set("Content-Type", ct);
  else headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(body, { status: res.status, headers });
};

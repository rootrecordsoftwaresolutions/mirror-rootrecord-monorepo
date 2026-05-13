/**
 * POST /api/discord-activity-daily-rebuild — proxy to weather Worker (Pages secret).
 */
type Env = {
  ROOTRECORD_API_WEATHER_BASE?: string;
  RR_PUSH_ADMIN_SECRET?: string;
};

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
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
  const target = `${base}/api/internal/discord-activity-daily-rebuild`;

  const res = await fetch(target, {
    method: "POST",
    headers: {
      "X-RR-Push-Admin-Key": secret,
      "User-Agent": "rootrecord-website/1 (discord-activity-daily-rebuild)",
      "Content-Type": "application/json",
    },
    body: await context.request.text(),
  });
  const body = await res.arrayBuffer();
  const headers = new Headers();
  const ct = res.headers.get("Content-Type");
  if (ct) headers.set("Content-Type", ct);
  else headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(body, { status: res.status, headers });
};

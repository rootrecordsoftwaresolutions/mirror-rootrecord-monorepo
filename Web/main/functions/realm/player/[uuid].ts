/**
 * GET /realm/player/{minecraftUuid} — public RootStat profile (pretty URL).
 */
type Env = { ASSETS: { fetch: typeof fetch } };

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function onRequestGet(context: {
  request: Request;
  env: Env;
  params: Record<string, string | string[] | undefined>;
}): Promise<Response> {
  const raw = context.params.uuid;
  const uuid = String(Array.isArray(raw) ? raw[0] : raw || "").trim();
  if (!UUID_RE.test(uuid)) {
    return new Response("Not found", { status: 404 });
  }

  const assetUrl = new URL("/realm/player.html", context.request.url);
  const asset = await context.env.ASSETS.fetch(assetUrl.toString());
  if (!asset.ok) {
    return new Response("Player stats page not found.", { status: 404 });
  }

  const html = await asset.text();
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}

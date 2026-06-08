/**
 * GET /realm/player?uuid=… — public RootStat profile (query URL).
 */
type Env = { ASSETS: { fetch: typeof fetch } };

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
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

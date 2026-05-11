import { getPublicSiteOrigin } from '@/lib/siteOrigin';

/**
 * Plain-text robots.txt with leading comments for crawlers that surface
 * documentation links (see Doc-Repo discovery polish).
 * Replaces MetadataRoute `app/robots.ts` so comment lines are preserved.
 */
export function GET() {
  const base = getPublicSiteOrigin().replace(/\/+$/, '');
  const lines = [
    '# solana.rootrecord.info — RootRecord Solana Tools',
    '# Official developer documentation: https://github.com/RootRecord/Doc-Repo',
    '#',
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /_next/',
    'Disallow: /account',
    'Disallow: /my-actions',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ];
  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}

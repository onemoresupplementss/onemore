import { absUrl } from '../lib/site.js';

export function GET() {
  const body = ['User-agent: *', 'Disallow: /checkout/', 'Disallow: /order/', 'Disallow: /api/', '', `Sitemap: ${absUrl('/sitemap-index.xml')}`, ''].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

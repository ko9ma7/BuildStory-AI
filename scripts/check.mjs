import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const dist = path.join(process.cwd(), 'dist');
const required = ['index.html','404.html','manifest.webmanifest','robots.txt','sitemap.xml','.nojekyll','src/app.js','src/styles.css','assets/favicon.svg','assets/favicon-32.png','assets/apple-touch-icon.png','assets/icon-192.png','assets/icon-512.png','assets/og-image.png','assets/github-social.png'];
for (const file of required) await access(path.join(dist, file));
const html = await readFile(path.join(dist, 'index.html'), 'utf8');
if (html.includes('__SITE_URL__')) throw new Error('Unresolved __SITE_URL__ placeholder');
if (!html.includes('og:image') || !html.includes('application/ld+json')) throw new Error('Missing social/SEO metadata');
const js = await readFile(path.join(dist, 'src/app.js'), 'utf8');
if (/\bTODO\b|Lorem ipsum/i.test(js)) throw new Error('Found unfinished placeholder content');
for (const file of ['assets/og-image.png','assets/github-social.png']) {
  const info = await stat(path.join(dist, file));
  if (info.size < 10_000) throw new Error(`${file} looks unexpectedly small`);
}
console.log(`Static verification passed (${required.length} required files).`);

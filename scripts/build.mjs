import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const siteUrl = (process.env.SITE_URL || 'https://USERNAME.github.io/REPOSITORY').replace(/\/$/, '');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'src'), path.join(dist, 'src'), { recursive: true });
await cp(path.join(root, 'public'), dist, { recursive: true });
await cp(path.join(root, '.nojekyll'), path.join(dist, '.nojekyll'));

for (const file of ['index.html']) {
  const source = await readFile(path.join(root, file), 'utf8');
  await writeFile(path.join(dist, file), source.replaceAll('__SITE_URL__', siteUrl));
}
for (const file of ['robots.txt', 'sitemap.xml']) {
  const target = path.join(dist, file);
  const source = await readFile(target, 'utf8');
  await writeFile(target, source.replaceAll('__SITE_URL__', siteUrl));
}

console.log(`Built static site → ${dist}`);
console.log(`Canonical base URL → ${siteUrl}`);

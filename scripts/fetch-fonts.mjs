/**
 * Downloads the TTF of every face the editor offers, so the server can draw
 * lettering as glyph outlines — the same face the customer saw — on the
 * basket picture, the mockup and the production sheet.
 *
 * Google Fonts serves plain TTFs to an old user agent; the weights the
 * editor's thickness steps use are fetched where the family has them.
 *
 *   node scripts/fetch-fonts.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve(process.cwd(), 'assets/fonts');
const UA = 'Mozilla/5.0 (Windows NT 6.1; rv:1.0) Gecko/20100101';

// Kept in step with FONT_SEED in src/personalization/personalization.seed.ts
// (key → Google family). A face without an entry keeps the SVG fallback.
const FACES = {
  'block-classic': 'Inter',
  'block-bold': 'Archivo Black',
  'script-classic': 'Dancing Script',
  'script-signature': 'Great Vibes',
  'serif-varsity': 'Graduate',
  'serif-classic': 'Playfair Display',
  'sans-modern': 'Montserrat',
  'mono-stencil': 'Allerta Stencil',
  'sans-rounded': 'Fredoka',
  'display-bebas': 'Bebas Neue',
  'hand-caveat': 'Caveat',
  'brush-marker': 'Permanent Marker',
  'retro-lobster': 'Lobster',
  'gothic-pirata': 'Pirata One',
  'slab-alfa': 'Alfa Slab One',
  'comic-bangers': 'Bangers',
  'mono-typewriter': 'Courier Prime',
  'serif-elegant': 'Cormorant Garamond',
};
const WEIGHTS = [300, 400, 500, 700, 900];

await mkdir(OUT, { recursive: true });
const manifest = {};
for (const [key, family] of Object.entries(FACES)) {
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${WEIGHTS.join(';')}&display=swap`;
  let css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
  if (!css.includes('@font-face')) css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}&display=swap`, { headers: { 'User-Agent': UA } })).text();
  const faces = [...css.matchAll(/font-weight:\s*(\d+);[\s\S]*?src:\s*url\(([^)]+\.ttf)\)/g)];
  manifest[key] = {};
  for (const [, weight, src] of faces) {
    const file = `${key}-${weight}.ttf`;
    const buf = Buffer.from(await (await fetch(src)).arrayBuffer());
    await writeFile(path.join(OUT, file), buf);
    manifest[key][weight] = file;
  }
  console.log(key, Object.keys(manifest[key]).join(','));
}
await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

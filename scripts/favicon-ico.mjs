// Writes public/favicon.ico (16, 32 and 48 px, PNG inside ICO) from public/favicon.svg, drawn by Chromium,
// for browsers and crawlers that ask for /favicon.ico. Run after changing the logo:
//   PLAYWRIGHT=/path/to/node_modules/playwright-core CHROME=/path/to/chrome node scripts/favicon-ico.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(path.join(process.env.PLAYWRIGHT ?? 'playwright-core', 'index.mjs'));
const pub = fileURLToPath(new URL('../public/', import.meta.url));
const svg = fs.readFileSync(path.join(pub, 'favicon.svg'), 'utf8');
const SIZES = [16, 32, 48];

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage();
const pngs = [];
for (const size of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`);
    await page.waitForFunction(() => document.querySelector('img').complete);
    pngs.push(await page.screenshot({ omitBackground: true }));
}
await browser.close();

// ICO: a 6-byte header, one 16-byte entry per image, then the PNGs.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
let offset = 6 + 16 * pngs.length;
const entries = pngs.map((png, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(SIZES[i] % 256, 0);
    e.writeUInt8(SIZES[i] % 256, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
});
fs.writeFileSync(path.join(pub, 'favicon.ico'), Buffer.concat([header, ...entries, ...pngs]));
console.log(`public/favicon.ico: ${SIZES.join(', ')} px`);

// Writes the smaller and WebP copies of every screenshot in public/shots/ that <Shot> offers through srcset:
//   name-light.jpg  ->  name-light-600.jpg, name-light-1200.jpg, name-light-600.webp, name-light-1200.webp, name-light.webp
// Encoded by Chromium (canvas), so nothing else needs installing. Run after recapturing screenshots:
//   PLAYWRIGHT=/path/to/node_modules/playwright-core CHROME=/path/to/chrome node scripts/shot-variants.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(path.join(process.env.PLAYWRIGHT ?? 'playwright-core', 'index.mjs'));
const dir = fileURLToPath(new URL('../public/shots/', import.meta.url));
export const WIDTHS = [600, 1200];
const sources = fs.readdirSync(dir).filter((f) => /^[a-z-]+-(light|dark)\.jpg$/.test(f));

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage();
for (const file of sources) {
    const data = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, file)).toString('base64');
    const out = await page.evaluate(async ({ data, widths }) => {
        const img = new Image();
        img.src = data;
        await img.decode();
        const encode = (w, type, quality) => {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = Math.round((img.naturalHeight * w) / img.naturalWidth);
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL(type, quality).split(',')[1];
        };
        const result = { full: { webp: encode(img.naturalWidth, 'image/webp', 0.8) } };
        for (const w of widths) if (w < img.naturalWidth) result[w] = { jpg: encode(w, 'image/jpeg', 0.82), webp: encode(w, 'image/webp', 0.8) };
        return result;
    }, { data, widths: WIDTHS });
    const base = file.replace(/\.jpg$/, '');
    const write = (name, b64) => fs.writeFileSync(path.join(dir, name), Buffer.from(b64, 'base64'));
    write(`${base}.webp`, out.full.webp);
    for (const w of WIDTHS) {
        if (!out[w]) continue;
        write(`${base}-${w}.jpg`, out[w].jpg);
        write(`${base}-${w}.webp`, out[w].webp);
    }
    console.log(file, '->', Object.keys(out).join(', '));
}
await browser.close();

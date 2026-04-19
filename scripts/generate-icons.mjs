import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = join(__dirname, '../public/favicon.svg');
const outDir = join(__dirname, '../public/icons');

mkdirSync(outDir, { recursive: true });

const svgBuffer = readFileSync(svgPath);

for (const size of [16, 48, 128]) {
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(join(outDir, `icon${size}.png`));
  console.log(`✓ icon${size}.png`);
}

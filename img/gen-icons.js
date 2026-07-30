const sharp = require("sharp");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(__dirname, "tillflow_logo.png");
const MARK_CROP = { left: 110, top: 60, width: 260, height: 155 };

const DARK_BG = "#0a0a0a";
const INNER_BG = "#1c1919"; // matches the source artwork's own badge background so the mark crop blends in seamlessly
const GOLD = "#d4af37";

function squircleSvg(size) {
  const outerR = Math.round(size * 0.22);
  const inset = Math.round(size * 0.06);
  const innerSize = size - inset * 2;
  const innerR = Math.round(size * 0.16);
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" rx="${outerR}" fill="${DARK_BG}"/>
      <rect x="${inset}" y="${inset}" width="${innerSize}" height="${innerSize}" rx="${innerR}" fill="${INNER_BG}" stroke="${GOLD}" stroke-width="${Math.max(2, Math.round(size * 0.014))}"/>
    </svg>
  `);
}

async function keyOutWhite(input) {
  // The source PNG has no alpha channel and the mark crop's corners fall
  // outside the artwork's circular badge, landing on its white canvas —
  // chroma-key those near-white pixels to transparent so the mark can be
  // composited cleanly onto our own dark icon background.
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225) {
      data[i + 3] = 0;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function buildMarkIcon(size, outPath) {
  const bg = await sharp(squircleSvg(size)).png().toBuffer();
  const markSize = Math.round(size * 0.62);
  const keyed = await keyOutWhite(await sharp(SOURCE).extract(MARK_CROP).png().toBuffer());
  const mark = await sharp(keyed)
    .resize(markSize, markSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const offset = Math.round((size - markSize) / 2);
  await sharp(bg)
    .composite([{ input: mark, left: offset, top: offset }])
    .png()
    .toFile(outPath);
  console.log("wrote", outPath);
}

async function buildFullBadge(size, outPath) {
  await sharp(SOURCE)
    .resize(size, size, { fit: "contain", background: DARK_BG })
    .png()
    .toFile(outPath);
  console.log("wrote", outPath);
}

async function main() {
  await buildMarkIcon(256, path.join(ROOT, "app", "icon.png"));
  await buildMarkIcon(180, path.join(ROOT, "app", "apple-icon.png"));
  await buildMarkIcon(192, path.join(ROOT, "public", "icons", "icon-192.png"));
  await buildMarkIcon(512, path.join(ROOT, "public", "icons", "icon-512.png"));
  await buildMarkIcon(256, path.join(ROOT, "public", "logo-mark.png"));
  await buildFullBadge(512, path.join(ROOT, "public", "logo.png"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

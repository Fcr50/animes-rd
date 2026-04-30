const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const ROOT = process.cwd();
const ASSETS = path.join(ROOT, "assets");

const images = [
  { source: "nyx-full.png", target: "nyx-full.webp", width: 620, quality: 82 },
  { source: "nyx-hero.png", target: "nyx-hero.webp", width: 420, quality: 84 },
  { source: "nyx-icon.png", target: "nyx-icon.webp", width: 128, quality: 82 },
  { source: "rafael-pikachu.png", target: "rafael-pikachu.webp", width: 180, quality: 86 },
];

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function optimizeAssets() {
  for (const image of images) {
    const source = path.join(ASSETS, image.source);
    const target = path.join(ASSETS, image.target);
    const before = (await fs.stat(source)).size;

    await sharp(source)
      .resize({ width: image.width, withoutEnlargement: true })
      .webp({ quality: image.quality, effort: 6 })
      .toFile(target);

    const after = (await fs.stat(target)).size;
    const saved = 100 - (after / before) * 100;
    console.log(
      `${image.source} -> ${image.target}: ${formatKb(before)} -> ${formatKb(after)} (${saved.toFixed(1)}% menor)`,
    );
  }
}

optimizeAssets().catch((error) => {
  console.error(error);
  process.exit(1);
});

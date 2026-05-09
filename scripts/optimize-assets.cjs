const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '../assets');

async function optimizeImages() {
  const files = fs.readdirSync(assetsDir);

  for (const file of files) {
    if (file.endsWith('.png') || file.endsWith('.jpg')) {
      const inputPath = path.join(assetsDir, file);
      const outputPath = path.join(assetsDir, file.replace(/\.(png|jpg)$/, '.webp'));

      try {
        await sharp(inputPath)
          .webp({ quality: 80 })
          .toFile(outputPath);
      } catch (error) {
        console.error(error);
      }
    }
  }
}

optimizeImages();

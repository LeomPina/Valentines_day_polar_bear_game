const fs = require("fs");
const path = require("path");

// CHANGE THIS if your folder path is different
const IMAGES_DIR = path.join(__dirname, "../assets/memory/polar_bear");
const OUTPUT_FILE = path.join(IMAGES_DIR, "manifest.json");

// Allowed image extensions
const EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

const files = fs.readdirSync(IMAGES_DIR)
  .filter(file => EXTENSIONS.includes(path.extname(file).toLowerCase()));

fs.writeFileSync(
  OUTPUT_FILE,
  JSON.stringify(files, null, 2),
  "utf-8"
);

console.log(`✅ manifest.json created with ${files.length} images`);

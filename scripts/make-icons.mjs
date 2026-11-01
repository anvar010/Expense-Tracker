// Renders the app icons from the Tenzo mark. Run: node scripts/make-icons.mjs
import sharp from "sharp";

const SRC = "scripts/tenzo-icon-source.png";

for (const [name, size, pad] of [
  ["icon-192.png", 192, 0], ["icon-512.png", 512, 0],
  ["maskable-512.png", 512, 0.14], // extra safe-zone padding for adaptive icons
  ["apple-touch-icon.png", 180, 0],
]) {
  const inner = Math.round(size * (1 - pad * 2));
  const mark = await sharp(SRC).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#ffffff" } })
    .composite([{ input: mark, gravity: "centre" }]).png().toFile(`public/icons/${name}`);
}
console.log("icons written");

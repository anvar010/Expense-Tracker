// Renders the app icons from one SVG. Run: node scripts/make-icons.mjs
import sharp from "sharp";

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0f172a"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - pad * 2) / 512})">
    <rect x="96" y="150" width="320" height="212" rx="40" fill="#10b981"/>
    <rect x="96" y="196" width="320" height="44" fill="#0f172a" opacity=".28"/>
    <circle cx="352" cy="308" r="26" fill="#0f172a" opacity=".85"/>
  </g>
</svg>`;

for (const [name, size, pad] of [
  ["icon-192.png", 192, 0], ["icon-512.png", 512, 0],
  ["maskable-512.png", 512, 64], // extra safe-zone padding for adaptive icons
  ["apple-touch-icon.png", 180, 0],
]) {
  await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`public/icons/${name}`);
}
console.log("icons written");

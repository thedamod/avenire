import { writeFileSync } from "node:fs";
writeFileSync(
  "renders/node.svg",
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#181818"/><path d="M40 280 C180 20 360 330 600 60" fill="none" stroke="#a5a2e9" stroke-width="1.5"/><text x="40" y="40" fill="#e4e4e4" font-family="sans-serif" font-size="18">Node SVG / cubic Bézier</text></svg>',
);
console.log(process.version);

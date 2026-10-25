// Deterministic star field for an 880×72 canvas (t3code's nightly stage).
const STARS = Array.from({ length: 44 }, (_, index) => {
  const x = (index * 97 + 13) % 880;
  const y = 6 + ((index * 53) % 30);
  const r = 0.4 + ((index * 7) % 3) * 0.1;
  return { x, y, r };
});
const SPARKLES = [
  [70, 30],
  [190, 38],
  [330, 22],
  [470, 34],
  [610, 26],
  [760, 32],
] as const;
const CLOUD =
  "M-12 88C-12 74 0 63 14 63C18 50 30 41 44 41C58 41 70 49 74 62C79 57 86 54 94 54C110 54 123 66 124 82C132 83 138 88 141 96H-12V88Z";
const SMALL_CLOUD =
  "M150 96C151 84 161 75 173 75C176 64 186 57 198 57C210 57 220 64 223 75C231 75 238 80 241 87C250 87 257 91 260 96H150Z";

/** Shared artwork for the home report banner and the scheduled task badge. */
export const NIGHT_SKY_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 72" preserveAspectRatio="xMidYMid slice">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="880" y2="72" gradientUnits="userSpaceOnUse"><stop stop-color="#07152F"/><stop offset=".5" stop-color="#151443"/><stop offset="1" stop-color="#32155B"/></linearGradient>
  <radialGradient id="glow" cx="0" cy="0" r="1" gradientTransform="translate(560 18) rotate(160) scale(320 90)" gradientUnits="userSpaceOnUse"><stop stop-color="#5165D8" stop-opacity=".4"/><stop offset=".5" stop-color="#283075" stop-opacity=".16"/><stop offset="1" stop-color="#07152F" stop-opacity="0"/></radialGradient>
  <linearGradient id="cloud" x1="0" y1="60" x2="288" y2="96" gradientUnits="userSpaceOnUse"><stop stop-color="#4EA4FF" stop-opacity=".5"/><stop offset=".52" stop-color="#696FEA" stop-opacity=".62"/><stop offset="1" stop-color="#A85BEA" stop-opacity=".5"/></linearGradient>
  <filter id="blur" x="-40" y="-40" width="960" height="160" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="4"/></filter>
</defs>
<rect width="880" height="72" fill="url(#sky)"/><rect width="880" height="72" fill="url(#glow)"/>
${STARS.map(({ x, y, r }) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#E4EAFFBF"/>`).join("")}
${SPARKLES.map(([x, y]) => `<path d="M${x - 1.5} ${y}H${x + 1.5}M${x} ${y - 1.5}V${y + 1.5}" stroke="#C8D7FFB3" stroke-width=".6" stroke-linecap="round"/>`).join("")}
<g filter="url(#blur)" transform="translate(0 -32)">
<path d="${CLOUD}" fill="url(#cloud)" fill-opacity=".6"/>
<path d="${CLOUD}" transform="translate(560 0)" fill="url(#cloud)" fill-opacity=".85"/>
<path d="${SMALL_CLOUD}" transform="translate(300 4)" fill="url(#cloud)" fill-opacity=".7"/>
<path d="${CLOUD}" transform="translate(740 -6)" fill="url(#cloud)" fill-opacity=".85"/>
</g></svg>`)}`;

export function NightSky() {
  return (
    <img
      src={NIGHT_SKY_IMAGE}
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full object-cover"
    />
  );
}

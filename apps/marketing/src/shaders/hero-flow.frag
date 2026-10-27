#version 300 es
// The rocket's exhaust as liquid: a GLSL port of design/landing-v4/tools/hero_flow.py.
// One ribbon leaves the nozzle, flows down behind the product window and rises up the
// left edge. Each pixel finds its nearest point on the path (arc position t, signed
// distance u), then layers colour bands across the ribbon. Animated terms: the domain
// warp shimmers, the bands travel outward along t, the ribbon pours out on load
// (uFront), and the pointer drags and parts the liquid.
// The palette is the plume's art palette, built from the dawn tokens.
precision highp float;

const int N = 96;

uniform vec3 uPath[N];   // path points in hero CSS pixels: x, y, normalised arc position t
uniform vec2 uSize;      // hero size in CSS pixels
uniform float uScale;    // CSS pixels per canvas pixel
uniform float uTime;     // seconds
uniform float uFront;    // how far the liquid has poured, in t (> 1 once done)
uniform vec2 uMouse;     // pointer in hero CSS pixels
uniform vec2 uVel;       // smoothed pointer velocity, CSS pixels per frame
uniform float uHover;    // 0..1, pointer over the hero

out vec4 outColor;

float ss(float e0, float e1, float x) {
  float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 c255(float r, float g, float b) { return vec3(r, g, b) / 255.0; }

// Six stops; shorter ramps repeat their last stop at 1.0.
vec3 ramp(float t, float a[6], vec3 c[6]) {
  t = clamp(t, 0.0, 1.0);
  vec3 col = c[0];
  for (int i = 0; i < 5; i++) {
    float span = max(a[i + 1] - a[i], 1e-5);
    col = mix(col, c[i + 1], clamp((t - a[i]) / span, 0.0, 1.0));
  }
  return col;
}

void main() {
  vec2 screen = vec2(gl_FragCoord.x * uScale, uSize.y - gl_FragCoord.y * uScale);
  vec2 p = screen;
  float tau = uTime;

  // Pointer: drag the liquid along the pointer's motion and part it around the cursor.
  vec2 dm = p - uMouse;
  float fall = exp(-dot(dm, dm) / (160.0 * 160.0));
  p -= uVel * 0.9 * fall; // at most ~11 CSS pixels with the 12-pixel velocity cap
  p -= normalize(dm + 1e-4) * 6.0 * uHover * fall;

  // Domain warp (hero_flow.py's, at full resolution), now drifting with time.
  vec2 w = vec2(
    p.x + 18.0 * sin(p.y / 74.0 + 1.3 + tau * 0.55) + 10.0 * sin((p.x + p.y) / 38.0 + tau * 0.9),
    p.y + 18.0 * cos(p.x / 82.0 + 0.4 + tau * 0.45) + 10.0 * sin((p.x - p.y) / 46.0 + 2.0 + tau * 0.8)
  );

  // Nearest point on the path: the closest of every fourth point, then the exact
  // segments around it (37 distance tests instead of 95).
  int coarse = 0;
  float best = 1e20;
  for (int i = 0; i < N; i += 4) {
    vec2 d = w - uPath[i].xy;
    float dd = dot(d, d);
    if (dd < best) {
      best = dd;
      coarse = i;
    }
  }
  best = 1e20;
  float t = 0.0;
  float signedDist = 0.0;
  for (int i = max(coarse - 6, 0); i < min(coarse + 6, N - 1); i++) {
    vec2 a = uPath[i].xy;
    vec2 ab = uPath[i + 1].xy - a;
    float h = clamp(dot(w - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
    vec2 d = w - (a + ab * h);
    float dd = dot(d, d);
    if (dd < best) {
      best = dd;
      t = mix(uPath[i].z, uPath[i + 1].z, h);
      vec2 tang = normalize(ab);
      signedDist = dot(d, vec2(-tang.y, tang.x));
    }
  }

  // While pouring, the leading edge swells like the head of a stream.
  float pouring = 1.0 - ss(0.98, 1.06, uFront);
  float head = 0.4 * exp(-pow((t - uFront) / 0.035, 2.0)) * pouring;

  float width = 20.0 + 50.0 * ss(0.0, 0.12, t) + 260.0 * pow(ss(0.3, 0.95, t), 1.1) + 40.0 * ss(0.6, 1.0, t);
  width *= (1.0 + 0.05 * sin(t * 9.0 - tau * 0.8)) * (1.0 + head);
  float u = signedDist / width;
  // Bands drift across the ribbon and travel outward from the nozzle.
  float ub = u + 0.10 * sin(t * 26.0 + 1.0 - tau * 1.4) + 0.06 * sin(t * 61.0 - tau * 2.2);

  float sa[6] = float[6](0.0, 0.1, 0.3, 0.5, 0.7, 1.0);
  vec3 sc[6] = vec3[6](c255(244.0, 246.0, 255.0), c255(220.0, 228.0, 255.0), c255(169.0, 188.0, 255.0),
                       c255(194.0, 156.0, 242.0), c255(255.0, 169.0, 135.0), c255(255.0, 179.0, 107.0));
  float ma[6] = float[6](0.0, 0.1, 0.3, 0.55, 0.75, 1.0);
  vec3 mc[6] = vec3[6](c255(232.0, 237.0, 255.0), c255(171.0, 196.0, 255.0), c255(127.0, 123.0, 238.0),
                       c255(200.0, 101.0, 214.0), c255(255.0, 95.0, 134.0), c255(255.0, 79.0, 123.0));
  float ia[6] = float[6](0.0, 0.12, 0.4, 0.62, 1.0, 1.0);
  vec3 ic[6] = vec3[6](c255(200.0, 215.0, 255.0), c255(122.0, 108.0, 240.0), c255(106.0, 91.0, 224.0),
                       c255(168.0, 91.0, 234.0), c255(123.0, 91.0, 230.0), c255(123.0, 91.0, 230.0));
  float da[6] = float[6](0.0, 0.3, 1.0, 1.0, 1.0, 1.0);
  vec3 dc[6] = vec3[6](c255(122.0, 108.0, 240.0), c255(59.0, 63.0, 168.0), c255(43.0, 42.0, 120.0),
                       c255(43.0, 42.0, 120.0), c255(43.0, 42.0, 120.0), c255(43.0, 42.0, 120.0));

  vec3 col = ramp(t, da, dc);
  col = mix(col, ramp(t, ia, ic), ss(-0.75, -0.5, ub));
  col = mix(col, ramp(t, ma, mc), ss(-0.15, 0.05, ub));
  col = mix(col, ramp(t, sa, sc), ss(0.42, 0.62, ub));

  float alpha = ss(1.02, 0.86, u) * ss(-1.7, -0.1, u); // crisp crest, long soft tail
  alpha *= ss(0.0, 0.006, t);                           // born at the nozzle
  alpha *= 1.0 - ss(0.86, 1.0, t);                      // dies out up the left edge
  alpha *= 0.86;
  // Pour: nothing past the front yet; the front itself is a little uneven.
  alpha *= ss(uFront + 0.012, uFront - 0.02, t + 0.01 * sin(u * 7.0 + tau * 3.0));
  // Fade before the hero's bottom edge so nothing is cut where the next section starts.
  alpha *= clamp((uSize.y - 60.0 - screen.y) / 260.0, 0.0, 1.0);

  float g = hash(floor(gl_FragCoord.xy)) - 0.5;          // film grain
  col = clamp(col + g * 0.05, 0.0, 1.0); // half of hero_flow.py: the canvas is half resolution
  alpha = clamp(alpha * (1.0 + g * 0.18), 0.0, 1.0);

  outColor = vec4(col * alpha, alpha);
}

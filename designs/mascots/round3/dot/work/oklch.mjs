// oklch → sRGB, relative luminance and contrast, for picking the paper (node work/oklch.mjs "L C H" …)
export function oklch(L, C, H) {
  const h = H * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  const g = v => { v = Math.max(0, Math.min(1, v)); return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)); };
  return { rgb: lin.map(g), Y: 0.2126 * Math.max(0, lin[0]) + 0.7152 * Math.max(0, lin[1]) + 0.0722 * Math.max(0, lin[2]) };
}
export const Yrgb = ([r, g, b]) => { const l = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b); };
export const contrast = (y1, y2) => (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05);
if ((process.argv[1] || '').endsWith('oklch.mjs')) {
  const peach = Yrgb([249, 229, 213]), day = Yrgb([248, 242, 235]), night = Yrgb([29, 23, 19]);
  for (const s of process.argv.slice(2)) {
    const [L, C, H] = s.split(' ').map(Number), o = oklch(L / 100, C, H);
    console.log(s, o.rgb.join(','), 'Y', o.Y.toFixed(3), 'vs peach', contrast(o.Y, peach).toFixed(2), 'vs day', contrast(o.Y, day).toFixed(2), 'vs night', contrast(o.Y, night).toFixed(2));
  }
}

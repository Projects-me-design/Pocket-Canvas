/* Pocket-Canvas — names for colours
 * Copyright (c) 2026 project-tech-me <project-tech-me@protonmail.com>
 *
 * colourName('#3a7be0') → 'Royal Blue' (the closest named colour, compared the way
 * people see colour, not just by numbers). Uses the standard web colour names, written
 * with British spelling.
 */
'use strict';

const COLOUR_NAMES = {
  AliceBlue: 'f0f8ff', AntiqueWhite: 'faebd7', Aquamarine: '7fffd4', Azure: 'f0ffff', Beige: 'f5f5dc',
  Bisque: 'ffe4c4', Black: '000000', BlanchedAlmond: 'ffebcd', Blue: '0000ff', BlueViolet: '8a2be2',
  Brown: 'a52a2a', Burlywood: 'deb887', CadetBlue: '5f9ea0', Chartreuse: '7fff00', Chocolate: 'd2691e',
  Coral: 'ff7f50', CornflowerBlue: '6495ed', Cornsilk: 'fff8dc', Crimson: 'dc143c', Cyan: '00ffff',
  DarkBlue: '00008b', DarkCyan: '008b8b', DarkGoldenrod: 'b8860b', DarkGrey: 'a9a9a9', DarkGreen: '006400',
  DarkKhaki: 'bdb76b', DarkMagenta: '8b008b', DarkOliveGreen: '556b2f', DarkOrange: 'ff8c00', DarkOrchid: '9932cc',
  DarkRed: '8b0000', DarkSalmon: 'e9967a', DarkSeaGreen: '8fbc8f', DarkSlateBlue: '483d8b', DarkSlateGrey: '2f4f4f',
  DarkTurquoise: '00ced1', DarkViolet: '9400d3', DeepPink: 'ff1493', DeepSkyBlue: '00bfff', DimGrey: '696969',
  DodgerBlue: '1e90ff', Firebrick: 'b22222', FloralWhite: 'fffaf0', ForestGreen: '228b22', Gainsboro: 'dcdcdc',
  GhostWhite: 'f8f8ff', Gold: 'ffd700', Goldenrod: 'daa520', Grey: '808080', Green: '008000',
  GreenYellow: 'adff2f', Honeydew: 'f0fff0', HotPink: 'ff69b4', IndianRed: 'cd5c5c', Indigo: '4b0082',
  Ivory: 'fffff0', Khaki: 'f0e68c', Lavender: 'e6e6fa', LavenderBlush: 'fff0f5', LawnGreen: '7cfc00',
  LemonChiffon: 'fffacd', LightBlue: 'add8e6', LightCoral: 'f08080', LightCyan: 'e0ffff', LightGoldenrodYellow: 'fafad2',
  LightGrey: 'd3d3d3', LightGreen: '90ee90', LightPink: 'ffb6c1', LightSalmon: 'ffa07a', LightSeaGreen: '20b2aa',
  LightSkyBlue: '87cefa', LightSlateGrey: '778899', LightSteelBlue: 'b0c4de', LightYellow: 'ffffe0', Lime: '00ff00',
  LimeGreen: '32cd32', Linen: 'faf0e6', Magenta: 'ff00ff', Maroon: '800000', MediumAquamarine: '66cdaa',
  MediumBlue: '0000cd', MediumOrchid: 'ba55d3', MediumPurple: '9370db', MediumSeaGreen: '3cb371', MediumSlateBlue: '7b68ee',
  MediumSpringGreen: '00fa9a', MediumTurquoise: '48d1cc', MediumVioletRed: 'c71585', MidnightBlue: '191970', MintCream: 'f5fffa',
  MistyRose: 'ffe4e1', Moccasin: 'ffe4b5', NavajoWhite: 'ffdead', Navy: '000080', OldLace: 'fdf5e6',
  Olive: '808000', OliveDrab: '6b8e23', Orange: 'ffa500', OrangeRed: 'ff4500', Orchid: 'da70d6',
  PaleGoldenrod: 'eee8aa', PaleGreen: '98fb98', PaleTurquoise: 'afeeee', PaleVioletRed: 'db7093', PapayaWhip: 'ffefd5',
  PeachPuff: 'ffdab9', Peru: 'cd853f', Pink: 'ffc0cb', Plum: 'dda0dd', PowderBlue: 'b0e0e6',
  Purple: '800080', RebeccaPurple: '663399', Red: 'ff0000', RosyBrown: 'bc8f8f', RoyalBlue: '4169e1',
  SaddleBrown: '8b4513', Salmon: 'fa8072', SandyBrown: 'f4a460', SeaGreen: '2e8b57', Seashell: 'fff5ee',
  Sienna: 'a0522d', Silver: 'c0c0c0', SkyBlue: '87ceeb', SlateBlue: '6a5acd', SlateGrey: '708090',
  Snow: 'fffafa', SpringGreen: '00ff7f', SteelBlue: '4682b4', Tan: 'd2b48c', Teal: '008080',
  Thistle: 'd8bfd8', Tomato: 'ff6347', Turquoise: '40e0d0', Violet: 'ee82ee', Wheat: 'f5deb3',
  White: 'ffffff', WhiteSmoke: 'f5f5f5', Yellow: 'ffff00', YellowGreen: '9acd32'
};

// Accepts "#abc", "abc", "#aabbcc" or "aabbcc"; returns "#aabbcc" or null.
function normaliseHex(v) {
  let s = String(v || '').trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(s)) s = s.split('').map((ch) => ch + ch).join('');
  return /^[0-9a-f]{6}$/.test(s) ? '#' + s : null;
}

function hexToLab(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const r = lin((n >> 16) & 255), g = lin((n >> 8) & 255), b = lin(n & 255);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const COLOUR_LAB = Object.entries(COLOUR_NAMES).map(([name, hex]) => ({
  name: name.replace(/([a-z])([A-Z])/g, '$1 $2'),
  lab: hexToLab(hex)
}));

function colourName(hex) {
  const h = normaliseHex(hex);
  if (!h) return '';
  const [l, a, b] = hexToLab(h);
  let best = null, bestD = Infinity;
  for (const c of COLOUR_LAB) {
    const d = (c.lab[0] - l) ** 2 + (c.lab[1] - a) ** 2 + (c.lab[2] - b) ** 2;
    if (d < bestD) { bestD = d; best = c.name; }
  }
  return best;
}

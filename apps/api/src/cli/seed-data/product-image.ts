import sharp from 'sharp';

/**
 * Placeholder product photography for seed data: a clean vector illustration per vertical,
 * tinted with the variant colour, rendered to PNG (4:5, 1200×1500).
 */
const W = 1200;
const H = 1500;

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function curtains(c: string): string {
  const folds = (x0: number, width: number) =>
    Array.from({ length: 7 }, (_, i) => {
      const x = x0 + (i * width) / 7;
      return `<rect x="${x}" y="230" width="${width / 7 + 1}" height="1150" fill="${i % 2 ? shade(c, -0.08) : shade(c, 0.05)}"/>`;
    }).join('');
  return `
    <rect x="250" y="300" width="700" height="900" rx="8" fill="#e8eef2"/>
    <rect x="590" y="300" width="20" height="900" fill="#cfd8de"/>
    <rect x="250" y="740" width="700" height="20" fill="#cfd8de"/>
    <rect x="150" y="205" width="900" height="24" rx="12" fill="${shade(c, -0.3)}"/>
    ${folds(170, 330)}${folds(700, 330)}
    <rect x="0" y="1380" width="${W}" height="120" fill="${shade(c, 0.35)}"/>`;
}

function accessory(c: string): string {
  const rings = Array.from({ length: 9 }, (_, i) => `<circle cx="${230 + i * 92}" cy="720" r="34" fill="none" stroke="${shade(c, -0.15)}" stroke-width="14"/>`).join('');
  return `
    <rect x="140" y="660" width="920" height="40" rx="20" fill="${c}"/>
    <circle cx="140" cy="680" r="48" fill="${shade(c, -0.2)}"/><circle cx="1060" cy="680" r="48" fill="${shade(c, -0.2)}"/>
    ${rings}
    <rect x="220" y="560" width="30" height="110" fill="${shade(c, -0.25)}"/><rect x="950" y="560" width="30" height="110" fill="${shade(c, -0.25)}"/>`;
}

function bed(c: string): string {
  return `
    <rect x="150" y="430" width="900" height="380" rx="40" fill="${shade(c, -0.25)}"/>
    <rect x="120" y="760" width="960" height="330" rx="36" fill="${shade(c, 0.12)}"/>
    <rect x="200" y="680" width="330" height="150" rx="50" fill="${shade(c, 0.3)}"/>
    <rect x="670" y="680" width="330" height="150" rx="50" fill="${shade(c, 0.3)}"/>
    <path d="M120 900 Q600 840 1080 900 L1080 1110 Q600 1150 120 1110 Z" fill="${c}"/>
    <path d="M120 980 Q600 930 1080 980" stroke="${shade(c, -0.12)}" stroke-width="10" fill="none"/>
    <rect x="160" y="1090" width="40" height="120" fill="#8b6f5a"/><rect x="1000" y="1090" width="40" height="120" fill="#8b6f5a"/>`;
}

function sofa(c: string): string {
  return `
    <rect x="200" y="560" width="800" height="330" rx="70" fill="${shade(c, -0.12)}"/>
    <rect x="120" y="700" width="200" height="380" rx="70" fill="${c}"/>
    <rect x="880" y="700" width="200" height="380" rx="70" fill="${c}"/>
    <rect x="250" y="820" width="700" height="200" rx="40" fill="${shade(c, 0.08)}"/>
    <path d="M600 830 L600 1010" stroke="${shade(c, -0.1)}" stroke-width="8"/>
    <rect x="300" y="620" width="180" height="170" rx="40" fill="${shade(c, 0.22)}" transform="rotate(-8 390 705)"/>
    <rect x="720" y="620" width="180" height="170" rx="40" fill="${shade(c, 0.22)}" transform="rotate(8 810 705)"/>
    <rect x="180" y="1070" width="34" height="80" fill="#5b4636"/><rect x="986" y="1070" width="34" height="80" fill="#5b4636"/>`;
}

function abaya(c: string, trim: boolean): string {
  const edge = trim ? `<path d="M600 330 L470 1360 M600 330 L730 1360" stroke="#c9a227" stroke-width="12" fill="none"/>` : '';
  return `
    <circle cx="600" cy="250" r="92" fill="${shade(c, 0.05)}"/>
    <path d="M600 330 C470 340 420 380 400 470 L170 820 L250 880 L430 650 L330 1380 L870 1380 L770 650 L950 880 L1030 820 L800 470 C780 380 730 340 600 330 Z" fill="${c}"/>
    <path d="M600 360 L600 1380" stroke="${shade(c, 0.12)}" stroke-width="6"/>
    ${edge}`;
}

export async function renderProductImage(vertical: string, colorHex: string, variant: 'main' | 'alt'): Promise<Buffer> {
  const c = colorHex.toLowerCase() === '#fafaf7' ? '#e9e6dd' : colorHex;
  const art =
    vertical === 'CURTAINS'
      ? curtains(c)
      : vertical === 'ACCESSORIES'
        ? accessory(c)
        : vertical === 'BEDDING'
          ? bed(c)
          : vertical === 'SOFA_COVERS'
            ? sofa(c)
            : abaya(c, variant === 'alt');
  const bgTop = variant === 'main' ? '#f6f2ea' : '#eef2f1';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bgTop}"/><stop offset="1" stop-color="#e6ddd0"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <ellipse cx="600" cy="1420" rx="460" ry="40" fill="#000" opacity="0.06"/>
    ${art}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Wide banner artwork (1920×840): soft gradient with a vertical-themed illustration on one side. */
export async function renderBannerImage(vertical: string, colorHex: string, accentHex: string): Promise<Buffer> {
  const W2 = 1920;
  const H2 = 840;
  const scale = 0.62;
  const art = vertical === 'CURTAINS' ? curtains(colorHex) : vertical === 'BEDDING' ? bed(colorHex) : vertical === 'SOFA_COVERS' ? sofa(colorHex) : abaya(colorHex, true);
  // The illustration sits in the middle so text can overlay either side (RTL or LTR).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(accentHex, 0.25)}"/><stop offset="1" stop-color="${shade(accentHex, -0.1)}"/></linearGradient></defs>
    <rect width="${W2}" height="${H2}" fill="url(#g)"/>
    <circle cx="${W2 / 2}" cy="${H2 / 2}" r="360" fill="#fff" opacity="0.18"/>
    <g transform="translate(${W2 / 2 - (1200 * scale) / 2} ${H2 / 2 - (1500 * scale) / 2}) scale(${scale})">${art}</g>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

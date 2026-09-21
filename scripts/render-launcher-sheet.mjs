import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const SHEET_PATH = path.join(ROOT, 'artifacts/launch-assets-preview.png');
const TILE_SIZE = 256;
const CELL_WIDTH = 320;
const CELL_HEIGHT = 360;
const SHEET_WIDTH = CELL_WIDTH * 3;
const SHEET_HEIGHT = CELL_HEIGHT * 2 + 112;
const roles = [
  {
    key: 'pasajero',
    label: 'Pasajero',
    background: '#081321',
    foreground: '#ffffff',
  },
  {
    key: 'conductor',
    label: 'Conductor',
    background: '#ffffff',
    foreground: '#081321',
  },
];
const shapes = [
  { key: 'circle', label: 'Redondo' },
  { key: 'square', label: 'Cuadrado' },
  { key: 'squircle', label: 'Squircle' },
];

function svgBuffer(svg) {
  return Buffer.from(svg);
}

function shapeMask(shape) {
  if (shape === 'circle') {
    return svgBuffer(
      `<svg width="${TILE_SIZE}" height="${TILE_SIZE}" xmlns="http://www.w3.org/2000/svg"><circle cx="${TILE_SIZE / 2}" cy="${TILE_SIZE / 2}" r="${TILE_SIZE / 2}" fill="#fff"/></svg>`,
    );
  }
  if (shape === 'squircle') {
    return svgBuffer(
      `<svg width="${TILE_SIZE}" height="${TILE_SIZE}" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="${TILE_SIZE - 2}" height="${TILE_SIZE - 2}" rx="64" fill="#fff"/></svg>`,
    );
  }
  return svgBuffer(
    `<svg width="${TILE_SIZE}" height="${TILE_SIZE}" xmlns="http://www.w3.org/2000/svg"><rect width="${TILE_SIZE}" height="${TILE_SIZE}" fill="#fff"/></svg>`,
  );
}

async function renderTile(role, shape) {
  const imageDir = path.join(
    ROOT,
    `artifacts/dame-pon-${role.key}/assets/images`,
  );
  const background = await sharp(path.join(imageDir, 'adaptive-background.png'))
    .resize(TILE_SIZE, TILE_SIZE)
    .png()
    .toBuffer();
  const foreground = await sharp(path.join(imageDir, 'adaptive-icon.png'))
    .resize(TILE_SIZE, TILE_SIZE)
    .png()
    .toBuffer();
  const composed = await sharp(background)
    .composite([{ input: foreground }])
    .png()
    .toBuffer();

  return sharp(composed)
    .composite([{ input: shapeMask(shape.key), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

function sheetSvg() {
  const roleNames = roles.map((role, index) => {
    const y = 96 + index * (CELL_HEIGHT + 8) + TILE_SIZE + 48;
    return `<text x="48" y="${y}" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#142033">${role.label}</text><text x="48" y="${y + 28}" font-family="Arial, sans-serif" font-size="14" fill="#5d6b7e">${role.background} fondo · ${role.foreground} trazo</text>`;
  });
  const labels = shapes.map((shape, index) => {
    const x = index * CELL_WIDTH + CELL_WIDTH / 2;
    return `<text x="${x}" y="76" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#526174">${shape.label}</text>`;
  });
  const cells = roles.flatMap((_, row) =>
    shapes.map((_, column) => {
      const x = column * CELL_WIDTH + (CELL_WIDTH - TILE_SIZE) / 2;
      const y = 96 + row * (CELL_HEIGHT + 8);
      return `<rect x="${x - 8}" y="${y - 8}" width="${TILE_SIZE + 16}" height="${TILE_SIZE + 16}" rx="18" fill="#ffffff" stroke="#d9e0e8"/><rect x="${x - 4}" y="${y - 4}" width="${TILE_SIZE + 8}" height="${TILE_SIZE + 8}" rx="14" fill="none" stroke="#eef1f5"/>`;
    }),
  );
  return svgBuffer(
    `<svg width="${SHEET_WIDTH}" height="${SHEET_HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f4f6f8"/><text x="48" y="38" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#142033">Dame Pon · launcher preview</text><text x="${SHEET_WIDTH - 48}" y="38" text-anchor="end" font-family="Arial, sans-serif" font-size="14" fill="#6c7888">adaptive foreground 60% · splash 36%</text>${labels.join('')}${cells.join('')}${roleNames.join('')}</svg>`,
  );
}

async function main() {
  await mkdir(path.dirname(SHEET_PATH), { recursive: true });
  const tiles = await Promise.all(
    roles.flatMap((role) =>
      shapes.map((shape) => renderTile(role, shape)),
    ),
  );
  const composites = [
    { input: sheetSvg(), left: 0, top: 0 },
  ];
  tiles.forEach((tile, index) => {
    const row = Math.floor(index / shapes.length);
    const column = index % shapes.length;
    composites.push({
      input: tile,
      left: column * CELL_WIDTH + (CELL_WIDTH - TILE_SIZE) / 2,
      top: 96 + row * (CELL_HEIGHT + 8),
    });
  });
  await sharp({
    create: {
      width: SHEET_WIDTH,
      height: SHEET_HEIGHT,
      channels: 4,
      background: '#f4f6f8',
    },
  })
    .composite(composites)
    .png()
    .toFile(SHEET_PATH);
  console.log(`Wrote ${path.relative(ROOT, SHEET_PATH)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
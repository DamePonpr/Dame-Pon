import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const SOURCE_PATH = path.join(
  ROOT,
  'attached_assets/LOGO_DAME_PON_Fondo_Transp_sin_Titulo_1788603574205.png',
);
const CANVAS_SIZE = 1024;
const ADAPTIVE_FOREGROUND_FRACTION = 0.6;
const SPLASH_FOREGROUND_FRACTION = 0.36;
const LOGO_CORNER_RADIUS_FRACTION = 0.22;

const variants = [
  {
    name: 'pasajero',
    background: '#081321',
    foreground: '#ffffff',
    outputDir: path.join(ROOT, 'artifacts/dame-pon-pasajero/assets/images'),
  },
  {
    name: 'conductor',
    background: '#ffffff',
    foreground: '#081321',
    outputDir: path.join(ROOT, 'artifacts/dame-pon-conductor/assets/images'),
  },
];

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function insideRoundedRect(x, y, width, height, radius) {
  const dx = Math.max(radius - x, 0, x - (width - 1 - radius));
  const dy = Math.max(radius - y, 0, y - (height - 1 - radius));
  return dx * dx + dy * dy <= radius * radius;
}

function expandBounds(bounds, x, y) {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

function boundsWithinExpanded(bounds, container, padding) {
  return (
    bounds.minX >= container.minX - padding
    && bounds.minY >= container.minY - padding
    && bounds.maxX <= container.maxX + padding
    && bounds.maxY <= container.maxY + padding
  );
}

async function extractRoadMask() {
  const { data, info } = await sharp(SOURCE_PATH)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const logoBounds = {
    minX: info.width,
    minY: info.height,
    maxX: -1,
    maxY: -1,
  };

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha >= 128) expandBounds(logoBounds, x, y);
    }
  }

  if (logoBounds.maxX < 0) {
    throw new Error('The source logo has no opaque bounding box.');
  }

  const width = logoBounds.maxX - logoBounds.minX + 1;
  const height = logoBounds.maxY - logoBounds.minY + 1;
  const radius = Math.round(Math.min(width, height) * LOGO_CORNER_RADIUS_FRACTION);
  const visited = new Uint8Array(width * height);
  const components = [];
  const roadAlphaThreshold = 64;

  const isRoadCandidate = (x, y) => {
    if (!insideRoundedRect(x, y, width, height, radius)) return false;
    const sourceX = logoBounds.minX + x;
    const sourceY = logoBounds.minY + y;
    const sourceAlpha = data[(sourceY * info.width + sourceX) * 4 + 3];
    return sourceAlpha < roadAlphaThreshold;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (visited[start] || !isRoadCandidate(x, y)) continue;

      const pixels = [start];
      const bounds = { minX: x, minY: y, maxX: x, maxY: y };
      let head = 0;
      visited[start] = 1;
      while (head < pixels.length) {
        const current = pixels[head];
        head += 1;
        const currentX = current % width;
        const currentY = Math.floor(current / width);
        expandBounds(bounds, currentX, currentY);

        for (const [nextX, nextY] of [
          [currentX - 1, currentY],
          [currentX + 1, currentY],
          [currentX, currentY - 1],
          [currentX, currentY + 1],
        ]) {
          if (
            nextX < 0
            || nextX >= width
            || nextY < 0
            || nextY >= height
          ) {
            continue;
          }
          const next = nextY * width + nextX;
          if (!visited[next] && isRoadCandidate(nextX, nextY)) {
            visited[next] = 1;
            pixels.push(next);
          }
        }
      }
      components.push({ pixels, bounds, area: pixels.length });
    }
  }

  components.sort((left, right) => right.area - left.area);
  const mainRoad = components[0];
  if (!mainRoad) {
    throw new Error('The source logo did not produce a transparent road mask.');
  }

  const selectedComponents = components.filter(
    (component) =>
      component === mainRoad
      || boundsWithinExpanded(component.bounds, mainRoad.bounds, 32),
  );
  const roadBounds = selectedComponents.reduce(
    (bounds, component) => {
      expandBounds(bounds, component.bounds.minX, component.bounds.minY);
      expandBounds(bounds, component.bounds.maxX, component.bounds.maxY);
      return bounds;
    },
    { minX: width, minY: height, maxX: -1, maxY: -1 },
  );
  const mask = Buffer.alloc(width * height * 4);
  const selectedPixels = new Set(
    selectedComponents.flatMap((component) => component.pixels),
  );
  for (const pixel of selectedPixels) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const sourceX = logoBounds.minX + x;
    const sourceY = logoBounds.minY + y;
    const sourceAlpha = data[(sourceY * info.width + sourceX) * 4 + 3];
    const offset = pixel * 4;
    mask[offset] = 255;
    mask[offset + 1] = 255;
    mask[offset + 2] = 255;
    mask[offset + 3] = 255 - sourceAlpha;
  }

  const roadWidth = roadBounds.maxX - roadBounds.minX + 1;
  const roadHeight = roadBounds.maxY - roadBounds.minY + 1;
  const cropped = await sharp(mask, {
    raw: { width, height, channels: 4 },
  })
    .extract({
      left: roadBounds.minX,
      top: roadBounds.minY,
      width: roadWidth,
      height: roadHeight,
    })
    .png()
    .toBuffer();

  return {
    buffer: cropped,
    source: {
      width: info.width,
      height: info.height,
      logoBounds,
      roadBounds: {
        width: roadWidth,
        height: roadHeight,
      },
      selectedComponents: selectedComponents.length,
    },
  };
}

async function tintMask(maskBuffer, color) {
  const { data, info } = await sharp(maskBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgb = hexToRgb(color);

  for (let offset = 0; offset < data.length; offset += info.channels) {
    data[offset] = rgb.r;
    data[offset + 1] = rgb.g;
    data[offset + 2] = rgb.b;
  }

  return sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  }).png().toBuffer();
}

async function centeredLogo(maskBuffer, color, fraction) {
  const tinted = await tintMask(maskBuffer, color);
  const targetWidth = Math.round(CANVAS_SIZE * fraction);
  const resized = await sharp(tinted)
    .resize({ width: targetWidth, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const resizedMetadata = await sharp(resized).metadata();
  const left = Math.round((CANVAS_SIZE - resizedMetadata.width) / 2);
  const top = Math.round((CANVAS_SIZE - resizedMetadata.height) / 2);

  return sharp({
    create: {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();
}

async function solidBackground(color) {
  return sharp({
    create: {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      channels: 4,
      background: { ...hexToRgb(color), alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

async function legacyIcon(maskBuffer, colors) {
  const radius = Math.round(CANVAS_SIZE * LOGO_CORNER_RADIUS_FRACTION);
  const roundedBackground = Buffer.from(
    `<svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg"><rect width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" rx="${radius}" fill="${colors.background}"/></svg>`,
  );
  const foreground = await centeredLogo(
    maskBuffer,
    colors.foreground,
    ADAPTIVE_FOREGROUND_FRACTION,
  );

  return sharp(roundedBackground)
    .composite([{ input: roundedBackground }, { input: foreground }])
    .png()
    .toBuffer();
}

async function splashPreview(maskBuffer, colors) {
  const background = await solidBackground(colors.background);
  const foreground = await centeredLogo(
    maskBuffer,
    colors.foreground,
    SPLASH_FOREGROUND_FRACTION,
  );
  return sharp(background).composite([{ input: foreground }]).png().toBuffer();
}

async function main() {
  const { buffer: roadMask, source } = await extractRoadMask();
  await Promise.all(variants.map(async (variant) => {
    await mkdir(variant.outputDir, { recursive: true });
    const icon = await legacyIcon(roadMask, variant);
    const adaptiveForeground = await centeredLogo(
      roadMask,
      variant.foreground,
      ADAPTIVE_FOREGROUND_FRACTION,
    );
    const adaptiveBackground = await solidBackground(variant.background);
    const splashIcon = await centeredLogo(
      roadMask,
      variant.foreground,
      SPLASH_FOREGROUND_FRACTION,
    );
    const splash = await splashPreview(roadMask, variant);
    await Promise.all([
      writeFile(path.join(variant.outputDir, 'icon.png'), icon),
      writeFile(path.join(variant.outputDir, 'adaptive-icon.png'), adaptiveForeground),
      writeFile(path.join(variant.outputDir, 'adaptive-background.png'), adaptiveBackground),
      writeFile(path.join(variant.outputDir, 'splash-icon.png'), splashIcon),
      writeFile(path.join(variant.outputDir, 'splash.png'), splash),
    ]);
  }));

  console.log(JSON.stringify({
    source,
    extractedRoadBounds: source.roadBounds,
    adaptiveForegroundFraction: ADAPTIVE_FOREGROUND_FRACTION,
    splashForegroundFraction: SPLASH_FOREGROUND_FRACTION,
    variants: variants.map(({ name, background, foreground }) => ({
      name,
      background,
      foreground,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
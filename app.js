const canvas = document.getElementById("patternCanvas");
const ctx = canvas.getContext("2d");
const controls = document.getElementById("controls");
const marker = document.getElementById("textAreaMarker");

const DEFAULT_CANVAS_PADDING = 0;

const state = {
  canvasWidth: 1400,
  canvasHeight: 1400,
  canvasPadding: DEFAULT_CANVAS_PADDING,
  textAreaW: 38,
  textAreaH: 56,
  density: 0.24,
  nodeDots: 0.5,
  flourishes: 0.55,
  lineThickness: 14,
  widthVariation: 0.5,
  taperStrength: 0.7,
  sharpTips: 0.6,
  curveSmoothness: 0.75,
  noOverlapGap: 30,
  mirrorMode: "quad",
  startFromBottom: true,
  // --- Metal / 3D material ---
  fxMetal: true,
  fxMetalPreset: "chrome",
  fxMetalRelief: 0.55,
  fxMetalLightAngle: 135,
  fxMetalSpec: 0.85,
  fxMetalSpecSharp: 0.6,
  fxMetalIridescence: 0,
  fxMetalTint: "#ffffff",
  fxMetalTintAmount: 0,
  fxMetalShadow: 0.45,
  fxMetalQuality: 0.65,
  bgColor: "#f6f4ee",
  bgAlpha: 1,
  strokeColor: "#111111",
  strokeAlpha: 1,
  backgroundImage: null,
  paths: [],
  progress: 1,
  seed: Date.now(),
};

let backgroundImageUrl;

// Decorative font for text-pattern mode — loaded async, falls back to Georgia
let _patternFontFamily = 'Georgia, "Times New Roman", serif';
(function preloadPatternFont() {
  if (typeof FontFace === "undefined") return;
  try {
    const ff = new FontFace("Superfluous01", "url('/assets/Superfluous01.woff2')");
    ff.load().then((loaded) => {
      document.fonts.add(loaded);
      _patternFontFamily = "Superfluous01, Georgia, serif";
    }).catch(() => {});
  } catch (e) {}
})();


const sliders = Array.from(document.querySelectorAll("input[type='range'][data-key]"));
const numberInputs = Array.from(document.querySelectorAll("input[type='number'][data-key]"));

function rand(min = 0, max = 1) {
  state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
  return min + (state.seed / 4294967296) * (max - min);
}

function chance(value) {
  return rand() < value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function blendAngle(from, to, amount) {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + diff * clamp(amount, 0, 1);
}

function hexToRgba(hex, alpha = 1) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => `${c}${c}`).join("") : clean;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => `${c}${c}`).join("") : clean;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function rgbToRgba(color, alpha = 1) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${clamp(alpha, 0, 1)})`;
}

function colorToRgba(color, alpha = 1) {
  return typeof color === "string" ? hexToRgba(color, alpha) : rgbToRgba(color, alpha);
}

function drawImageCover(image) {
  const imageRatio = image.width / image.height;
  const canvasRatio = canvas.width / canvas.height;
  let drawWidth;
  let drawHeight;
  let drawX = 0;
  let drawY = 0;

  if (imageRatio > canvasRatio) {
    drawHeight = canvas.height;
    drawWidth = drawHeight * imageRatio;
    drawX = (canvas.width - drawWidth) / 2;
  } else {
    drawWidth = canvas.width;
    drawHeight = drawWidth / imageRatio;
    drawY = (canvas.height - drawHeight) / 2;
  }
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const PERCENT_KEYS = new Set(["textAreaW", "textAreaH"]);

function syncInputs() {
  [...sliders, ...numberInputs].forEach((input) => {
    const key = input.dataset.key;
    input.value = state[key];
  });
  document.querySelectorAll("[data-val]").forEach((el) => {
    const key = el.dataset.val;
    const value = state[key];
    if (typeof value !== "number") return;
    if (PERCENT_KEYS.has(key)) el.textContent = `${Math.round(value)}%`;
    else el.textContent = Number.isInteger(value) ? `${value}` : value.toFixed(2);
  });
}

function resizeCanvas() {
  canvas.width = Math.round(state.canvasWidth);
  canvas.height = Math.round(state.canvasHeight);
  updateMarker(true);
}

function getPatternPaddingPx() {
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  return (minSide * clamp(state.canvasPadding, 0, 24)) / 100;
}

function getVisualBleedAllowancePx() {
  return state.lineThickness * 2.2;
}

function getPatternSafeMarginPx() {
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  return clamp(getPatternPaddingPx() + getVisualBleedAllowancePx(), minSide * 0.035, minSide * 0.34);
}

function getTextRect(pad = 0) {
  const w = (state.canvasWidth * state.textAreaW) / 100;
  const h = (state.canvasHeight * state.textAreaH) / 100;
  return {
    x: state.canvasWidth / 2 - w / 2 - pad,
    y: state.canvasHeight / 2 - h / 2 - pad,
    w: w + pad * 2,
    h: h + pad * 2,
  };
}

function pointInTextRect(x, y, pad = 0) {
  const rect = getTextRect(pad);
  return x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h;
}

function pointBlocked(x, y, pad = 0) {
  return pointInTextRect(x, y, pad);
}

function createSeedPoint(signX, signY, margin, gapPad) {
  const cx = state.canvasWidth / 2;
  const cy = state.canvasHeight / 2;
  const rect = getTextRect(gapPad);
  const isQuad = state.mirrorMode === "quad";
  const fromBottom = state.startFromBottom && !isQuad;
  const minX = signX < 0 ? margin : cx + rect.w / 2 + rand(0, margin);
  const maxX = signX < 0 ? cx - rect.w / 2 - rand(0, margin) : state.canvasWidth - margin;
  const minY = fromBottom ? state.canvasHeight * 0.72 : signY < 0 ? margin : cy + rect.h / 2 + rand(0, margin);
  const maxY = fromBottom ? state.canvasHeight - margin : signY < 0 ? cy - rect.h / 2 - rand(0, margin) : state.canvasHeight - margin;

  let x = rand(Math.min(minX, maxX), Math.max(minX, maxX));
  let y = rand(Math.min(minY, maxY), Math.max(minY, maxY));


  if (pointBlocked(x, y, gapPad)) {
    x = clamp(cx + signX * rand(gapPad + 20, state.canvasWidth * 0.42), margin, state.canvasWidth - margin);
    y = fromBottom
      ? rand(Math.min(state.canvasHeight - margin, state.canvasHeight * 0.74), state.canvasHeight - margin)
      : clamp(cy + signY * rand(gapPad + 20, state.canvasHeight * 0.42), margin, state.canvasHeight - margin);
  }
  return { x: clamp(x, margin, state.canvasWidth - margin), y: clamp(y, margin, state.canvasHeight - margin) };
}

function createCurlPath(signX, signY, options = {}) {
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const margin = getPatternSafeMarginPx();
  const gapPad = minSide * 0.02;
  const smoothness = clamp(options.curveSmoothness ?? state.curveSmoothness, 0, 1);
  const start = createSeedPoint(signX, signY, margin, gapPad);

  // Fluid swash strand. Direction is driven by a curvature profile — a couple
  // of slow sine terms plus a gentle bias — so the heading is always C1-smooth
  // and the line reads as one continuous calligraphic gesture. Per-step angle
  // noise (the old approach) can only ever produce wobble, never flow.
  const length = minSide * rand(0.4, 1.15) * (0.7 + smoothness * 0.4);
  const steps = Math.round(clamp(length / (minSide * 0.006), 60, 260));
  const ds = length / steps;

  let heading = state.startFromBottom
    ? -Math.PI / 2 + rand(-0.8, 0.8)
    : Math.atan2(-signY, -signX) + rand(-0.9, 0.9);

  // Turn-rate profile (radians per step). Low frequencies → long S-curves.
  const f1 = rand(0.5, 1.6);
  const f2 = rand(1.8, 3.6);
  const a1 = rand(0.025, 0.075) * (1.35 - smoothness * 0.7);
  const a2 = rand(0.006, 0.028) * (1.35 - smoothness * 0.9);
  const ph1 = rand(0, Math.PI * 2);
  const ph2 = rand(0, Math.PI * 2);
  const bias = rand(-0.014, 0.014);

  // Optional terminals: wind the tail (and sometimes the head) into a spiral
  // by ramping the turn rate while shrinking the step, like a swash curl.
  const tailCurl = chance(0.6);
  const headCurl = !tailCurl || chance(0.25);
  const tailDir = chance(0.5) ? 1 : -1;
  const headDir = chance(0.5) ? 1 : -1;
  const tailStart = rand(0.7, 0.85);
  const headEnd = rand(0.1, 0.2);

  const points = [];
  let x = start.x;
  let y = start.y;
  points.push({ x, y });

  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    let turn = bias + a1 * Math.sin(t * Math.PI * 2 * f1 + ph1) + a2 * Math.sin(t * Math.PI * 2 * f2 + ph2);
    let step = ds;

    if (tailCurl && t > tailStart) {
      const u = (t - tailStart) / (1 - tailStart);
      turn = turn * (1 - u) + tailDir * (0.09 + u * u * 0.5);
      step = ds * (1 - u * 0.55);
    } else if (headCurl && t < headEnd) {
      const u = 1 - t / headEnd;
      turn = turn * (1 - u) + headDir * (0.09 + u * u * 0.5);
      step = ds * (1 - u * 0.55);
    }

    heading += turn;

    // Soft edge steering: blend the heading back toward the canvas centre as
    // the strand nears a margin, instead of clamping (which drew wall-slides).
    const edge = minSide * 0.11;
    const dLeft = x - margin, dRight = state.canvasWidth - margin - x;
    const dTop = y - margin, dBottom = state.canvasHeight - margin - y;
    const dEdge = Math.min(dLeft, dRight, dTop, dBottom);
    if (dEdge < edge) {
      const inward = Math.atan2(state.canvasHeight / 2 - y, state.canvasWidth / 2 - x);
      heading = blendAngle(heading, inward, (1 - dEdge / edge) * 0.4);
    }

    const nx = x + Math.cos(heading) * step;
    const ny = y + Math.sin(heading) * step;

    // A blocked zone ends the strand cleanly — a kinked detour reads as a
    // glitch in an otherwise continuous gesture.
    if (pointBlocked(nx, ny, gapPad)) break;
    if (nx < margin || nx > state.canvasWidth - margin || ny < margin || ny > state.canvasHeight - margin) break;

    x = nx;
    y = ny;
    points.push({ x, y });
  }

  // A strand that got cut down to a stub (blocked zone, margin) reads as
  // debris, not a gesture — reject it and let the caller try another seed.
  if (points.length < steps * 0.45) return { type: "curl", points: [], width: 1, phase: 0, branches: [] };

  const smoothed = smoothPolyline(points, 1, 0.5);
  // Mix bold swashes with hairline accents, like a lettering artist's sheet.
  const width = (chance(0.3) ? rand(0.3, 0.5) : rand(0.6, 1.3)) * state.lineThickness;

  // Node beads: small bulbs sitting on the line at joints and curl tips —
  // the connective language of the reference flourishes.
  const dots = [];
  const dotLevel = clamp(state.nodeDots, 0, 1);
  if (dotLevel > 0.02) {
    const dotCount = Math.floor(rand(0, 4.2) * dotLevel);
    for (let d = 0; d < dotCount; d += 1) {
      const p = smoothed[Math.floor(rand(smoothed.length * 0.08, smoothed.length * 0.92))];
      dots.push({ x: p.x, y: p.y, r: width * rand(0.55, 1.15) });
    }
    if (tailCurl && chance(0.7)) {
      const p = smoothed[Math.floor(smoothed.length * 0.94)];
      dots.push({ x: p.x, y: p.y, r: width * rand(0.7, 1.1) });
    }
    if (headCurl && chance(0.5)) {
      const p = smoothed[Math.floor(smoothed.length * 0.06)];
      dots.push({ x: p.x, y: p.y, r: width * rand(0.7, 1.1) });
    }
  }

  return {
    type: "curl",
    points: simplifyBlockedSegments(smoothed),
    width,
    phase: rand(0, Math.PI * 2),
    branches: [],
    dots,
  };
}
function smoothPolyline(points, passes = 2, pull = 0.75) {
  if (points.length < 3) return points;
  let current = points.map((p) => ({ ...p }));
  for (let pass = 0; pass < passes; pass += 1) {
    const next = [current[0]];
    for (let i = 1; i < current.length - 1; i += 1) {
      const prev = current[i - 1];
      const now = current[i];
      const after = current[i + 1];
      const avgX = (prev.x + now.x * 2 + after.x) / 4;
      const avgY = (prev.y + now.y * 2 + after.y) / 4;
      next.push({
        x: now.x * (1 - pull) + avgX * pull,
        y: now.y * (1 - pull) + avgY * pull,
      });
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

function simplifyBlockedSegments(points) {
  return points.filter((point, index) => index === 0 || !pointBlocked(point.x, point.y, 4));
}

function decoratePath(path, options = {}) {
  if (path.points.length < 8 || path.type === "straight" || path.type === "script") return;
  const flourishLevel = clamp(options.flourishes ?? state.flourishes, 0, 1);
  const branchCount = Math.floor(rand(0.6, 3.4) * flourishLevel);
  for (let i = 0; i < branchCount; i += 1) {
    const index = Math.floor(rand(2, path.points.length - 3));
    const prev = path.points[index - 1];
    const next = path.points[index + 1];
    const tangent = Math.atan2(next.y - prev.y, next.x - prev.x);
    const branch = createBranch(path.points[index], tangent, path.width, flourishLevel);
    if (branch.points.length > 2) path.branches.push(branch);
  }
}

function createBranch(anchor, tangent, width, flourishLevel = state.flourishes) {
  // A branch is a smooth arc that peels off the parent: constant-sign turn
  // rate that eases up along its length, optionally winding into a curl.
  const points = [];
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const length = minSide * rand(0.06, 0.2) * (0.6 + flourishLevel * 0.7);
  const steps = Math.floor(rand(18, 40));
  const ds = length / steps;
  const side = chance(0.5) ? 1 : -1;
  const baseTurn = side * rand(0.015, 0.06);
  const curl = chance(0.4 + flourishLevel * 0.4);
  const curlStart = rand(0.6, 0.8);
  let angle = tangent + side * rand(0.5, 1.1);
  let x = anchor.x;
  let y = anchor.y;

  for (let i = 0; i < steps; i += 1) {
    const t = i / steps;
    let turn = baseTurn * (0.5 + t * 0.9);
    let step = ds;
    if (curl && t > curlStart) {
      const u = (t - curlStart) / (1 - curlStart);
      turn = turn + side * u * u * 0.5;
      step = ds * (1 - u * 0.66);
    }
    angle += turn;
    x += Math.cos(angle) * step;
    y += Math.sin(angle) * step;
    if (pointBlocked(x, y, 6)) break;
    points.push({ x, y });
  }

  return { points: smoothPolyline(points, 1, 0.5), width: Math.max(1, width * rand(0.3, 0.55)) };
}
function mirrorPoint(point, mirrorX, mirrorY) {
  return {
    x: mirrorX ? state.canvasWidth - point.x : point.x,
    y: mirrorY ? state.canvasHeight - point.y : point.y,
  };
}

function mirrorPath(path, mirrorX, mirrorY) {
  return {
    ...path,
    points: path.points.map((point) => mirrorPoint(point, mirrorX, mirrorY)),
    branches: path.branches.map((branch) => ({
      ...branch,
      points: branch.points.map((point) => mirrorPoint(point, mirrorX, mirrorY)),
    })),
    dots: (path.dots || []).map((dot) => ({ ...mirrorPoint(dot, mirrorX, mirrorY), r: dot.r })),
  };
}

function collectPathPoints(path) {
  const result = [];
  for (let i = 0; i < path.points.length; i += 2) {
    result.push(path.points[i]);
  }
  for (const branch of path.branches) {
    for (let i = 0; i < branch.points.length; i += 2) {
      result.push(branch.points[i]);
    }
  }
  return result;
}

function getCellKey(x, y, size) {
  return `${Math.floor(x / size)},${Math.floor(y / size)}`;
}

function pathOverlaps(points, cellMap, cellSize, minDist) {
  const minDistSq = minDist * minDist;
  for (const point of points) {
    const cx = Math.floor(point.x / cellSize);
    const cy = Math.floor(point.y / cellSize);
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oy = -1; oy <= 1; oy += 1) {
        const bucket = cellMap.get(`${cx + ox},${cy + oy}`);
        if (!bucket) continue;
        for (const other of bucket) {
          const dx = point.x - other.x;
          const dy = point.y - other.y;
          if (dx * dx + dy * dy < minDistSq) return true;
        }
      }
    }
  }
  return false;
}

function addPointsToMap(points, cellMap, cellSize) {
  for (const point of points) {
    const key = getCellKey(point.x, point.y, cellSize);
    if (!cellMap.has(key)) cellMap.set(key, []);
    cellMap.get(key).push(point);
  }
}

// ── Font-contour frame pattern ──────────────────────────────────────────────
// Renders each input character with the decorative font, extracts its pixel
// contours as stroke chains, and places them along the four frame edges.
// Mirror mode is applied exactly as organic paths are mirrored.

// ── Text-on-a-path frame warp ────────────────────────────────────────────────
// Renders the input text as a continuous horizontal strip at large font size,
// extracts pixel contours as stroke chains, then warps each chain point so that
// its x-coordinate maps to arc-distance along the frame perimeter and its
// y-coordinate maps to radial depth (inward from the frame edge).
// This produces a single flowing calligraphic ribbon of letter shapes that
// wraps continuously around all four frame edges.

function buildPattern() {
  state.seed = Date.now() >>> 0;

  const densityValue = clamp(state.density, 0.15, 1);
  const runtime = {
    flourishes: clamp(state.flourishes, 0, 1),
    curveSmoothness: clamp(state.curveSmoothness, 0, 1),
  };

  const count = Math.floor(5 + densityValue * 15);
  const maxAttempts = count * 60;
  const collisionMap = new Map();
  const collisionCell = Math.max(10, state.lineThickness * 1.3);
  const minDistance = Math.max(clamp(state.noOverlapGap, 4, 80), state.lineThickness * 1.45);
  const basePaths = [];
  let attempts = 0;

  const quadMirror = state.mirrorMode === "quad";
  while (basePaths.length < count && attempts < maxAttempts) {
    attempts += 1;
    const seedSignX = (state.mirrorMode === "horizontal" || quadMirror) ? -1 : (chance(0.5) ? -1 : 1);
    const seedSignY = quadMirror ? -1 : (state.startFromBottom ? 1 : -1);
    const path = createCurlPath(seedSignX, seedSignY, runtime);
    decoratePath(path, runtime);
    if (path.points.length <= 2) continue;
    const samples = collectPathPoints(path);
    if (!samples.length) continue;
    // Reference patterns interlace: some strands are allowed to cross freely,
    // the rest keep their distance so the composition doesn't clot.
    const freeCrossing = chance(0.18);
    if (!freeCrossing && pathOverlaps(samples, collisionMap, collisionCell, minDistance)) continue;
    addPointsToMap(samples, collisionMap, collisionCell);
    basePaths.push(path);
  }

  const mirrored = [];
  for (const path of basePaths) {
    mirrored.push(path);
    if (state.mirrorMode === "horizontal") {
      mirrored.push(mirrorPath(path, true, false));
    } else if (state.mirrorMode === "vertical") {
      mirrored.push(mirrorPath(path, false, true));
    } else if (state.mirrorMode === "quad") {
      mirrored.push(mirrorPath(path, true, false));
      mirrored.push(mirrorPath(path, false, true));
      mirrored.push(mirrorPath(path, true, true));
    }
  }

  state.paths = mirrored;
  state.progress = 1;
  draw();
}

function segmentWidth(baseWidth, t, phase) {
  const widthVariation = clamp(state.widthVariation, 0, 1);
  const taperStrength = clamp(state.taperStrength, 0, 1);
  const sharp = clamp(state.sharpTips ?? 0, 0, 1);
  const wave = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 + phase * 1.3);
  const variationScale = (1 - widthVariation * 0.48) + wave * widthVariation;
  // Sharp flame/leaf profile: a fatter body that tapers to a sharp point at the
  // tips. Lower the sine exponent (fuller body) and drive the ends toward zero.
  const falloffExp = 1.08 - sharp * 0.62;
  const edgeFalloff = Math.pow(Math.sin(Math.PI * clamp(t, 0, 1)), falloffExp);
  const tipFloor = 0.18 - sharp * 0.16;
  const taperScale = (1 - taperStrength) + taperStrength * (tipFloor + edgeFalloff * (1 - tipFloor));
  const widthFloor = 0.35 - sharp * 0.23;
  return Math.max(widthFloor, baseWidth * variationScale * taperScale);
}

function strokePathSegments(points, width, drawCount, phase, color, alpha) {
  if (drawCount < 2) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = hexToRgba(color, alpha);
  for (let i = 1; i < drawCount; i += 1) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const t = i / (drawCount - 1);
    ctx.lineWidth = segmentWidth(width, t, phase);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
}
function drawPath(points, width, progress, phase) {
  if (points.length < 2 || progress <= 0) return;
  const drawCount = clamp(Math.ceil(points.length * progress), 2, points.length);

  strokePathSegments(points, width, drawCount, phase, state.strokeColor, state.strokeAlpha);
}

function forEachPathSegment(callback) {
  for (const path of state.paths) {
    callback(path.points, path.width, state.progress, path.phase);
    const branchProgress = clamp(state.progress * 1.2 - 0.15, 0, 1);
    for (const branch of path.branches) {
      callback(branch.points, branch.width, branchProgress, path.phase + 1.7);
    }
  }
}

function paintPathMask(targetCtx, widthScale = 1, expandPx = 0, alpha = 1) {
  targetCtx.save();
  targetCtx.strokeStyle = "#ffffff";
  targetCtx.globalAlpha = clamp(alpha, 0, 1);
  targetCtx.lineCap = "round";
  targetCtx.lineJoin = "round";
  forEachPathSegment((points, width, progress) => {
    if (points.length < 2 || progress <= 0) return;
    const drawCount = clamp(Math.ceil(points.length * progress), 2, points.length);
    targetCtx.lineWidth = Math.max(0.2, width * widthScale + Math.max(0, expandPx) * 2);
    targetCtx.beginPath();
    targetCtx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < drawCount; i += 1) {
      targetCtx.lineTo(points[i].x, points[i].y);
    }
    targetCtx.stroke();
  });
  // Node beads join the same silhouette, so the metal height field swells
  // around them and they fuse with the line like solder beads.
  targetCtx.fillStyle = "#ffffff";
  for (const path of state.paths) {
    for (const dot of path.dots || []) {
      targetCtx.beginPath();
      targetCtx.arc(dot.x, dot.y, Math.max(0.4, dot.r * widthScale + Math.max(0, expandPx)), 0, Math.PI * 2);
      targetCtx.fill();
    }
  }
  targetCtx.restore();
}

function createFxCanvas(scale = 1) {
  const fxCanvas = document.createElement("canvas");
  fxCanvas.width = Math.max(1, Math.round(canvas.width * scale));
  fxCanvas.height = Math.max(1, Math.round(canvas.height * scale));
  return fxCanvas;
}

function tintedMaskLayer(maskCanvas, color, alpha) {
  const layer = createFxCanvas();
  layer.width = maskCanvas.width;
  layer.height = maskCanvas.height;
  const layerCtx = layer.getContext("2d");
  layerCtx.drawImage(maskCanvas, 0, 0);
  layerCtx.globalCompositeOperation = "source-in";
  layerCtx.fillStyle = colorToRgba(color, alpha);
  layerCtx.fillRect(0, 0, layer.width, layer.height);
  return layer;
}

// ─── Metal / 3D material ─────────────────────────────────────────────────────
// Shades the pattern strokes as solid 3D bodies instead of flat lines. The
// stroke mask is blurred into a height field (a blur of a constant-width stroke
// peaks along its centreline, which is exactly a tube cross-section), the height
// field is differentiated into surface normals, and each pixel is then lit as a
// reflective material: an environment ramp sampled by the reflection vector
// (the horizon flash in that ramp is what reads as "chrome"), plus a Blinn-Phong
// specular hotspot and an optional iridescent fringe on the grazing edges.

// Environment ramps, as stops of [t, "#rrggbb"] with t = 0 straight down,
// 0.5 = horizon, 1 = straight up. The tight bright stop either side of 0.5 is
// the horizon flash and is what separates metal from plastic.
const METAL_RAMPS = {
  chrome: [
    [0.0, "#0b0f16"], [0.30, "#39424f"], [0.46, "#8e9aa9"],
    [0.50, "#ffffff"], [0.56, "#cfd7e0"], [0.72, "#6f7885"], [1.0, "#e9eff6"],
  ],
  silver: [
    [0.0, "#232a33"], [0.32, "#5c6673"], [0.47, "#aab4c0"],
    [0.50, "#ffffff"], [0.57, "#dde3ea"], [0.74, "#8d97a3"], [1.0, "#f2f6fa"],
  ],
  gold: [
    [0.0, "#1a0c00"], [0.26, "#7a430a"], [0.44, "#e0a02c"],
    [0.50, "#fffbe8"], [0.57, "#ffcc55"], [0.74, "#8f5410"], [1.0, "#fff3c0"],
  ],
  copper: [
    [0.0, "#2a0f06"], [0.30, "#803a18"], [0.46, "#c9713f"],
    [0.50, "#ffe2cf"], [0.58, "#e08a56"], [0.75, "#8c4526"], [1.0, "#ffd6bb"],
  ],
};

function buildMetalLut(preset, tintHex, tintAmount) {
  const stops = METAL_RAMPS[preset] || METAL_RAMPS.chrome;
  const tint = hexToRgb(tintHex) || { r: 255, g: 255, b: 255 };
  const N = 256;
  const lut = new Uint8ClampedArray(N * 3);
  for (let i = 0; i < N; i += 1) {
    const t = i / (N - 1);
    let a = stops[0], b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s += 1) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
    }
    const span = Math.max(1e-6, b[0] - a[0]);
    const k = clamp((t - a[0]) / span, 0, 1);
    const ca = hexToRgb(a[1]), cb = hexToRgb(b[1]);
    let r = ca.r + (cb.r - ca.r) * k;
    let g = ca.g + (cb.g - ca.g) * k;
    let bl = ca.b + (cb.b - ca.b) * k;
    if (tintAmount > 0.001) {
      // Multiplicative tint keeps the ramp's luminance structure (and so the
      // horizon flash) intact while pulling the whole material toward one hue.
      r = r * (1 - tintAmount) + (r * tint.r) / 255 * tintAmount;
      g = g * (1 - tintAmount) + (g * tint.g) / 255 * tintAmount;
      bl = bl * (1 - tintAmount) + (bl * tint.b) / 255 * tintAmount;
    }
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = bl;
  }
  return lut;
}

function drawMetalFx() {
  if (!state.fxMetal || !state.paths.length) return;

  const W = canvas.width, H = canvas.height;
  // Half-resolution shading: the material is all low-frequency gradients, so the
  // upscale is invisible while the per-pixel loop gets 4x cheaper.
  const scale = clamp(state.fxMetalQuality, 0.35, 1);
  const w = Math.max(1, Math.round(W * scale));
  const h = Math.max(1, Math.round(H * scale));

  // 1. Coverage mask (anti-aliased) — also the final alpha.
  const cover = createFxCanvas(scale);
  const coverCtx = cover.getContext("2d");
  coverCtx.save();
  coverCtx.scale(scale, scale);
  paintPathMask(coverCtx, 1, 0);
  coverCtx.restore();
  const coverData = coverCtx.getImageData(0, 0, w, h).data;

  // 2. Height field: the same mask blurred by ~half the stroke width, so it
  //    peaks along each stroke's centreline and falls off to its edges.
  const relief = clamp(state.fxMetalRelief, 0, 1);
  const blurPx = Math.max(1, state.lineThickness * scale * (0.30 + relief * 0.42));
  const hf = createFxCanvas(scale);
  const hfCtx = hf.getContext("2d");
  hfCtx.save();
  hfCtx.filter = `blur(${blurPx.toFixed(2)}px)`;
  hfCtx.drawImage(cover, 0, 0);
  hfCtx.restore();
  const hData = hfCtx.getImageData(0, 0, w, h).data;

  // Dome profile: remap the blurred ramp so the cross-section is round-topped
  // rather than linear, which is what gives the stroke a tube (not ribbon) read.
  const height = new Float32Array(w * h);
  for (let i = 0, p = 0; i < height.length; i += 1, p += 4) {
    const a = hData[p + 3] / 255;
    height[i] = Math.sqrt(clamp(a, 0, 1));
  }

  // 3. Light setup.
  const ang = (state.fxMetalLightAngle * Math.PI) / 180;
  const lx = Math.cos(ang), ly = Math.sin(ang), lz = 0.72;
  const ll = Math.hypot(lx, ly, lz);
  const Lx = lx / ll, Ly = ly / ll, Lz = lz / ll;
  // View is straight on, so the half-vector is L + (0,0,1) normalised.
  const hx = Lx, hy = Ly, hz = Lz + 1;
  const hl = Math.hypot(hx, hy, hz);
  const Hx = hx / hl, Hy = hy / hl, Hz = hz / hl;

  const bump = 3.0 + relief * 26.0;
  const shininess = 12 + state.fxMetalSpecSharp * 180;
  const specAmt = state.fxMetalSpec;
  const irid = state.fxMetalIridescence;
  const lut = buildMetalLut(state.fxMetalPreset, state.fxMetalTint, state.fxMetalTintAmount);

  const out = ctx.createImageData(w, h);
  const o = out.data;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const alpha = coverData[i * 4 + 3];
      if (alpha === 0) continue;

      // Central differences → surface gradient → normal.
      const xm = x > 0 ? i - 1 : i, xp = x < w - 1 ? i + 1 : i;
      const ym = y > 0 ? i - w : i, yp = y < h - 1 ? i + w : i;
      const gx = (height[xp] - height[xm]) * bump;
      const gy = (height[yp] - height[ym]) * bump;
      const nl = Math.hypot(gx, gy, 1);
      const Nx = -gx / nl, Ny = -gy / nl, Nz = 1 / nl;

      // Reflection of the straight-on view about the normal.
      const Ry = 2 * Nz * Ny; // N · V is just Nz for a straight-on view

      // Environment lookup, indexed by the reflected ray's vertical component.
      const t = clamp(Ry * 0.5 + 0.5, 0, 1);
      let idx = Math.round(t * 255) * 3;
      let r = lut[idx], g = lut[idx + 1], b = lut[idx + 2];

      if (irid > 0.001) {
        // Split the ramp lookup per channel so grazing angles fringe into
        // rainbow, the way a thin film / anodised metal does.
        const spread = irid * 0.16 * (1 - Nz);
        const ir = Math.round(clamp(t + spread, 0, 1) * 255) * 3;
        const ib = Math.round(clamp(t - spread, 0, 1) * 255) * 3;
        r = r * (1 - irid) + lut[ir] * irid;
        b = b * (1 - irid) + lut[ib + 2] * irid;
        g = g * (1 - irid * 0.4) + lut[idx + 1] * irid * 0.4;
      }

      // Metal is near-pure reflection, so the diffuse term only nudges the
      // ramp — weighting it any higher turns the material into matte paint.
      const diff = Math.max(0, Nx * Lx + Ny * Ly + Nz * Lz);
      const shade = 0.82 + diff * 0.30;
      r *= shade; g *= shade; b *= shade;

      // Sharp specular hotspot on top.
      const nh = Math.max(0, Nx * Hx + Ny * Hy + Nz * Hz);
      const spec = Math.pow(nh, shininess) * specAmt * 255;
      r += spec; g += spec; b += spec;

      // Ambient occlusion in the crevices where strokes cross.
      const ao = 0.78 + 0.22 * height[i];
      const p = i * 4;
      o[p] = clamp(r * ao, 0, 255);
      o[p + 1] = clamp(g * ao, 0, 255);
      o[p + 2] = clamp(b * ao, 0, 255);
      o[p + 3] = alpha;
    }
  }

  const shaded = createFxCanvas(scale);
  shaded.getContext("2d").putImageData(out, 0, 0);

  // 4. Contact shadow underneath, so the material sits above the ground.
  const drop = state.fxMetalShadow;
  if (drop > 0.001) {
    const off = state.lineThickness * (0.35 + relief * 0.5);
    ctx.save();
    ctx.globalAlpha = clamp(drop * 0.75, 0, 1);
    ctx.globalCompositeOperation = "multiply";
    ctx.filter = `blur(${(state.lineThickness * 0.55).toFixed(2)}px)`;
    ctx.drawImage(tintedMaskLayer(cover, "#000000", 1), off * 0.7, off, W, H);
    ctx.filter = "none";
    ctx.restore();
  }

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.globalAlpha = clamp(state.strokeAlpha, 0, 1);
  ctx.drawImage(shaded, 0, 0, W, H);
  ctx.restore();
}

function draw() {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state.backgroundImage) {
    drawImageCover(state.backgroundImage);
  }

  ctx.fillStyle = hexToRgba(state.bgColor, state.bgAlpha);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // The metal material shades the strokes as lit 3D bodies, so the flat stroke
  // fill underneath it would only ever show through as a hard silhouette edge.
  if (!state.fxMetal) {
    for (const path of state.paths) {
      drawPath(path.points, path.width, state.progress, path.phase);
      for (const branch of path.branches) {
        drawPath(branch.points, branch.width, clamp(state.progress * 1.2 - 0.15, 0, 1), path.phase + 1.7);
      }
      ctx.fillStyle = hexToRgba(state.strokeColor, state.strokeAlpha);
      for (const dot of path.dots || []) {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  drawMetalFx();
  ctx.restore();
}

function updateMarker(force = false) {
  const rect = canvas.getBoundingClientRect();
  marker.style.width = `${rect.width * state.textAreaW / 100}px`;
  marker.style.height = `${rect.height * state.textAreaH / 100}px`;
  if (!force) {
    marker.style.transition = "opacity 0.1s";
    marker.style.opacity = "1";
    clearTimeout(updateMarker.timeout);
    updateMarker.timeout = setTimeout(() => {
      marker.style.transition = "opacity 0.5s";
      marker.style.opacity = "0";
    }, 500);
  }
}

function tryAnchorDownload(url, fileName) {
  const link = document.createElement("a");
  link.download = fileName;
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  link.remove();
}

function downloadPng() {
  const fileName = `eternal-pattern-${Date.now()}.png`;
  const failMessage = "Download is blocked in this browser tab. A preview will open; right-click the image to save.";
  const fileProtocolMode = window.location.protocol === "file:";

  try {
    const dataUrl = canvas.toDataURL("image/png");
    tryAnchorDownload(dataUrl, fileName);
    if (fileProtocolMode) {
      window.open(dataUrl, "_blank", "noopener");
      alert("You are in file:// mode. If download is blocked, use the opened image tab and Save As.");
    }
    return;
  } catch (dataUrlErr) {
    console.error(dataUrlErr);
  }

  try {
    canvas.toBlob((blob) => {
      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        try {
          tryAnchorDownload(objectUrl, fileName);
        } finally {
          setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
        }
        return;
      }

      try {
        const dataUrl = canvas.toDataURL("image/png");
        tryAnchorDownload(dataUrl, fileName);
      } catch (dataErr) {
        const fallback = window.open("", "_blank");
        if (fallback) fallback.document.write(`<title>${fileName}</title><p style="font-family:monospace;padding:16px;">${failMessage}</p>`);
        alert("Download failed. This canvas may be blocked by browser security (cross-origin image).");
        console.error(dataErr);
      }
    }, "image/png");
  } catch (blobErr) {
    alert("Download failed. This canvas may be blocked by browser security (cross-origin image).");
    console.error(blobErr);
  }
}

async function handleBackgroundUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (backgroundImageUrl) URL.revokeObjectURL(backgroundImageUrl);
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = imageUrl;
    await image.decode();
    state.backgroundImage = image;
    backgroundImageUrl = imageUrl;
    document.getElementById("clearBg").disabled = false;
    document.getElementById("bgFileName").textContent = file.name;
    state.bgAlpha = 0;
    draw();
  } catch {
    URL.revokeObjectURL(imageUrl);
    event.target.value = "";
  }
}

function clearBackgroundImage() {
  if (backgroundImageUrl) {
    URL.revokeObjectURL(backgroundImageUrl);
    backgroundImageUrl = undefined;
  }
  state.backgroundImage = null;
  document.getElementById("bgUpload").value = "";
  document.getElementById("clearBg").disabled = true;
  document.getElementById("bgFileName").textContent = "No background image";
  draw();
}

function bindControls() {
  const rebuildKeys = new Set([
    "canvasWidth",
    "canvasHeight",
    "canvasPadding",
    "textAreaW",
    "textAreaH",
    "density",
    "nodeDots",
    "flourishes",
    "lineThickness",
    "widthVariation",
    "taperStrength",
    "curveSmoothness",
    "noOverlapGap",
  ]);

  sliders.forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.key;
      state[key] = Number(input.value);
      syncInputs();
      if (key.startsWith("textArea")) updateMarker();
      if (key === "canvasWidth" || key === "canvasHeight") resizeCanvas();
      if (rebuildKeys.has(key)) {
        buildPattern();
      } else {
        draw();
      }
    });
  });

  numberInputs.forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.key;
      state[key] = Number(input.value);
      syncInputs();
      if (key === "canvasWidth" || key === "canvasHeight") {
        resizeCanvas();
        buildPattern();
      } else {
        draw();
      }
    });
  });


  document.querySelectorAll("input[name='mirrorMode']").forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      state.mirrorMode = radio.value;
      buildPattern();
    });
  });

  document.getElementById("fxMetalPresetInput").addEventListener("change", (event) => {
    state.fxMetalPreset = event.target.value;
    draw();
  });
  document.getElementById("fxMetalTintInput").addEventListener("input", (event) => {
    state.fxMetalTint = event.target.value;
    draw();
  });

  document.getElementById("canvasPresets").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-size]");
    if (!button) return;
    const size = button.dataset.size;
    const presets = {
      full: [window.innerWidth * 2, window.innerHeight * 2],
      "9x16": [1080, 1920],
      "4x5": [1080, 1350],
      "16x9": [1920, 1080],
    };
    [state.canvasWidth, state.canvasHeight] = presets[size];
    syncInputs();
    resizeCanvas();
    buildPattern();
  });


  document.querySelectorAll(".group-head").forEach((head) => {
    head.addEventListener("click", () => head.parentElement.classList.toggle("open"));
  });

  document.getElementById("generateButton").addEventListener("click", buildPattern);
  document.getElementById("downloadButton").addEventListener("click", downloadPng);
  document.getElementById("startFromBottomToggle").addEventListener("change", (event) => {
    state.startFromBottom = event.target.checked;
    buildPattern();
  });
  document.getElementById("bgUpload").addEventListener("change", handleBackgroundUpload);
  document.getElementById("clearBg").addEventListener("click", clearBackgroundImage);

  window.addEventListener("resize", () => {
    updateMarker(true);
  });
}

document.getElementById("startFromBottomToggle").checked = state.startFromBottom;
document.getElementById("fxMetalPresetInput").value = state.fxMetalPreset;
document.getElementById("fxMetalTintInput").value = state.fxMetalTint;
document.querySelectorAll("input[name='mirrorMode']").forEach((radio) => {
  radio.checked = radio.value === state.mirrorMode;
});


syncInputs();
resizeCanvas();
bindControls();
buildPattern();

const canvas = document.getElementById("patternCanvas");
const ctx = canvas.getContext("2d");
const controls = document.getElementById("controls");
const marker = document.getElementById("textAreaMarker");
const logoMarker = document.getElementById("logoPlaceholderMarker");

const DEFAULT_CANVAS_PADDING = 0;

const state = {
  canvasWidth: 1400,
  canvasHeight: 1400,
  canvasPadding: DEFAULT_CANVAS_PADDING,
  textAreaW: 38,
  textAreaH: 56,
  logoX: 50,
  logoY: 22,
  logoW: 26,
  logoH: 18,
  logoOpacity: 1,
  density: 0.24,
  nodeDots: 0.5,
  straightLines: 0,
  flourishes: 0.55,
  blankAreas: 0,
  lineThickness: 14,
  widthVariation: 0.5,
  taperStrength: 0.85,
  sharpTips: 0.8,
  curveSmoothness: 0.75,
  circleGuideDensity: 0.52,
  circleGuideInfluence: 0.68,
  circleMinRadius: 2.4,
  circleMaxRadius: 9.5,
  noOverlapGap: 30,
  mirrorMode: "quad",
  startFromBottom: true,
  useCircleScaffold: false,
  showGuides: false,
  crayonEffect: false,
  crayonStrength: 0.45,
  fxWaxTexture: false,
  fxWaxStrength: 0.52,
  fxEdgeLightShadow: false,
  fxEdgeStrength: 0.48,
  fxBubbleBlur: false,
  fxBubbleStrength: 0.04,
  fxBubbleBlurDensity: 1,
  fxBubbleOutlinePx: 1,
  fxBubbleGrain: 0,
  fxBubbleGlowColor: "#ff0000",
  fxGlassPolish: false,
  fxGlassOpacity: 0.42,
  fxGlassShine: 0.58,
  fxEmbossDepth: false,
  fxEmbossStrength: 0.34,
  fxHalftoneNoise: false,
  fxHalftoneMix: 0.38,
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
  visibleTime: 1.3,
  speed: 0.012,
  colorChoice: "black",
  bgColor: "#f6f4ee",
  bgColor2: "#e7e2d6",
  bgGradient: false,
  bgAlpha: 1,
  strokeColor: "#111111",
  strokeAlpha: 1,
  outlineStroke: false,
  outlineColor: "#f6f4ee",
  outlineAlpha: 1,
  backgroundImage: null,
  logoImage: null,
  animate: false,
  paths: [],
  blankZones: [],
  guideCircles: [],
  guideLinks: [],
  progress: 1,
  hold: 0,
  lastFrame: performance.now(),
  audioLevel: 0,
  audioBassLevel: 0,
  audioMidLevel: 0,
  audioTrebleLevel: 0,
  audioBeat: 0,
  audioTransient: 0,
  audioAverage: 0.04,
  audioMotionPhase: 0,
  seed: Date.now(),
};

let audioContext;
let analyser;
let audioSource;
let audioSourceElement;
let audioElement;
let audioObjectUrl;
let oscillator;
let gainNode;
let demoPlaying = false;
let backgroundImageUrl;
let logoImageUrl;
let halftoneNoiseCache = { key: "", canvas: null };

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

const colorModes = {
  black: { bg: "#f8f8f6", bgAlpha: 1, stroke: "#050505", strokeAlpha: 1, outline: false },
  "black outlines": { bg: "#f8f8f6", bgAlpha: 1, stroke: "#050505", strokeAlpha: 1, outline: true },
  white: { bg: "#050505", bgAlpha: 1, stroke: "#ffffff", strokeAlpha: 1, outline: false },
  "white outlines": { bg: "#050505", bgAlpha: 1, stroke: "#ffffff", strokeAlpha: 1, outline: true },
};

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

function stableNoise(value) {
  const raw = Math.sin(value * 12.9898) * 43758.5453;
  return raw - Math.floor(raw);
}

function isAudioPlaying() {
  return demoPlaying || Boolean(audioElement && !audioElement.paused);
}

function isAudioMotionActive() {
  return isAudioPlaying() || state.audioLevel > 0.003 || state.audioBeat > 0.003;
}

function audioMotion() {
  if (!isAudioMotionActive()) {
    return { active: false, energy: 0, bass: 0, mid: 0, treble: 0, beat: 0, transient: 0, phase: state.audioMotionPhase };
  }
  return {
    active: true,
    energy: clamp(state.audioLevel, 0, 1),
    bass: clamp(state.audioBassLevel, 0, 1),
    mid: clamp(state.audioMidLevel, 0, 1),
    treble: clamp(state.audioTrebleLevel, 0, 1),
    beat: clamp(state.audioBeat, 0, 1),
    transient: clamp(state.audioTransient, 0, 1),
    phase: state.audioMotionPhase,
  };
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

function mixRgb(colorA, colorB, amount) {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  const t = clamp(amount, 0, 1);
  return {
    r: Math.round(a.r * (1 - t) + b.r * t),
    g: Math.round(a.g * (1 - t) + b.g * t),
    b: Math.round(a.b * (1 - t) + b.b * t),
  };
}

function rgbToRgba(color, alpha = 1) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${clamp(alpha, 0, 1)})`;
}

function colorToRgba(color, alpha = 1) {
  return typeof color === "string" ? hexToRgba(color, alpha) : rgbToRgba(color, alpha);
}

function applyColorPreset(modeKey) {
  const preset = colorModes[modeKey] || colorModes.black;
  state.bgColor = preset.bg;
  state.bgAlpha = preset.bgAlpha;
  state.strokeColor = preset.stroke;
  state.strokeAlpha = preset.strokeAlpha;
  state.outlineStroke = preset.outline;
  state.outlineColor = preset.bg;
  state.outlineAlpha = preset.bgAlpha;
  syncColorInputs();
}

// DOM half of applyColorPreset. Called on its own at boot so the inputs reflect
// the default state without a preset overwriting the state's own colours.
function syncColorInputs() {
  document.getElementById("bgColorInput").value = state.bgColor;
  document.getElementById("bgAlphaInput").value = state.bgAlpha;
  document.getElementById("strokeColorInput").value = state.strokeColor;
  document.getElementById("strokeAlphaInput").value = state.strokeAlpha;
  document.getElementById("outlineToggle").checked = state.outlineStroke;
  document.getElementById("outlineColorInput").value = state.outlineColor;
  document.getElementById("outlineAlphaInput").value = state.outlineAlpha;
  document.getElementById("fxPatternColorInput").value = state.strokeColor;
  document.getElementById("bgAlphaValue").textContent = state.bgAlpha.toFixed(2);
  document.getElementById("strokeAlphaValue").textContent = state.strokeAlpha.toFixed(2);
  document.getElementById("outlineAlphaValue").textContent = state.outlineAlpha.toFixed(2);
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

function drawLogoImage() {
  if (!state.logoImage) return;
  const rect = getLogoRect();
  const imageRatio = state.logoImage.width / state.logoImage.height;
  const rectRatio = rect.w / rect.h;
  let drawW;
  let drawH;
  let drawX = rect.x;
  let drawY = rect.y;

  if (imageRatio > rectRatio) {
    drawW = rect.w;
    drawH = drawW / imageRatio;
    drawY = rect.y + (rect.h - drawH) / 2;
  } else {
    drawH = rect.h;
    drawW = drawH * imageRatio;
    drawX = rect.x + (rect.w - drawW) / 2;
  }

  ctx.save();
  ctx.globalAlpha = clamp(state.logoOpacity, 0, 1);
  ctx.drawImage(state.logoImage, drawX, drawY, drawW, drawH);
  ctx.restore();
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function syncInputs() {
  [...sliders, ...numberInputs].forEach((input) => {
    const key = input.dataset.key;
    input.value = state[key];
  });
  document.getElementById("textAreaWValue").textContent = `${Math.round(state.textAreaW)}%`;
  document.getElementById("textAreaHValue").textContent = `${Math.round(state.textAreaH)}%`;
}

function setCanvasFillAlpha(value) {
  state.bgAlpha = clamp(value, 0, 1);
  document.getElementById("bgAlphaInput").value = state.bgAlpha;
  document.getElementById("bgAlphaValue").textContent = state.bgAlpha.toFixed(2);
}

function resizeCanvas() {
  canvas.width = Math.round(state.canvasWidth);
  canvas.height = Math.round(state.canvasHeight);
  updateMarker(true);
  updateLogoMarker(true);
}

function getPatternPaddingPx() {
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  return (minSide * clamp(state.canvasPadding, 0, 24)) / 100;
}

function getVisualBleedAllowancePx() {
  const bubbleAllowance = state.fxBubbleBlur ? 46 + state.fxBubbleStrength * 28 + state.fxBubbleOutlinePx : 0;
  return state.lineThickness * 2.2 + bubbleAllowance;
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

function getLogoRect() {
  const w = (state.canvasWidth * state.logoW) / 100;
  const h = (state.canvasHeight * state.logoH) / 100;
  const cx = (state.canvasWidth * state.logoX) / 100;
  const cy = (state.canvasHeight * state.logoY) / 100;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function pointInTextRect(x, y, pad = 0) {
  const rect = getTextRect(pad);
  return x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h;
}

function pointInLogoRect(x, y, pad = 0) {
  if (!state.logoImage) return false;
  const rect = getLogoRect();
  return x > rect.x - pad && x < rect.x + rect.w + pad && y > rect.y - pad && y < rect.y + rect.h + pad;
}

function pointInBlankZone(x, y) {
  return state.blankZones.some((zone) => {
    const dx = (x - zone.x) / zone.rx;
    const dy = (y - zone.y) / zone.ry;
    return dx * dx + dy * dy < 1;
  });
}

function pointBlocked(x, y, pad = 0) {
  return pointInTextRect(x, y, pad) || pointInLogoRect(x, y, pad) || pointInBlankZone(x, y);
}

function segmentHitsBlocked(a, b, pad = 0, samples = 10) {
  for (let i = 1; i < samples; i += 1) {
    const t = i / samples;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (pointBlocked(x, y, pad)) return true;
  }
  return false;
}

function createBlankZones() {
  state.blankZones = [];
  const count = Math.floor(state.blankAreas * 8);
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  for (let i = 0; i < count; i += 1) {
    const zone = {
      x: rand(state.canvasWidth * 0.12, state.canvasWidth * 0.88),
      y: rand(state.canvasHeight * 0.12, state.canvasHeight * 0.88),
      rx: rand(minSide * 0.035, minSide * 0.12),
      ry: rand(minSide * 0.035, minSide * 0.12),
    };
    if (!pointInTextRect(zone.x, zone.y, minSide * 0.05)) {
      state.blankZones.push(zone);
    }
  }
}

function createCircleGuides(options = {}) {
  state.guideCircles = [];
  state.guideLinks = [];
  if (!state.useCircleScaffold) return;

  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const safeMargin = getPatternSafeMarginPx();
  const density = clamp(options.circleGuideDensity ?? state.circleGuideDensity, 0.1, 1);
  const totalCount = Math.floor(18 + density * 66);
  const baseCount = state.mirrorMode === "none"
    ? totalCount
    : state.mirrorMode === "quad"
      ? Math.ceil(totalCount / 4)
      : Math.ceil(totalCount / 2);
  const maxAttempts = baseCount * 22;
  const minR = minSide * clamp(state.circleMinRadius, 1, 12) / 100;
  const maxR = minSide * Math.max(clamp(state.circleMaxRadius, 2, 18), state.circleMinRadius + 0.5) / 100;
  const baseCircles = [];

  for (let i = 0; i < maxAttempts && baseCircles.length < baseCount; i += 1) {
    const r = rand(minR, maxR);
    const edge = Math.min(minSide * 0.42, safeMargin + r);
    let xMin = edge;
    let xMax = state.canvasWidth - edge;
    let yMin = edge;
    let yMax = state.canvasHeight - edge;

    if (state.mirrorMode === "horizontal") {
      xMax = Math.max(xMin, state.canvasWidth / 2 - minSide * 0.025 - r * 0.3);
    } else if (state.mirrorMode === "vertical") {
      if (state.startFromBottom) {
        yMin = Math.min(yMax, state.canvasHeight / 2 + minSide * 0.025 + r * 0.3);
      } else {
        yMax = Math.max(yMin, state.canvasHeight / 2 - minSide * 0.025 - r * 0.3);
      }
    } else if (state.mirrorMode === "quad") {
      // Base geometry lives in the top-left quadrant, mirrored to all four.
      xMax = Math.max(xMin, state.canvasWidth / 2 - minSide * 0.025 - r * 0.3);
      yMax = Math.max(yMin, state.canvasHeight / 2 - minSide * 0.025 - r * 0.3);
    }

    const x = rand(xMin, xMax);
    const yBase = state.startFromBottom ? Math.pow(rand(), 2.15) : rand();
    let y = clamp((1 - yBase * 0.96) * state.canvasHeight, yMin, yMax);
    if (state.mirrorMode === "vertical" && !state.startFromBottom) y = rand(yMin, yMax);
    if (state.mirrorMode === "quad") y = rand(yMin, yMax);
    const candidate = { x, y, r };
    if (pointInTextRect(x, y, r * 1.35) || pointInLogoRect(x, y, r * 1.1) || pointInBlankZone(x, y)) continue;

    let collide = false;
    for (const c of baseCircles) {
      if (Math.hypot(x - c.x, y - c.y) < r + c.r + minSide * 0.008) {
        collide = true;
        break;
      }
    }
    if (collide) continue;
    baseCircles.push(candidate);
  }

  const addCircle = (circle) => {
    if (
      circle.x < circle.r ||
      circle.x > state.canvasWidth - circle.r ||
      circle.y < circle.r ||
      circle.y > state.canvasHeight - circle.r ||
      pointBlocked(circle.x, circle.y, circle.r * 1.15)
    ) {
      return;
    }
    state.guideCircles.push(circle);
  };

  for (const circle of baseCircles) {
    addCircle(circle);
    if (state.mirrorMode === "horizontal") {
      addCircle({ ...circle, x: state.canvasWidth - circle.x, mirrorOf: circle });
    } else if (state.mirrorMode === "vertical") {
      addCircle({ ...circle, y: state.canvasHeight - circle.y, mirrorOf: circle });
    } else if (state.mirrorMode === "quad") {
      addCircle({ ...circle, x: state.canvasWidth - circle.x, mirrorOf: circle });
      addCircle({ ...circle, y: state.canvasHeight - circle.y, mirrorOf: circle });
      addCircle({ ...circle, x: state.canvasWidth - circle.x, y: state.canvasHeight - circle.y, mirrorOf: circle });
    }
  }

  buildGuideLinks();
}

function buildGuideLinks() {
  state.guideLinks = [];
  if (!state.guideCircles.length) return;

  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const maxLinkDistance = minSide * 0.32;
  const seen = new Set();
  for (let i = 0; i < state.guideCircles.length; i += 1) {
    const circle = state.guideCircles[i];
    const neighbors = state.guideCircles
      .map((other, index) => ({ other, index, d: Math.hypot(circle.x - other.x, circle.y - other.y) }))
      .filter(({ index, d }) => index !== i && d < maxLinkDistance)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);

    for (const { other, index } of neighbors) {
      const key = i < index ? `${i}-${index}` : `${index}-${i}`;
      if (seen.has(key)) continue;
      if (segmentHitsBlocked(circle, other, Math.max(circle.r, other.r) * 0.35, 8)) continue;
      seen.add(key);
      state.guideLinks.push({ a: circle, b: other });
    }
  }
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

  if (state.useCircleScaffold && state.guideCircles.length && chance(0.78)) {
    const pool = isQuad
      ? state.guideCircles.filter((c) => c.x <= cx && c.y <= cy)
      : fromBottom
        ? state.guideCircles.filter((c) => c.y > state.canvasHeight * 0.42)
        : state.guideCircles;
    const source = pool.length ? pool : state.guideCircles;
    const circle = source[Math.floor(rand(0, source.length))];
    const perimeterAngle = fromBottom
      ? -Math.PI / 2 + rand(-1.2, 1.2)
      : rand(-Math.PI, Math.PI);
    x = circle.x + Math.cos(perimeterAngle) * circle.r * rand(0.85, 1.12);
    y = circle.y + Math.sin(perimeterAngle) * circle.r * rand(0.85, 1.12);
  }

  if (pointBlocked(x, y, gapPad)) {
    x = clamp(cx + signX * rand(gapPad + 20, state.canvasWidth * 0.42), margin, state.canvasWidth - margin);
    y = fromBottom
      ? rand(Math.min(state.canvasHeight - margin, state.canvasHeight * 0.74), state.canvasHeight - margin)
      : clamp(cy + signY * rand(gapPad + 20, state.canvasHeight * 0.42), margin, state.canvasHeight - margin);
  }
  return { x: clamp(x, margin, state.canvasWidth - margin), y: clamp(y, margin, state.canvasHeight - margin) };
}

function circleAllowedForSign(circle, signX, signY) {
  if (state.mirrorMode === "horizontal") {
    return signX < 0 ? circle.x <= state.canvasWidth / 2 : circle.x >= state.canvasWidth / 2;
  }
  if (state.mirrorMode === "vertical") {
    return signY > 0 ? circle.y >= state.canvasHeight / 2 : circle.y <= state.canvasHeight / 2;
  }
  if (state.mirrorMode === "quad") {
    return circle.x <= state.canvasWidth / 2 && circle.y <= state.canvasHeight / 2;
  }
  return true;
}

function chooseCircleChain(signX, signY, desiredLength) {
  if (!state.useCircleScaffold || state.guideCircles.length < 2) return [];
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const pool = state.guideCircles.filter((circle) => (
    circleAllowedForSign(circle, signX, signY) &&
    !pointBlocked(circle.x, circle.y, circle.r * 1.1)
  ));
  if (pool.length < 2) return [];

  const edgeBias = state.startFromBottom
    ? (circle) => state.canvasHeight - circle.y
    : (circle) => Math.abs(circle.y - state.canvasHeight / 2);
  const starters = [...pool].sort((a, b) => edgeBias(a) - edgeBias(b));
  const start = starters[Math.floor(rand(0, Math.min(starters.length, 8)))];
  const chain = [start];
  const used = new Set([start]);
  const targetDistance = minSide * rand(0.12, 0.24);

  while (chain.length < desiredLength) {
    const current = chain[chain.length - 1];
    const candidates = pool
      .filter((circle) => !used.has(circle) && !segmentHitsBlocked(current, circle, Math.max(current.r, circle.r) * 0.28, 8))
      .map((circle) => {
        const d = Math.hypot(circle.x - current.x, circle.y - current.y);
        const yDirectionPenalty = state.startFromBottom
          ? Math.max(0, circle.y - current.y + minSide * 0.02) * 1.8
          : 0;
        const centerPenalty = pointInTextRect(
          (circle.x + current.x) / 2,
          (circle.y + current.y) / 2,
          minSide * 0.035,
        ) ? minSide * 2 : 0;
        const distancePenalty = Math.abs(d - targetDistance) * 0.34;
        return {
          circle,
          score: d + yDirectionPenalty + centerPenalty + distancePenalty + rand(0, minSide * 0.05),
        };
      })
      .sort((a, b) => a.score - b.score);

    if (!candidates.length) break;
    const next = candidates[0].circle;
    chain.push(next);
    used.add(next);
  }

  return chain.length >= 2 ? chain : [];
}

function directedAngleDelta(from, to, direction) {
  let diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  if (direction > 0 && diff < 0) diff += Math.PI * 2;
  if (direction < 0 && diff > 0) diff -= Math.PI * 2;
  const magnitude = clamp(Math.abs(diff), 0.72, 2.85);
  return magnitude * direction;
}

function pushPointIfClear(points, point, pad) {
  if (pointBlocked(point.x, point.y, pad)) return;
  const previous = points[points.length - 1];
  if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 2) return;
  points.push(point);
}

function createCircleScaffoldPath(signX, signY, options = {}) {
  const minSide = Math.min(state.canvasWidth, state.canvasHeight);
  const guideInfluence = state.useCircleScaffold ? clamp(options.circleGuideInfluence ?? state.circleGuideInfluence, 0, 1) : 0;
  if (guideInfluence < 0.08 || state.guideCircles.length < 2) return null;

  const smoothness = clamp(options.curveSmoothness ?? state.curveSmoothness, 0, 1);
  const chainLength = Math.floor(rand(2.8, 5.8 + guideInfluence * 2.2));
  const chain = chooseCircleChain(signX, signY, chainLength);
  if (chain.length < 2) return null;

  const points = [];
  const orbitDirection = state.mirrorMode === "horizontal"
    ? (signX < 0 ? -1 : 1)
    : (chance(0.5) ? -1 : 1);
  const gapPad = minSide * 0.018;

  for (let i = 0; i < chain.length; i += 1) {
    const circle = chain[i];
    const previous = chain[i - 1];
    const next = chain[i + 1];
    const incomingAngle = previous
      ? Math.atan2(previous.y - circle.y, previous.x - circle.x)
      : state.startFromBottom
        ? Math.PI / 2 + rand(-0.55, 0.55)
        : rand(-Math.PI, Math.PI);
    const outgoingAngle = next
      ? Math.atan2(next.y - circle.y, next.x - circle.x)
      : incomingAngle + orbitDirection * rand(1.0, 2.2);
    const arcStart = incomingAngle + orbitDirection * rand(0.32, 0.9);
    const arcEnd = outgoingAngle - orbitDirection * rand(0.22, 0.82);
    const delta = directedAngleDelta(arcStart, arcEnd, orbitDirection);
    const arcSteps = Math.floor(rand(6, 12) + (circle.r / minSide) * 42);

    for (let step = 0; step < arcSteps; step += 1) {
      const t = step / Math.max(1, arcSteps - 1);
      const wobble = (stableNoise(circle.x * 0.013 + circle.y * 0.017 + step * 1.91) - 0.5) * 0.16;
      const radius = circle.r * (0.88 + guideInfluence * 0.18 + wobble);
      const angle = arcStart + delta * t + Math.sin(t * Math.PI) * rand(-0.16, 0.16) * (1 - smoothness * 0.6);
      pushPointIfClear(points, {
        x: circle.x + Math.cos(angle) * radius,
        y: circle.y + Math.sin(angle) * radius,
      }, gapPad);
    }

    if (next) {
      const last = points[points.length - 1];
      if (!last) continue;
      const targetAngle = Math.atan2(circle.y - next.y, circle.x - next.x) - orbitDirection * rand(0.2, 0.72);
      const target = {
        x: next.x + Math.cos(targetAngle) * next.r * rand(0.82, 1.08),
        y: next.y + Math.sin(targetAngle) * next.r * rand(0.82, 1.08),
      };
      const vx = target.x - last.x;
      const vy = target.y - last.y;
      const len = Math.hypot(vx, vy) || 1;
      const nx = -vy / len;
      const ny = vx / len;
      const bend = rand(-0.22, 0.22) * minSide * (0.18 + guideInfluence * 0.18);
      const bridgeSteps = Math.floor(rand(3, 7));
      for (let step = 1; step <= bridgeSteps; step += 1) {
        const t = step / (bridgeSteps + 1);
        const ease = t * t * (3 - 2 * t);
        const lift = Math.sin(t * Math.PI) * bend;
        pushPointIfClear(points, {
          x: last.x + vx * ease + nx * lift,
          y: last.y + vy * ease + ny * lift,
        }, gapPad);
      }
    }
  }

  if (points.length < 8) return null;
  const smoothed = smoothPolyline(points, Math.round(2 + smoothness * 4), 0.48 + smoothness * 0.36);
  return {
    type: "curl",
    points: simplifyBlockedSegments(smoothed),
    width: rand(0.48, 1.18) * state.lineThickness,
    phase: rand(0, Math.PI * 2),
    branches: [],
  };
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
      const p = smoothed[smoothed.length - 1];
      dots.push({ x: p.x, y: p.y, r: width * rand(0.7, 1.2) });
    }
    if (headCurl && chance(0.5)) {
      const p = smoothed[0];
      dots.push({ x: p.x, y: p.y, r: width * rand(0.7, 1.2) });
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
  const straightValue = clamp(state.straightLines, 0, 1);
  const flourishesValue = clamp(state.flourishes, 0, 1);
  const smoothnessValue = clamp(state.curveSmoothness, 0, 1);
  const circleDensityValue = clamp(state.circleGuideDensity, 0.1, 1);
  const circleInfluenceValue = clamp(state.circleGuideInfluence, 0, 1);
  const runtime = {
    straightLines: straightValue,
    flourishes: flourishesValue,
    curveSmoothness: smoothnessValue,
    circleGuideDensity: circleDensityValue,
    circleGuideInfluence: circleInfluenceValue,
  };

  createBlankZones();

  createCircleGuides(runtime);
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
    let path = null;
    if (state.useCircleScaffold && chance(0.68 + circleInfluenceValue * 0.28)) {
      path = createCircleScaffoldPath(seedSignX, seedSignY, runtime);
    }
    if (!path) path = createCurlPath(seedSignX, seedSignY, runtime);
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
  state.progress = state.animate ? 0 : 1;
  state.hold = 0;
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

function drawCrayonMicroDetails(p0, p1, index, currentWidth, phase, color, alpha, rough, baseJitterX, baseJitterY) {
  const vx = p1.x - p0.x;
  const vy = p1.y - p0.y;
  const segmentLength = Math.hypot(vx, vy) || 1;
  const tx = vx / segmentLength;
  const ty = vy / segmentLength;
  const nx = -ty;
  const ny = tx;
  const sampleCount = Math.min(9, Math.max(2, Math.ceil(segmentLength / Math.max(2.2, currentWidth * 0.32))));
  const dark = mixRgb(color, "#000000", 0.72);
  const light = mixRgb(color, "#ffffff", 0.78);
  const mid = mixRgb(color, "#ffffff", 0.22);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const seed = index * 31.91 + sample * 17.37 + phase * 4.73;
    const along = (sample + 0.2 + stableNoise(seed + 0.11) * 0.64) / sampleCount;
    const cross = (stableNoise(seed + 1.41) - 0.5) * currentWidth * (0.9 + rough * 0.7);
    const px = p0.x + vx * along + nx * cross + baseJitterX;
    const py = p0.y + vy * along + ny * cross + baseJitterY;
    const length = currentWidth * (0.1 + stableNoise(seed + 2.03) * (0.34 + rough * 0.34));
    const axis = stableNoise(seed + 3.29);
    const shade = stableNoise(seed + 4.87);
    const useDark = shade < 0.48;
    const useLight = shade > 0.74;
    const tone = useDark ? dark : useLight ? light : mid;
    const toneAlpha = alpha * (useDark ? 0.08 + rough * 0.22 : 0.045 + rough * 0.16);
    const lineWidth = Math.max(0.28, currentWidth * (0.025 + stableNoise(seed + 5.61) * (0.05 + rough * 0.035)));
    const dx = axis < 0.58 ? tx * length : nx * length * 0.62;
    const dy = axis < 0.58 ? ty * length : ny * length * 0.62;

    ctx.globalCompositeOperation = useDark ? "multiply" : "screen";
    ctx.strokeStyle = rgbToRgba(tone, toneAlpha);
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(px - dx, py - dy);
    ctx.lineTo(px + dx, py + dy);
    ctx.stroke();

    if (stableNoise(seed + 6.72) < 0.72 + rough * 0.2) {
      const dotSize = Math.max(0.65, currentWidth * (0.055 + stableNoise(seed + 7.1) * 0.095));
      ctx.fillStyle = rgbToRgba(useDark ? dark : light, alpha * (0.05 + rough * 0.18));
      ctx.fillRect(px - dotSize * 0.5, py - dotSize * 0.5, dotSize * (0.55 + stableNoise(seed + 8.19)), dotSize * (0.45 + stableNoise(seed + 9.61)));
    }

    if (stableNoise(seed + 10.33) < 0.42 + rough * 0.26) {
      const edgeSign = stableNoise(seed + 11.07) > 0.5 ? 1 : -1;
      const edgeX = p0.x + vx * along + nx * edgeSign * currentWidth * (0.46 + rough * 0.2) + baseJitterX;
      const edgeY = p0.y + vy * along + ny * edgeSign * currentWidth * (0.46 + rough * 0.2) + baseJitterY;
      const edgeLength = currentWidth * (0.16 + rough * 0.25);
      ctx.globalCompositeOperation = stableNoise(seed + 12.55) > 0.48 ? "screen" : "multiply";
      ctx.strokeStyle = stableNoise(seed + 13.3) > 0.48
        ? rgbToRgba(light, alpha * (0.08 + rough * 0.18))
        : rgbToRgba(dark, alpha * (0.08 + rough * 0.2));
      ctx.lineWidth = Math.max(0.35, currentWidth * (0.035 + rough * 0.035));
      ctx.beginPath();
      ctx.moveTo(edgeX - tx * edgeLength, edgeY - ty * edgeLength);
      ctx.lineTo(edgeX + tx * edgeLength, edgeY + ty * edgeLength);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

function strokePathSegments(points, width, drawCount, phase, color, alpha) {
  if (drawCount < 2) return;
  const animatedNoise = state.animate ? state.audioLevel * 2.2 : 0;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const rough = state.fxWaxTexture ? clamp(state.fxWaxStrength, 0, 1) : 0;
  const edgeStrength = state.fxEdgeLightShadow ? clamp(state.fxEdgeStrength, 0, 1) : 0;

  for (let i = 1; i < drawCount; i += 1) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const t = i / (drawCount - 1);
    const baseJitterX = Math.sin(i * 0.55 + phase) * animatedNoise;
    const baseJitterY = Math.cos(i * 0.62 + phase) * animatedNoise;
    const currentWidth = segmentWidth(width, t, phase);

    if (rough <= 0.001) {
      ctx.strokeStyle = hexToRgba(color, alpha);
      ctx.lineWidth = currentWidth;
      ctx.beginPath();
      ctx.moveTo(p0.x + baseJitterX, p0.y + baseJitterY);
      ctx.lineTo(p1.x + baseJitterX, p1.y + baseJitterY);
      ctx.stroke();

      if (edgeStrength > 0.01) {
        const vxClean = p1.x - p0.x;
        const vyClean = p1.y - p0.y;
        const vLenClean = Math.hypot(vxClean, vyClean) || 1;
        const nxClean = -vyClean / vLenClean;
        const nyClean = vxClean / vLenClean;
        const lightDot = nxClean * -0.72 + nyClean * -0.46;
        const highlightSign = lightDot >= 0 ? 1 : -1;
        const edgeOffset = currentWidth * (0.08 + edgeStrength * 0.22);
        const edgeWidth = Math.max(0.3, currentWidth * (0.08 + edgeStrength * 0.11));

        ctx.globalCompositeOperation = "multiply";
        ctx.strokeStyle = `rgba(0,0,0,${(alpha * (0.08 + edgeStrength * 0.22)).toFixed(3)})`;
        ctx.lineWidth = edgeWidth;
        ctx.beginPath();
        ctx.moveTo(
          p0.x - nxClean * edgeOffset * highlightSign + baseJitterX,
          p0.y - nyClean * edgeOffset * highlightSign + baseJitterY,
        );
        ctx.lineTo(
          p1.x - nxClean * edgeOffset * highlightSign + baseJitterX,
          p1.y - nyClean * edgeOffset * highlightSign + baseJitterY,
        );
        ctx.stroke();

        ctx.globalCompositeOperation = "screen";
        ctx.strokeStyle = `rgba(255,255,255,${(alpha * (0.1 + edgeStrength * 0.24)).toFixed(3)})`;
        ctx.lineWidth = edgeWidth * 0.92;
        ctx.beginPath();
        ctx.moveTo(
          p0.x + nxClean * edgeOffset * highlightSign + baseJitterX,
          p0.y + nyClean * edgeOffset * highlightSign + baseJitterY,
        );
        ctx.lineTo(
          p1.x + nxClean * edgeOffset * highlightSign + baseJitterX,
          p1.y + nyClean * edgeOffset * highlightSign + baseJitterY,
        );
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
      continue;
    }

    const vx = p1.x - p0.x;
    const vy = p1.y - p0.y;
    const vLen = Math.hypot(vx, vy) || 1;
    const nx = -vy / vLen;
    const ny = vx / vLen;
    const tx = vx / vLen;
    const ty = vy / vLen;
    const lightX = -0.72;
    const lightY = -0.46;
    const lightDot = nx * lightX + ny * lightY;
    const highlightSign = lightDot >= 0 ? 1 : -1;

    const waxPasses = 3;
    for (let pass = 0; pass < waxPasses; pass += 1) {
      const noiseA = stableNoise(i * 1.31 + pass * 19.1 + phase * 7.7);
      const noiseB = stableNoise(i * 1.93 + pass * 23.4 + phase * 9.2);
      const offset = (noiseA * 2 - 1) * (currentWidth * (0.06 + rough * (0.24 + pass * 0.15)));
      const tangentJitter = (noiseB * 2 - 1) * (currentWidth * (0.03 + rough * 0.12));
      const ox = nx * offset + (vx / vLen) * tangentJitter + baseJitterX;
      const oy = ny * offset + (vy / vLen) * tangentJitter + baseJitterY;
      const passAlpha = alpha * (pass === 0 ? 0.78 : pass === 1 ? 0.5 : 0.31);
      const passWidth = Math.max(0.45, currentWidth * (pass === 0 ? 1 : pass === 1 ? 0.86 : 0.68));

      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = hexToRgba(color, passAlpha);
      ctx.lineWidth = passWidth;
      ctx.beginPath();
      ctx.moveTo(p0.x + ox, p0.y + oy);
      ctx.lineTo(p1.x + ox, p1.y + oy);
      ctx.stroke();
    }

    drawCrayonMicroDetails(p0, p1, i, currentWidth, phase, color, alpha, rough, baseJitterX, baseJitterY);

    if (edgeStrength > 0.01) {
      const edgeOffset = currentWidth * (0.16 + rough * 0.14 + edgeStrength * 0.13);
      const edgeWidth = Math.max(0.35, currentWidth * (0.14 + rough * 0.08 + edgeStrength * 0.1));

      ctx.globalCompositeOperation = "multiply";
      ctx.strokeStyle = `rgba(0,0,0,${(alpha * (0.1 + rough * 0.1 + edgeStrength * 0.18)).toFixed(3)})`;
      ctx.lineWidth = edgeWidth;
      ctx.beginPath();
      ctx.moveTo(p0.x - nx * edgeOffset * highlightSign + baseJitterX, p0.y - ny * edgeOffset * highlightSign + baseJitterY);
      ctx.lineTo(p1.x - nx * edgeOffset * highlightSign + baseJitterX, p1.y - ny * edgeOffset * highlightSign + baseJitterY);
      ctx.stroke();

      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = `rgba(255,255,255,${(alpha * (0.12 + rough * 0.12 + edgeStrength * 0.2)).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.3, edgeWidth * 0.88);
      ctx.beginPath();
      ctx.moveTo(p0.x + nx * edgeOffset * highlightSign + baseJitterX, p0.y + ny * edgeOffset * highlightSign + baseJitterY);
      ctx.lineTo(p1.x + nx * edgeOffset * highlightSign + baseJitterX, p1.y + ny * edgeOffset * highlightSign + baseJitterY);
      ctx.stroke();

      ctx.globalCompositeOperation = "source-over";
    }
    const speckleChance = 0.1 + rough * 0.25;
    if (stableNoise(i * 2.17 + phase * 5.9) < speckleChance) {
      const textureDots = 2 + Math.floor(rough * 3);
      for (let d = 0; d < textureDots; d += 1) {
        const r1 = stableNoise(i * 3.11 + d * 1.73 + phase * 0.9) - 0.5;
        const r2 = stableNoise(i * 4.07 + d * 2.21 + phase * 0.7) - 0.5;
        const px = p1.x + nx * r1 * currentWidth * (1 + rough * 1.6) + tx * r2 * currentWidth * 0.28 + baseJitterX;
        const py = p1.y + ny * r1 * currentWidth * (1 + rough * 1.6) + ty * r2 * currentWidth * 0.28 + baseJitterY;
        const dotRadius = Math.max(0.35, currentWidth * (0.05 + rough * 0.09));
        const darkDot = stableNoise(i * 5.13 + d * 0.77 + phase) > 0.5;
        ctx.fillStyle = darkDot
          ? `rgba(0,0,0,${(alpha * (0.1 + rough * 0.22)).toFixed(3)})`
          : `rgba(255,255,255,${(alpha * (0.08 + rough * 0.2)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawPath(points, width, progress, phase) {
  if (points.length < 2 || progress <= 0) return;
  const drawCount = clamp(Math.ceil(points.length * progress), 2, points.length);

  if (state.outlineStroke) {
    strokePathSegments(points, width * 1.15, drawCount, phase, state.strokeColor, state.strokeAlpha);
    strokePathSegments(points, Math.max(1, width * 0.58), drawCount, phase + 0.15, state.outlineColor, state.outlineAlpha);
  } else {
    strokePathSegments(points, width, drawCount, phase, state.strokeColor, state.strokeAlpha);
  }
}

function strokePolyline(points, width, progress, color, alpha, options = {}, targetCtx = ctx) {
  if (points.length < 2 || progress <= 0) return;
  const drawCount = clamp(Math.ceil(points.length * progress), 2, points.length);
  const offsetX = options.offsetX || 0;
  const offsetY = options.offsetY || 0;
  targetCtx.save();
  targetCtx.lineCap = "round";
  targetCtx.lineJoin = "round";
  targetCtx.strokeStyle = hexToRgba(color, alpha);
  const expandPx = Math.max(0, options.expandPx || 0);
  targetCtx.lineWidth = Math.max(0.2, width * (options.widthScale || 1) + expandPx * 2);
  if (options.blur && options.blur > 0) targetCtx.filter = `blur(${options.blur.toFixed(2)}px)`;
  targetCtx.beginPath();
  targetCtx.moveTo(points[0].x + offsetX, points[0].y + offsetY);
  for (let i = 1; i < drawCount; i += 1) {
    const point = points[i];
    targetCtx.lineTo(point.x + offsetX, point.y + offsetY);
  }
  targetCtx.stroke();
  targetCtx.restore();
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

function drawPathMask(targetCtx, widthScale = 1, expandPx = 0) {
  targetCtx.save();
  targetCtx.clearRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
  paintPathMask(targetCtx, widthScale, expandPx);
  targetCtx.restore();
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

// Clip/coverage mask for path-tracing FX: strokes the pattern paths.
function paintFxClipMask(targetCtx, widthScale = 1, expandPx = 0, fattenPx = 0) {
  drawPathMask(targetCtx, widthScale, expandPx);
}

function createFxCanvas(scale = 1) {
  const fxCanvas = document.createElement("canvas");
  fxCanvas.width = Math.max(1, Math.round(canvas.width * scale));
  fxCanvas.height = Math.max(1, Math.round(canvas.height * scale));
  return fxCanvas;
}

function drawExpandedPathMask(widthScale, expandPx, blurPx = 0, scale = 1) {
  const maskCanvas = createFxCanvas(scale);
  const maskCtx = maskCanvas.getContext("2d");
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  maskCtx.save();
  maskCtx.scale(scale, scale);
  if (blurPx > 0) maskCtx.filter = `blur(${(blurPx * scale).toFixed(2)}px)`;
  paintPathMask(maskCtx, widthScale, expandPx);
  maskCtx.restore();
  return maskCanvas;
}

function thresholdMaskWithTexture(sourceCanvas, alphaCutoff = 24, roughness = 0, phase = 0) {
  const sourceCtx = sourceCanvas.getContext("2d");
  const image = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const data = image.data;
  const width = sourceCanvas.width;
  const grain = clamp(roughness, 0, 1);

  for (let i = 0; i < data.length; i += 4) {
    const p = i / 4;
    const x = p % width;
    const y = Math.floor(p / width);
    const cloudy = stableNoise(x * 0.131 + y * 0.071 + phase * 19.7);
    const scratch = stableNoise(x * 0.53 + y * 1.77 + phase * 31.1);
    const cutoff = alphaCutoff + (cloudy - 0.5) * 72 * grain;
    const keep = data[i + 3] >= cutoff && scratch > 0.04 + grain * 0.11;
    const brokenEdge = data[i + 3] > alphaCutoff * 0.5 && cloudy > 0.82 - grain * 0.22;
    const alpha = keep || brokenEdge ? clamp(data[i + 3] * (0.62 + cloudy * 0.55), 0, 255) : 0;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = alpha;
  }

  const maskCanvas = createFxCanvas();
  maskCanvas.width = sourceCanvas.width;
  maskCanvas.height = sourceCanvas.height;
  maskCanvas.getContext("2d").putImageData(image, 0, 0);
  return maskCanvas;
}

function erodeMask(sourceCanvas, iterations) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const sourceCtx = sourceCanvas.getContext("2d");
  const source = sourceCtx.getImageData(0, 0, width, height).data;
  let alpha = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < source.length; i += 4, p += 1) {
    alpha[p] = source[i + 3] > 0 ? 255 : 0;
  }

  const passes = Math.max(0, Math.round(iterations));
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Uint8Array(alpha.length);
    for (let y = 1; y < height - 1; y += 1) {
      const row = y * width;
      for (let x = 1; x < width - 1; x += 1) {
        const p = row + x;
        if (
          alpha[p] &&
          alpha[p - 1] &&
          alpha[p + 1] &&
          alpha[p - width] &&
          alpha[p + width] &&
          alpha[p - width - 1] &&
          alpha[p - width + 1] &&
          alpha[p + width - 1] &&
          alpha[p + width + 1]
        ) {
          next[p] = 255;
        }
      }
    }
    alpha = next;
  }

  const output = sourceCtx.createImageData(width, height);
  for (let p = 0, i = 0; p < alpha.length; p += 1, i += 4) {
    output.data[i] = 255;
    output.data[i + 1] = 255;
    output.data[i + 2] = 255;
    output.data[i + 3] = alpha[p];
  }

  const erodedCanvas = createFxCanvas();
  erodedCanvas.width = width;
  erodedCanvas.height = height;
  erodedCanvas.getContext("2d").putImageData(output, 0, 0);
  return erodedCanvas;
}

function subtractMask(baseMask, subtractCanvas) {
  const result = createFxCanvas();
  result.width = baseMask.width;
  result.height = baseMask.height;
  const resultCtx = result.getContext("2d");
  resultCtx.drawImage(baseMask, 0, 0);
  resultCtx.globalCompositeOperation = "destination-out";
  resultCtx.drawImage(subtractCanvas, 0, 0);
  return result;
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

function drawFxLayer(layer, composite = "source-over", alpha = 1) {
  ctx.save();
  ctx.globalCompositeOperation = composite;
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.drawImage(layer, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawGlassPolishFx() {
  if (!state.fxGlassPolish) return;
  const opacity = clamp(state.fxGlassOpacity, 0, 1);
  const shine = clamp(state.fxGlassShine, 0, 1);
  if (opacity < 0.01 && shine < 0.01) return;

  if (!state.paths.length) return;
  const minSide = Math.min(canvas.width, canvas.height);
  // Work buffer at full canvas res (supersampled for smaller canvases), capped at
  // 4096px for memory. Never below 1 visually unless the canvas exceeds 4096, so
  // the mask is not upscaled → no pixelation.
  const scale = Math.min(1.6, 4096 / Math.max(canvas.width, canvas.height));
  const bubbleAmount = clamp(state.fxBubbleStrength, 0, 1);
  const outlinePx = clamp(state.fxBubbleOutlinePx, 0, 14);
  const expandPx = minSide * (0.006 + bubbleAmount * 0.014);
  const mergeR = minSide * (0.012 + bubbleAmount * 0.01) * scale; // fuse nearby blobs
  const glassColor = state.fxBubbleGlowColor || "#bfffd6";
  const lightColor = mixRgb(glassColor, "#ffffff", 0.48);
  const midColor = mixRgb(glassColor, "#ffffff", 0.14);
  const darkColor = mixRgb(glassColor, "#000000", 0.34);

  const { S, inv } = buildBubbleSilhouette(scale, expandPx, mergeR);

  // 1) Soft outer glow — gentle outward bloom (柔和的外发光).
  const haloR = (minSide * (0.018 + shine * 0.03 + bubbleAmount * 0.02)) * scale;
  const halo = blurMaskCopy(S, scale, haloR, "destination-out", S);
  tintLayer(halo, lightColor);
  drawFxLayer(halo, "screen", 0.28 + shine * 0.3);

  // 2) Glass body fill — gradient clipped to the smooth (anti-aliased) silhouette.
  const glassLayer = createFxCanvas(scale);
  const glassCtx = glassLayer.getContext("2d");
  glassCtx.drawImage(S, 0, 0);
  glassCtx.globalCompositeOperation = "source-in";
  const glassGradient = glassCtx.createLinearGradient(0, 0, glassLayer.width, glassLayer.height);
  glassGradient.addColorStop(0, colorToRgba(lightColor, 0.12 + opacity * 0.2));
  glassGradient.addColorStop(0.44, colorToRgba(midColor, 0.08 + opacity * 0.18));
  glassGradient.addColorStop(1, colorToRgba(darkColor, 0.04 + opacity * 0.14));
  glassCtx.fillStyle = glassGradient;
  glassCtx.fillRect(0, 0, glassLayer.width, glassLayer.height);
  drawFxLayer(glassLayer, "source-over", 0.86);

  // 3) Depth shading — radial gradient on a soft interior (fades near the edge).
  const innerSoft = blurMaskCopy(S, scale, (minSide * 0.02) * scale, "destination-in", S);
  const depthLayer = createFxCanvas(scale);
  const depthCtx = depthLayer.getContext("2d");
  depthCtx.drawImage(innerSoft, 0, 0);
  depthCtx.globalCompositeOperation = "source-in";
  const depthGradient = depthCtx.createRadialGradient(
    depthLayer.width * 0.42, depthLayer.height * 0.25, depthLayer.width * 0.05,
    depthLayer.width * 0.6, depthLayer.height * 0.72, Math.max(depthLayer.width, depthLayer.height) * 0.66,
  );
  depthGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
  depthGradient.addColorStop(0.54, colorToRgba(darkColor, opacity * 0.04));
  depthGradient.addColorStop(1, colorToRgba(darkColor, opacity * 0.16));
  depthCtx.fillStyle = depthGradient;
  depthCtx.fillRect(0, 0, depthLayer.width, depthLayer.height);
  drawFxLayer(depthLayer, "multiply", 0.58 + opacity * 0.18);

  // 4) Defined outline — smooth bright edge band straddling the contour (有outline).
  const rimR = (minSide * 0.005 + outlinePx * 1.2) * scale;
  const rim = edgeBandMask(S, inv, scale, rimR);
  tintLayer(rim, "#ffffff");
  drawFxLayer(rim, "screen", 0.6 + shine * 0.3);
}

function drawEdgeLightShadowFx() {
  if (!state.fxEdgeLightShadow) return;
  const amount = clamp(state.fxEdgeStrength, 0, 1);
  if (amount < 0.01) return;

  const lightOffset = 0.4 + amount * 2.8;
  const blur = 0.8 + amount * 4.8;
  const light = mixRgb(state.strokeColor, "#ffffff", 0.8);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  forEachPathSegment((points, width, progress) => {
    strokePolyline(
      points,
      width,
      progress,
      `#${light.r.toString(16).padStart(2, "0")}${light.g.toString(16).padStart(2, "0")}${light.b.toString(16).padStart(2, "0")}`,
      (0.1 + amount * 0.36) * state.strokeAlpha,
      { widthScale: 1.55 + amount * 0.5, blur, offsetX: -lightOffset, offsetY: -lightOffset },
    );
  });
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  forEachPathSegment((points, width, progress) => {
    strokePolyline(points, width, progress, "#000000", (0.08 + amount * 0.32) * state.strokeAlpha, {
      widthScale: 1.62 + amount * 0.56,
      blur: blur * 0.92,
      offsetX: lightOffset,
      offsetY: lightOffset,
    });
  });
  ctx.restore();
}

// ── Smooth blur-only mask helpers (no thresholding → no pixelation) ───────────
function blurMaskCopy(src, scale, radius, keepOp, keepImg) {
  const c = createFxCanvas(scale);
  const cx = c.getContext("2d");
  cx.filter = `blur(${Math.max(0, radius).toFixed(2)}px)`;
  cx.drawImage(src, 0, 0);
  cx.filter = "none";
  if (keepOp) { cx.globalCompositeOperation = keepOp; cx.drawImage(keepImg, 0, 0); }
  return c;
}

// A soft glowing band straddling the silhouette contour: outer spill + inner falloff.
function edgeBandMask(S, inv, scale, radius) {
  const outer = blurMaskCopy(S, scale, radius, "destination-out", S);
  const inner = blurMaskCopy(inv, scale, radius, "destination-in", S);
  const c = createFxCanvas(scale);
  const cx = c.getContext("2d");
  cx.drawImage(outer, 0, 0);
  cx.globalCompositeOperation = "lighter";
  cx.drawImage(inner, 0, 0);
  return c;
}

// White anti-aliased silhouette of the pattern (merged into blobs) and its inverse.
// `mergeR` (scaled px) closes thin necks between nearby blobs metaball-style:
// blur spreads the field, then re-stacking re-densifies it so adjacent shapes
// fuse smoothly — all anti-aliased, so no pixelation.
function buildBubbleSilhouette(scale, expandPx, mergeR = 0) {
  const raw = createFxCanvas(scale);
  const rctx = raw.getContext("2d");
  rctx.save();
  rctx.scale(scale, scale);
  paintPathMask(rctx, 1, expandPx);
  rctx.restore();

  let S = raw;
  if (mergeR > 0.5) {
    S = createFxCanvas(scale);
    const sctx = S.getContext("2d");
    // Blur to spread, then stack draws so the soft field builds back to near-opaque
    // (1−(1−a)^n) — bridges thin gaps while keeping soft, anti-aliased edges.
    sctx.filter = `blur(${mergeR.toFixed(2)}px)`;
    for (let i = 0; i < 6; i++) sctx.drawImage(raw, 0, 0);
    sctx.filter = "none";
    sctx.drawImage(raw, 0, 0); // crisp solid core on top
  }

  const inv = createFxCanvas(scale);
  const ictx = inv.getContext("2d");
  ictx.fillStyle = "#fff";
  ictx.fillRect(0, 0, inv.width, inv.height);
  ictx.globalCompositeOperation = "destination-out";
  ictx.drawImage(S, 0, 0);
  return { S, inv };
}

// Bubble / Blur — soft glow that DIFFUSES INWARD from the outline (like the
// reference): brightest right at the contour, fading smoothly toward a dark
// interior. Built entirely from Gaussian blur, so it's super smooth, no pixels.
function drawBubbleBlurFx() {
  if (!state.fxBubbleBlur) return;
  const amount = clamp(state.fxBubbleStrength, 0, 1);
  if (amount < 0.01 || !state.paths.length) return;

  const density = clamp(state.fxBubbleBlurDensity, 0, 1);
  const outlinePx = clamp(state.fxBubbleOutlinePx, 0, 14);
  const minSide = Math.min(canvas.width, canvas.height);
  // Work buffer at full canvas res (supersampled when small), capped at 4096px.
  const scale = Math.min(1.6, 4096 / Math.max(canvas.width, canvas.height));
  const expandPx = minSide * (0.006 + amount * 0.016);   // body fatten/merge
  const mergeR = minSide * (0.012 + amount * 0.01) * scale; // fuse nearby blobs
  const glowColor = state.fxBubbleGlowColor || "#ffffff";

  const { S, inv } = buildBubbleSilhouette(scale, expandPx, mergeR);

  // Inward-diffusion layers, all = blur(inverse) clipped INSIDE the shape, so each
  // is bright at the contour and fades toward the interior. Deeper radius = the
  // glow reaches further in (density pushes it deeper, toward a filled look).
  const deepR = (minSide * (0.03 + amount * 0.05) + density * minSide * 0.05) * scale;
  const midR  = (minSide * (0.012 + amount * 0.02)) * scale;
  const edgeR = (minSide * 0.006 + outlinePx * 1.2) * scale;
  const deep = blurMaskCopy(inv, scale, deepR, "destination-in", S);
  const mid  = blurMaskCopy(inv, scale, midR, "destination-in", S);
  const rim  = blurMaskCopy(inv, scale, edgeR, "destination-in", S);
  tintLayer(deep, glowColor);
  tintLayer(mid, glowColor);
  tintLayer(rim, glowColor);

  // A small soft outer feather so the silhouette boundary isn't a hard cut.
  const outerR = (minSide * 0.005 + outlinePx * 0.6) * scale;
  const outer = blurMaskCopy(S, scale, outerR, "destination-out", S);
  tintLayer(outer, glowColor);

  const grain = clamp(state.fxBubbleGrain, 0, 1);

  // Assemble the glow into one layer so an optional grain dissolve can be applied
  // to the whole bubble at once.
  const L = createFxCanvas(scale);
  const lc = L.getContext("2d");
  lc.globalCompositeOperation = "screen";
  lc.globalAlpha = 0.3 + amount * 0.22;  lc.drawImage(outer, 0, 0); // outer feather
  lc.globalAlpha = 0.45 + amount * 0.3;  lc.drawImage(deep, 0, 0);  // deep diffusion
  lc.globalAlpha = 0.6 + amount * 0.25;  lc.drawImage(mid, 0, 0);   // mid falloff
  lc.globalAlpha = 0.9;                  lc.drawImage(rim, 0, 0);   // contour edge

  // Fine film grain: subtly modulate the glow BRIGHTNESS with deterministic noise
  // while leaving alpha (the silhouette/edge) untouched — so the outline stays
  // clean & smooth and the grain reads as a film/print texture, not dotty edges.
  if (grain > 0.01) {
    applyFilmGrain(L, grain, state.seed >>> 0, Math.max(1, Math.round(scale)));
  }

  drawFxLayer(L, "screen", 1);
}

// In-place film grain on RGB only (alpha preserved → clean edges). Each pixel's
// brightness is scaled by (1 ± grain·noise), giving a fine, even speckle texture.
function applyFilmGrain(layer, amount, seed, cell) {
  const w = layer.width, h = layer.height;
  const lctx = layer.getContext("2d");
  const img = lctx.getImageData(0, 0, w, h);
  const d = img.data;
  const gs = Math.max(1, cell | 0);
  const s = (seed % 100000) * 0.0001;
  const range = amount * 0.85; // max ± brightness swing
  for (let y = 0; y < h; y++) {
    const cy = (y / gs) | 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] === 0) continue;
      const cx = (x / gs) | 0;
      let n = Math.sin(cx * 127.1 + cy * 311.7 + s) * 43758.5453;
      n = n - Math.floor(n);                 // 0..1
      const f = 1 + (n - 0.5) * 2 * range;   // brightness factor
      d[i]     = Math.max(0, Math.min(255, d[i] * f));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] * f));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] * f));
    }
  }
  lctx.putImageData(img, 0, 0);
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

function drawEmbossFx() {
  if (!state.fxEmbossDepth) return;
  const amount = clamp(state.fxEmbossStrength, 0, 1);
  if (amount < 0.01) return;

  const offset = 0.45 + amount * 3.2;
  const blur = 0.6 + amount * 2.8;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  forEachPathSegment((points, width, progress) => {
    strokePolyline(points, width, progress, "#ffffff", 0.09 + amount * 0.24, {
      widthScale: 1.02 + amount * 0.18,
      blur,
      offsetX: -offset,
      offsetY: -offset,
    });
  });
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  forEachPathSegment((points, width, progress) => {
    strokePolyline(points, width, progress, "#000000", 0.1 + amount * 0.28, {
      widthScale: 1.04 + amount * 0.22,
      blur,
      offsetX: offset,
      offsetY: offset,
    });
  });
  ctx.restore();
}

function buildHalftoneNoiseTexture() {
  const key = [
    canvas.width,
    canvas.height,
    state.fxHalftoneMix.toFixed(3),
    state.strokeColor,
    state.seed,
  ].join("|");
  if (halftoneNoiseCache.canvas && halftoneNoiseCache.key === key) return halftoneNoiseCache.canvas;

  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = canvas.width;
  textureCanvas.height = canvas.height;
  const tctx = textureCanvas.getContext("2d");
  tctx.clearRect(0, 0, textureCanvas.width, textureCanvas.height);

  const mix = clamp(state.fxHalftoneMix, 0, 1);
  const baseTone = mixRgb(state.strokeColor, "#ffffff", 0.28);
  const tone = `rgba(${baseTone.r}, ${baseTone.g}, ${baseTone.b}, `;

  const dotStep = Math.max(5, Math.round(16 - mix * 9));
  const dotRadius = 0.8 + mix * 1.9;
  for (let y = dotStep * 0.5; y < textureCanvas.height; y += dotStep) {
    for (let x = dotStep * 0.5; x < textureCanvas.width; x += dotStep) {
      const wave = stableNoise(x * 0.017 + y * 0.029 + state.seed * 0.0001);
      const alpha = (0.03 + mix * 0.22) * (0.25 + wave * 0.95);
      if (alpha < 0.02) continue;
      tctx.fillStyle = `${tone}${alpha.toFixed(3)})`;
      tctx.beginPath();
      tctx.arc(x, y, dotRadius * (0.72 + wave * 0.6), 0, Math.PI * 2);
      tctx.fill();
    }
  }

  const noiseCount = Math.floor((textureCanvas.width * textureCanvas.height) / 2600 * (0.3 + (1 - mix) * 1.4));
  for (let i = 0; i < noiseCount; i += 1) {
    const x = stableNoise(i * 11.73 + state.seed * 0.0017) * textureCanvas.width;
    const y = stableNoise(i * 6.19 + state.seed * 0.0007) * textureCanvas.height;
    const shade = stableNoise(i * 17.83 + state.seed * 0.0013);
    const alpha = (0.01 + (1 - mix) * 0.12) * (0.4 + shade * 0.8);
    tctx.fillStyle = shade > 0.52
      ? `rgba(255,255,255,${alpha.toFixed(3)})`
      : `rgba(0,0,0,${(alpha * 0.9).toFixed(3)})`;
    tctx.fillRect(x, y, 1 + shade * 1.6, 1 + stableNoise(i * 5.77) * 1.5);
  }

  halftoneNoiseCache = { key, canvas: textureCanvas };
  return textureCanvas;
}

function drawHalftoneNoiseFx() {
  if (!state.fxHalftoneNoise) return;
  if (state.animate && state.progress < 0.99) return;

  const texture = buildHalftoneNoiseTexture();
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  const mctx = maskCanvas.getContext("2d");
  paintFxClipMask(mctx, 1.36, 0, Math.min(canvas.width, canvas.height) * 0.004);

  const layer = document.createElement("canvas");
  layer.width = canvas.width;
  layer.height = canvas.height;
  const lctx = layer.getContext("2d");
  lctx.drawImage(texture, 0, 0);
  lctx.globalCompositeOperation = "destination-in";
  lctx.drawImage(maskCanvas, 0, 0);

  ctx.save();
  ctx.globalAlpha = 0.78;
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

function drawCrayonPaperTexture() {
  if (!state.fxWaxTexture) return;
  const rough = clamp(state.fxWaxStrength, 0, 1);
  if (rough < 0.02) return;
  const strokeVisibility = clamp(state.strokeAlpha, 0, 1);
  if (strokeVisibility < 0.001) return;

  const w = canvas.width;
  const h = canvas.height;
  const textureCanvas = createFxCanvas();
  const tctx = textureCanvas.getContext("2d");
  const grainCount = Math.floor((w * h) / 1450 * (0.42 + rough * 2.15));
  const sizeMin = 0.45;
  const sizeMax = 1.35 + rough * 2.4;
  const dark = mixRgb(state.strokeColor, "#000000", 0.78);
  const light = mixRgb(state.strokeColor, "#ffffff", 0.86);
  const mid = mixRgb(state.strokeColor, "#ffffff", 0.35);

  tctx.clearRect(0, 0, w, h);
  tctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < grainCount; i += 1) {
    const x = stableNoise(i * 12.989 + 17.3) * w;
    const y = stableNoise(i * 78.233 + 91.7) * h;
    const tone = stableNoise(i * 35.173 + 6.4);
    const size = sizeMin + stableNoise(i * 9.17 + 2.1) * (sizeMax - sizeMin);
    const alpha = strokeVisibility * (0.022 + rough * 0.12) * (0.45 + tone * 0.85);
    const color = tone < 0.44 ? dark : tone > 0.78 ? light : mid;
    tctx.fillStyle = rgbToRgba(color, alpha);
    tctx.fillRect(x, y, size * (0.6 + stableNoise(i * 5.91) * 1.4), size * (0.45 + stableNoise(i * 4.31) * 1.8));
  }

  const weaveStep = Math.max(3, Math.round(9 - rough * 4.5));
  const weaveAlpha = strokeVisibility * (0.014 + rough * 0.07);
  for (let y = 0; y < h; y += weaveStep) {
    const wave = stableNoise(y * 0.113 + state.seed * 0.0003);
    tctx.fillStyle = rgbToRgba(wave > 0.5 ? light : dark, weaveAlpha * (0.35 + wave * 0.9));
    tctx.fillRect(0, y + wave * 1.2, w, Math.max(0.45, rough * 1.05));
  }
  for (let x = 0; x < w; x += weaveStep + 1) {
    const wave = stableNoise(x * 0.097 + state.seed * 0.0004);
    tctx.fillStyle = rgbToRgba(wave > 0.55 ? light : dark, weaveAlpha * (0.28 + wave * 0.72));
    tctx.fillRect(x + wave * 1.1, 0, Math.max(0.35, rough * 0.8), h);
  }

  const maskCanvas = createFxCanvas();
  const mctx = maskCanvas.getContext("2d");
  paintFxClipMask(mctx, 1.48 + rough * 0.38, 0.8 + rough * 2.6, Math.min(w, h) * 0.006);
  tctx.globalCompositeOperation = "destination-in";
  tctx.drawImage(maskCanvas, 0, 0);

  ctx.save();
  ctx.globalAlpha = 0.72 + rough * 0.24;
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(textureCanvas, 0, 0);
  ctx.restore();
}

function pointOnPath(points, travel, progress = 1) {
  if (points.length < 2 || progress <= 0) return null;
  const drawCount = clamp(Math.ceil(points.length * progress), 2, points.length);
  const maxIndex = drawCount - 1;
  let totalLength = 0;
  for (let i = 1; i < drawCount; i += 1) totalLength += distance(points[i - 1], points[i]);
  if (totalLength <= 0) return { x: points[0].x, y: points[0].y, angle: 0 };

  let target = ((travel % 1) + 1) % 1 * totalLength;
  for (let i = 1; i <= maxIndex; i += 1) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const length = distance(p0, p1);
    if (target <= length || i === maxIndex) {
      const t = length <= 0 ? 0 : target / length;
      return {
        x: p0.x + (p1.x - p0.x) * t,
        y: p0.y + (p1.y - p0.y) * t,
        angle: Math.atan2(p1.y - p0.y, p1.x - p0.x),
      };
    }
    target -= length;
  }
  const last = points[maxIndex];
  const prev = points[Math.max(0, maxIndex - 1)];
  return { x: last.x, y: last.y, angle: Math.atan2(last.y - prev.y, last.x - prev.x) };
}

function drawAudioTravellers() {
  const motion = audioMotion();
  if (!motion.active) return;
  const segments = [];
  forEachPathSegment((points, width, progress, phase) => {
    if (points.length > 2 && progress > 0.05) segments.push({ points, width, progress, phase });
  });
  if (!segments.length) return;

  const scale = clamp(880 / Math.max(canvas.width, canvas.height), 0.46, 1);
  const blobMask = createFxCanvas(scale);
  const bctx = blobMask.getContext("2d");
  const audioColor = state.fxBubbleGlowColor || "#ff7bc4";
  const audioGlowColor = mixRgb(audioColor, "#ffffff", 0.36);
  const audioRimColor = mixRgb(audioColor, "#ffffff", 0.58);
  const impact = clamp(motion.beat * 0.75 + motion.transient * 0.95 + motion.bass * 0.45, 0, 1);
  const blobCount = Math.min(64, Math.max(16, Math.floor(16 + motion.energy * 22 + impact * 24)));
  const trailSteps = 6 + Math.floor(motion.mid * 4 + impact * 3);

  bctx.save();
  bctx.scale(scale, scale);
  bctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < blobCount; i += 1) {
    const pick = Math.floor(stableNoise(i * 41.3 + state.seed * 0.00017) * segments.length) % segments.length;
    const segment = segments[pick];
    const offset = stableNoise(i * 17.71 + segment.phase * 3.1);
    const direction = stableNoise(i * 9.91 + state.seed * 0.00023) > 0.5 ? 1 : -1;
    const travelSpeed = 0.058 + motion.bass * 0.24 + motion.mid * 0.075 + impact * 0.12 + stableNoise(i * 5.37) * 0.05;
    const travel = offset + direction * motion.phase * travelSpeed + impact * (0.035 + i * 0.0012);
    const point = pointOnPath(segment.points, travel, segment.progress);
    if (!point) continue;

    const pulse = 0.82 + motion.bass * 1.95 + motion.beat * 2.6 + motion.transient * 3 + stableNoise(i * 3.19 + motion.phase * 7.1) * 0.52;
    const radius = Math.max(4.2, segment.width * (1 + pulse * 0.62));
    const angle = point.angle + Math.sin(motion.phase * 5.8 + i) * (0.24 + impact * 0.32);
    const stretch = 1.08 + motion.bass * 0.55 + impact * 0.5 + stableNoise(i * 2.47) * 0.45;

    bctx.fillStyle = `rgba(255, 255, 255, ${0.54 + impact * 0.32})`;
    bctx.beginPath();
    bctx.ellipse(point.x, point.y, radius * stretch, radius * (0.72 + motion.treble * 0.18), angle, 0, Math.PI * 2);
    bctx.fill();

    for (let trail = 1; trail <= trailSteps; trail += 1) {
      const trailPoint = pointOnPath(segment.points, travel - direction * trail * (0.014 + motion.mid * 0.008 + impact * 0.007), segment.progress);
      if (!trailPoint) continue;
      const falloff = 1 - trail / (trailSteps + 1);
      const trailRadius = Math.max(2.2, radius * (0.34 + falloff * 0.42));
      bctx.fillStyle = `rgba(255, 255, 255, ${0.22 + falloff * (0.4 + motion.energy * 0.22 + impact * 0.2)})`;
      bctx.beginPath();
      bctx.ellipse(trailPoint.x, trailPoint.y, trailRadius * (1 + motion.bass * 0.28), trailRadius * 0.7, trailPoint.angle, 0, Math.PI * 2);
      bctx.fill();
    }

    const satellites = 1 + Math.floor(stableNoise(i * 6.13 + motion.phase) * (3 + impact * 3));
    for (let j = 0; j < satellites; j += 1) {
      const theta = point.angle + Math.PI / 2 + (j - 1) * 0.88 + Math.sin(motion.phase * 3.6 + i + j) * 0.36;
      const dist = radius * (0.75 + stableNoise(i * 8.1 + j) * (1.25 + impact * 0.7));
      const satRadius = Math.max(1.9, radius * (0.2 + stableNoise(i * 11.9 + j) * 0.3) * (1 + impact * 1.15));
      bctx.fillStyle = `rgba(255, 255, 255, ${0.24 + motion.treble * 0.3 + impact * 0.18})`;
      bctx.beginPath();
      bctx.arc(point.x + Math.cos(theta) * dist, point.y + Math.sin(theta) * dist, satRadius, 0, Math.PI * 2);
      bctx.fill();
    }
  }
  bctx.restore();

  const blurredMask = createFxCanvas(scale);
  const blurredCtx = blurredMask.getContext("2d");
  blurredCtx.filter = `blur(${((8 + motion.bass * 14 + impact * 11) * scale).toFixed(2)}px)`;
  blurredCtx.drawImage(blobMask, 0, 0);

  const liquidMask = thresholdMaskWithTexture(
    blurredMask,
    18 + motion.treble * 18 - impact * 8,
    0.3 + motion.treble * 0.32 + impact * 0.24,
    motion.phase
  );
  const pathClip = drawExpandedPathMask(1.75 + motion.bass * 0.46 + impact * 0.32, 6 + motion.energy * 9 + impact * 10, 2 + motion.mid * 3 + impact * 2, scale);
  const maskCtx = liquidMask.getContext("2d");
  maskCtx.globalCompositeOperation = "destination-in";
  maskCtx.drawImage(pathClip, 0, 0);

  const glowMask = createFxCanvas(scale);
  const glowCtx = glowMask.getContext("2d");
  glowCtx.filter = `blur(${((6 + motion.energy * 12 + impact * 8) * scale).toFixed(2)}px)`;
  glowCtx.drawImage(liquidMask, 0, 0);
  glowCtx.globalCompositeOperation = "destination-in";
  glowCtx.drawImage(pathClip, 0, 0);

  const liquidLayer = tintedMaskLayer(liquidMask, audioColor, 0.62 + impact * 0.28);
  const glowLayer = tintedMaskLayer(glowMask, audioGlowColor, 0.18 + motion.energy * 0.28 + impact * 0.18);
  const rimMask = subtractMask(liquidMask, erodeMask(liquidMask, 1 + impact * 1.8));
  const rimLayer = tintedMaskLayer(rimMask, audioRimColor, 0.58 + motion.treble * 0.18 + impact * 0.14);

  drawFxLayer(glowLayer, "screen", 0.82);
  drawFxLayer(liquidLayer, "source-over", 0.7 + motion.energy * 0.22);
  drawFxLayer(rimLayer, "screen", 0.95);
}

// Recolour the opaque pixels of a layer in place via source-in.
function tintLayer(layer, color) {
  const lctx = layer.getContext("2d");
  lctx.globalCompositeOperation = "source-in";
  lctx.fillStyle = color;
  lctx.fillRect(0, 0, layer.width, layer.height);
  lctx.globalCompositeOperation = "source-over";
}

function draw() {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state.backgroundImage) {
    drawImageCover(state.backgroundImage);
  }

  if (state.bgGradient) {
    // A graded ground gives the metal something to sit in; on a flat fill the
    // material has no environment to contrast against and reads as plastic.
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, hexToRgba(state.bgColor, state.bgAlpha));
    grad.addColorStop(1, hexToRgba(state.bgColor2, state.bgAlpha));
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = hexToRgba(state.bgColor, state.bgAlpha);
  }
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGlassPolishFx();

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
  drawEdgeLightShadowFx();
  drawBubbleBlurFx();
  drawEmbossFx();
  drawHalftoneNoiseFx();
  drawCrayonPaperTexture();
  drawAudioTravellers();

  drawLogoImage();
  ctx.restore();
}

function tick(now) {
  const delta = Math.min(80, now - state.lastFrame);
  state.lastFrame = now;
  updateAudioLevel();
  const audioActive = isAudioMotionActive();
  const phaseSpeed = 0.00035 + clamp(state.speed, 0.002, 0.08) * 0.024;
  state.audioMotionPhase += delta * phaseSpeed * (1 + state.audioLevel * 5.2 + state.audioBassLevel * 2.8 + state.audioBeat * 4.2 + state.audioTransient * 5.8);

  if (state.animate) {
    if (state.progress < 1) {
      state.progress = clamp(state.progress + state.speed * delta, 0, 1);
      draw();
    } else {
      state.hold += delta;
      if (state.hold > state.visibleTime * 1000) {
        state.progress = 0;
        state.hold = 0;
        draw();
      } else {
        draw();
      }
    }
  } else if (audioActive) {
    draw();
  }
  requestAnimationFrame(tick);
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

function updateLogoMarker(force = false) {
  if (!state.logoImage) {
    logoMarker.style.opacity = "0";
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const logoRect = getLogoRect();
  const scaleX = rect.width / state.canvasWidth;
  const scaleY = rect.height / state.canvasHeight;
  logoMarker.style.width = `${logoRect.w * scaleX}px`;
  logoMarker.style.height = `${logoRect.h * scaleY}px`;
  logoMarker.style.left = `${canvas.offsetLeft + (logoRect.x + logoRect.w / 2) * scaleX}px`;
  logoMarker.style.top = `${canvas.offsetTop + (logoRect.y + logoRect.h / 2) * scaleY}px`;

  if (!force) {
    logoMarker.style.transition = "opacity 0.1s";
    logoMarker.style.opacity = "0.9";
    clearTimeout(updateLogoMarker.timeout);
    updateLogoMarker.timeout = setTimeout(() => {
      logoMarker.style.transition = "opacity 0.6s";
      logoMarker.style.opacity = "0.45";
    }, 500);
  } else {
    logoMarker.style.opacity = "0.45";
  }
}

function setControlPosition(value) {
  controls.classList.remove("stacked", "along-top", "hideControls");
  controls.classList.add(value);
  document.querySelectorAll("input[name='controlsPosition']").forEach((radio) => {
    const selected = radio.value === value;
    radio.checked = selected;
    radio.closest("label").classList.toggle("selected", selected);
  });
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

async function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.52;
    analyser.connect(audioContext.destination);
  }
  if (audioContext.state === "suspended") await audioContext.resume();
}

function connectAudioElement(element) {
  if (!audioContext || !analyser || !element) return false;
  if (audioSource && audioSourceElement === element) return true;
  if (audioSource) audioSource.disconnect();
  try {
    audioSource = audioContext.createMediaElementSource(element);
    audioSource.connect(analyser);
    audioSourceElement = element;
    return true;
  } catch (error) {
    console.error("Audio analyser connection failed", error);
    document.getElementById("audioLevel").textContent = "ERR";
    return false;
  }
}

function updateAudioLevel() {
  if (!analyser) {
    state.audioLevel *= 0.9;
    state.audioBassLevel *= 0.9;
    state.audioMidLevel *= 0.9;
    state.audioTrebleLevel *= 0.9;
    state.audioBeat *= 0.88;
    state.audioTransient *= 0.82;
    return;
  }
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);

  const averageRange = (startRatio, endRatio) => {
    const start = Math.max(1, Math.floor(data.length * startRatio));
    const end = Math.max(start + 1, Math.floor(data.length * endRatio));
    let total = 0;
    for (let i = start; i < end; i += 1) total += data[i];
    return total / (end - start) / 255;
  };
  const smooth = (previous, next, attack = 0.38, release = 0.14) => previous + (next - previous) * (next > previous ? attack : release);

  const rawBass = averageRange(0.004, 0.08);
  const rawMid = averageRange(0.08, 0.36);
  const rawTreble = averageRange(0.36, 0.92);
  const weightedEnergy = clamp(rawBass * 0.56 + rawMid * 0.31 + rawTreble * 0.13, 0, 1);
  const rawEnergy = Math.pow(weightedEnergy, 0.82);
  const previousEnergy = state.audioLevel;
  const bassTransient = Math.max(0, rawBass - state.audioBassLevel);
  const transient = Math.max(0, rawEnergy - previousEnergy, bassTransient * 0.9);

  state.audioBassLevel = smooth(state.audioBassLevel, rawBass, 0.74, 0.22);
  state.audioMidLevel = smooth(state.audioMidLevel, rawMid, 0.56, 0.18);
  state.audioTrebleLevel = smooth(state.audioTrebleLevel, rawTreble, 0.5, 0.16);
  state.audioLevel = smooth(state.audioLevel, rawEnergy, 0.68, 0.22);
  state.audioTransient = Math.max(transient * 3.8, state.audioTransient * 0.64);
  state.audioAverage = state.audioAverage * 0.97 + rawEnergy * 0.03;

  const beatThreshold = Math.max(0.038, state.audioAverage * 1.08);
  const beatHit = rawBass > beatThreshold && transient > 0.008;
  const beatDecay = 0.79 + clamp(state.visibleTime, 0.2, 3) * 0.035;
  state.audioBeat = beatHit ? Math.min(1, Math.max(state.audioBeat * 0.45, 0.58 + transient * 3.8 + rawBass * 0.36)) : state.audioBeat * Math.min(0.94, beatDecay);

  document.getElementById("audioLevel").textContent = state.audioLevel.toFixed(2);
}

async function toggleDemoAudio() {
  await ensureAudioContext();
  const button = document.getElementById("demoAudio");
  if (demoPlaying) {
    oscillator?.stop();
    oscillator = null;
    gainNode?.disconnect();
    gainNode = null;
    demoPlaying = false;
    button.classList.remove("playing");
    button.textContent = "Demo Audio";
    return;
  }

  if (audioElement && !audioElement.paused) {
    audioElement.pause();
    document.getElementById("playUploaded").classList.remove("playing");
  }

  oscillator = audioContext.createOscillator();
  gainNode = audioContext.createGain();
  oscillator.type = "sawtooth";
  oscillator.frequency.value = 74;
  gainNode.gain.value = 0.035;
  oscillator.connect(gainNode);
  gainNode.connect(analyser);
  oscillator.start();
  demoPlaying = true;
  button.classList.add("playing");
  button.textContent = "Pause";
}

async function handleAudioUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  await ensureAudioContext();
  if (audioElement) {
    audioElement.pause();
  }
  if (audioObjectUrl) {
    URL.revokeObjectURL(audioObjectUrl);
  }
  audioObjectUrl = URL.createObjectURL(file);
  audioElement = new Audio();
  audioElement.preload = "auto";
  audioElement.loop = true;
  audioElement.src = audioObjectUrl;
  audioElement.addEventListener("ended", () => {
    document.getElementById("playUploaded").classList.remove("playing");
  });
  audioElement.addEventListener("error", () => {
    document.getElementById("audioLevel").textContent = "ERR";
    console.error("Audio file could not be decoded", audioElement.error);
  });
  connectAudioElement(audioElement);
  const button = document.getElementById("playUploaded");
  button.disabled = false;
  button.classList.remove("playing");
  button.textContent = file.name.length > 18 ? `${file.name.slice(0, 18)}...` : file.name;
  document.getElementById("audioLevel").textContent = "0.00";
}

async function toggleUploadedAudio() {
  if (!audioElement) return;
  await ensureAudioContext();
  const button = document.getElementById("playUploaded");
  if (audioElement.paused) {
    if (!connectAudioElement(audioElement)) return;
    if (demoPlaying) {
      oscillator?.stop();
      oscillator = null;
      gainNode?.disconnect();
      gainNode = null;
      demoPlaying = false;
      const demoButton = document.getElementById("demoAudio");
      demoButton.classList.remove("playing");
      demoButton.textContent = "Demo Audio";
    }
    try {
      await audioElement.play();
      button.classList.add("playing");
      updateAudioLevel();
      draw();
    } catch (error) {
      button.classList.remove("playing");
      document.getElementById("audioLevel").textContent = "BLOCKED";
      console.error("Audio playback failed", error);
    }
  } else {
    audioElement.pause();
    button.classList.remove("playing");
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
    setCanvasFillAlpha(0);
    draw();
  } catch {
    URL.revokeObjectURL(imageUrl);
    event.target.value = "";
  }
}

function clearLogoImage() {
  if (logoImageUrl) {
    URL.revokeObjectURL(logoImageUrl);
    logoImageUrl = undefined;
  }
  state.logoImage = null;
  document.getElementById("logoUpload").value = "";
  document.getElementById("clearLogo").disabled = true;
  document.getElementById("logoFileName").textContent = "No logo image";
  updateLogoMarker(true);
  buildPattern();
}

async function handleLogoUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (logoImageUrl) URL.revokeObjectURL(logoImageUrl);
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = imageUrl;
    await image.decode();
    state.logoImage = image;
    logoImageUrl = imageUrl;
    document.getElementById("clearLogo").disabled = false;
    document.getElementById("logoFileName").textContent = file.name;
    updateLogoMarker(true);
    buildPattern();
  } catch {
    URL.revokeObjectURL(imageUrl);
    event.target.value = "";
  }
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
    "straightLines",
    "flourishes",
    "blankAreas",
    "lineThickness",
    "widthVariation",
    "taperStrength",
    "curveSmoothness",
    "circleGuideDensity",
    "circleGuideInfluence",
    "circleMinRadius",
    "circleMaxRadius",
    "noOverlapGap",
    "logoX",
    "logoY",
    "logoW",
    "logoH",
  ]);

  sliders.forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.key;
      state[key] = Number(input.value);
      if (key === "crayonStrength") state.fxWaxStrength = state.crayonStrength;
      if (key === "fxWaxStrength") state.crayonStrength = state.fxWaxStrength;
      syncInputs();
      if (key.startsWith("textArea")) updateMarker();
      if (key.startsWith("logo")) updateLogoMarker();
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

  document.querySelectorAll("input[name='controlsPosition']").forEach((radio) => {
    radio.addEventListener("change", () => setControlPosition(radio.value));
  });

  document.querySelectorAll("input[name='colorChoice']").forEach((radio) => {
    radio.addEventListener("change", () => {
      state.colorChoice = radio.value;
      syncColorInputs();
      document.getElementById("selectedColorTag").textContent = radio.value;
      document.querySelectorAll(".color-option").forEach((label) => {
        label.classList.toggle("selected", label.querySelector("input").checked);
      });
      draw();
    });
  });

  document.querySelectorAll("input[name='mirrorMode']").forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      state.mirrorMode = radio.value;
      buildPattern();
    });
  });

  document.getElementById("bgGradientToggle").addEventListener("change", (event) => {
    state.bgGradient = event.target.checked;
    draw();
  });
  document.getElementById("bgColor2Input").addEventListener("input", (event) => {
    state.bgColor2 = event.target.value;
    draw();
  });
  document.getElementById("fxMetalToggle").addEventListener("change", (event) => {
    state.fxMetal = event.target.checked;
    draw();
  });
  document.getElementById("fxMetalPresetInput").addEventListener("change", (event) => {
    state.fxMetalPreset = event.target.value;
    draw();
  });
  document.getElementById("fxMetalTintInput").addEventListener("input", (event) => {
    state.fxMetalTint = event.target.value;
    draw();
  });
  document.getElementById("fxBubbleToggle").addEventListener("change", (event) => {
    state.fxBubbleBlur = event.target.checked;
    draw();
  });
  document.getElementById("fxGlassToggle").addEventListener("change", (event) => {
    state.fxGlassPolish = event.target.checked;
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

  document.getElementById("animateToggle").addEventListener("change", (event) => {
    state.animate = event.target.checked;
    document.getElementById("motionControls").classList.toggle("closed", !state.animate);
    state.progress = state.animate ? 0 : 1;
    state.hold = 0;
    draw();
  });

  document.getElementById("generateButton").addEventListener("click", buildPattern);
  document.getElementById("downloadButton").addEventListener("click", downloadPng);
  document.getElementById("startFromBottomToggle").addEventListener("change", (event) => {
    state.startFromBottom = event.target.checked;
    buildPattern();
  });
  document.getElementById("bgUpload").addEventListener("change", handleBackgroundUpload);
  document.getElementById("clearBg").addEventListener("click", clearBackgroundImage);
  document.getElementById("logoUpload").addEventListener("change", handleLogoUpload);
  document.getElementById("clearLogo").addEventListener("click", clearLogoImage);
  document.getElementById("demoAudio").addEventListener("click", toggleDemoAudio);
  document.getElementById("audioUpload").addEventListener("change", handleAudioUpload);
  document.getElementById("playUploaded").addEventListener("click", toggleUploadedAudio);
  document.getElementById("mobileToggle").addEventListener("click", () => controls.classList.toggle("hideControls"));

  document.getElementById("bgColorInput").addEventListener("input", (event) => {
    state.bgColor = event.target.value;
    draw();
  });
  document.getElementById("bgAlphaInput").addEventListener("input", (event) => {
    state.bgAlpha = Number(event.target.value);
    document.getElementById("bgAlphaValue").textContent = state.bgAlpha.toFixed(2);
    draw();
  });
  document.getElementById("strokeColorInput").addEventListener("input", (event) => {
    state.strokeColor = event.target.value;
    document.getElementById("fxPatternColorInput").value = state.strokeColor;
    draw();
  });
  document.getElementById("fxPatternColorInput").addEventListener("input", (event) => {
    state.strokeColor = event.target.value;
    document.getElementById("strokeColorInput").value = state.strokeColor;
    draw();
  });
  document.getElementById("fxBubbleColorInput").addEventListener("input", (event) => {
    state.fxBubbleGlowColor = event.target.value;
    draw();
  });
  document.getElementById("strokeAlphaInput").addEventListener("input", (event) => {
    state.strokeAlpha = Number(event.target.value);
    document.getElementById("strokeAlphaValue").textContent = state.strokeAlpha.toFixed(2);
    draw();
  });
  document.getElementById("outlineToggle").addEventListener("change", (event) => {
    state.outlineStroke = event.target.checked;
    draw();
  });
  document.getElementById("outlineColorInput").addEventListener("input", (event) => {
    state.outlineColor = event.target.value;
    draw();
  });
  document.getElementById("outlineAlphaInput").addEventListener("input", (event) => {
    state.outlineAlpha = Number(event.target.value);
    document.getElementById("outlineAlphaValue").textContent = state.outlineAlpha.toFixed(2);
    draw();
  });

  window.addEventListener("resize", () => {
    updateMarker(true);
    updateLogoMarker(true);
  });
}

document.getElementById("startFromBottomToggle").checked = state.startFromBottom;
document.getElementById("bgGradientToggle").checked = state.bgGradient;
document.getElementById("bgColor2Input").value = state.bgColor2;
document.getElementById("fxMetalToggle").checked = state.fxMetal;
document.getElementById("fxMetalPresetInput").value = state.fxMetalPreset;
document.getElementById("fxMetalTintInput").value = state.fxMetalTint;
document.getElementById("fxBubbleToggle").checked = state.fxBubbleBlur;
document.getElementById("fxGlassToggle").checked = state.fxGlassPolish;
document.getElementById("fxPatternColorInput").value = state.strokeColor;
document.getElementById("fxBubbleColorInput").value = state.fxBubbleGlowColor;
document.querySelectorAll("input[name='mirrorMode']").forEach((radio) => {
  radio.checked = radio.value === state.mirrorMode;
});


syncInputs();
resizeCanvas();
bindControls();
buildPattern();
updateLogoMarker(true);
requestAnimationFrame(tick);

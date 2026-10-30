import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "backdrops");

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noise1d(rand, octaves) {
  const layers = Array.from({ length: octaves }, (_, o) => {
    const n = 4 * 2 ** o + 1;
    return Array.from({ length: n + 1 }, () => rand() * 2 - 1);
  });
  return (x) => {
    let v = 0;
    let amp = 1;
    let total = 0;
    layers.forEach((pts) => {
      const n = pts.length - 1;
      const p = x * n;
      const i = Math.min(Math.floor(p), n - 1);
      const f = p - i;
      const t = f * f * (3 - 2 * f);
      v += (pts[i] * (1 - t) + pts[i + 1] * t) * amp;
      total += amp;
      amp *= 0.5;
    });
    return v / total;
  };
}

function ridge(rand, { w, h, base, amp, octaves = 5, steps = 160 }) {
  const n = noise1d(rand, octaves);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * w;
    pts.push([x, base + n(i / steps) * amp]);
  }
  return `M-80 ${h + 120} L-80 ${pts[0][1].toFixed(1)} L${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L")} L${w + 80} ${pts[pts.length - 1][1].toFixed(1)} L${w + 80} ${h + 120} Z`;
}

function ridgePoints(rand, { w, base, amp, octaves = 5, steps = 160 }) {
  const n = noise1d(rand, octaves);
  return Array.from({ length: steps + 1 }, (_, i) => [(i / steps) * w, base + n(i / steps) * amp]);
}

function cumulus(rand, { cx, cy, width, height, puffs }) {
  const circles = [];
  for (let i = 0; i < puffs; i++) {
    const u = rand();
    const x = cx + (u - 0.5) * width;
    const dome = Math.cos((u - 0.5) * Math.PI);
    const r = (height * 0.18 + rand() * height * 0.22) * (0.55 + dome * 0.6);
    const y = cy - dome * height * (0.35 + rand() * 0.45) + r * 0.5;
    circles.push({ x, y, r });
  }
  for (let i = 0; i < puffs * 0.6; i++) {
    const u = rand();
    circles.push({
      x: cx + (u - 0.5) * width * 1.1,
      y: cy + rand() * height * 0.08,
      r: height * (0.1 + rand() * 0.12),
    });
  }
  return circles;
}

function circlesSvg(circles, dx = 0, dy = 0, scale = 1) {
  return circles
    .map(
      (c) =>
        `<circle cx="${(c.x + dx).toFixed(1)}" cy="${(c.y + dy).toFixed(1)}" r="${(c.r * scale).toFixed(1)}"/>`,
    )
    .join("");
}

function cloudSvg(rand, id, cloud, palette, puffId = "puff") {
  const circles = cumulus(rand, cloud);
  const top = Math.min(...circles.map((c) => c.y - c.r));
  const bottom = Math.max(...circles.map((c) => c.y + c.r));
  const puffs = [...circles].sort((a, b) => b.y + b.r - (a.y + a.r));
  const glints = circles
    .filter((c) => c.y - c.r < top + (bottom - top) * 0.45 && rand() > 0.45)
    .map((c) => ({ x: c.x - c.r * 0.3, y: c.y - c.r * 0.36, r: c.r * 0.38 }));
  return `
  <linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${bottom}">
    <stop offset="0" stop-color="${palette.cloudTop}"/>
    <stop offset="0.6" stop-color="${palette.cloudMid}"/>
    <stop offset="1" stop-color="${palette.cloudShade}"/>
  </linearGradient>
  <linearGradient id="${id}b" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${bottom}">
    <stop offset="0" stop-color="${palette.cloudShade}" stop-opacity="0"/>
    <stop offset="0.62" stop-color="${palette.cloudShade}" stop-opacity="0"/>
    <stop offset="1" stop-color="${palette.cloudShade}" stop-opacity="0.75"/>
  </linearGradient>
  <g filter="url(#paint)">
    <g fill="url(#${id}g)">${circlesSvg(circles)}</g>
    <g fill="url(#${puffId})">${circlesSvg(puffs)}</g>
    <g fill="url(#${id}b)">${circlesSvg(circles, 0, 0, 0.98)}</g>
    <g fill="${palette.cloudTop}" opacity="0.6">${circlesSvg(glints)}</g>
  </g>`;
}

function canopy(rand, c) {
  const circles = cumulus(rand, c);
  const lights = circles
    .filter(() => rand() > 0.3)
    .map((o) => ({ x: o.x - o.r * 0.22, y: o.y - o.r * 0.28, r: o.r * 0.6 }));
  const tips = circles
    .filter(() => rand() > 0.55)
    .map((o) => ({ x: o.x - o.r * 0.32, y: o.y - o.r * 0.42, r: o.r * 0.3 }));
  const leaves = Array.from({ length: c.leaves ?? 0 }, () => {
    const o = circles[Math.floor(rand() * circles.length)];
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * o.r * 0.9;
    const lx = o.x + Math.cos(a) * d;
    const ly = o.y + Math.sin(a) * d;
    const lit = Math.sin(a) < 0.2 && Math.cos(a) < 0.4;
    return `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="${(5 + rand() * 11).toFixed(1)}" fill="${lit ? c.tip : c.shade}" opacity="${(0.35 + rand() * 0.45).toFixed(2)}"/>`;
  }).join("");
  const trunk = c.trunk
    ? `<path d="M${c.trunk.x} ${c.trunk.top} q${c.trunk.lean} ${(c.trunk.bottom - c.trunk.top) / 2} ${c.trunk.lean * 0.4} ${c.trunk.bottom - c.trunk.top}" stroke="${c.trunk.color}" stroke-width="${c.trunk.width}" fill="none" stroke-linecap="round"/>`
    : "";
  return `<g filter="url(#paint)">${trunk}<g fill="${c.shade}">${circlesSvg(circles, 6, 14)}</g><g fill="${c.color}">${circlesSvg(circles)}</g><g fill="${c.light}" opacity="0.55">${circlesSvg(lights)}</g><g fill="${c.tip}" opacity="0.5">${circlesSvg(tips)}</g>${leaves}</g>`;
}

function trees(rand, pts, { color, light, size, density }) {
  const out = [];
  pts.forEach(([x, y], i) => {
    if (i % 2 || rand() > density) {
      return;
    }
    const r = size * (0.6 + rand() * 0.8);
    out.push(
      `<circle cx="${x.toFixed(1)}" cy="${(y + r * 0.2).toFixed(1)}" r="${r.toFixed(1)}" fill="${color}"/>`,
      `<circle cx="${(x - r * 0.25).toFixed(1)}" cy="${(y - r * 0.15).toFixed(1)}" r="${(r * 0.55).toFixed(1)}" fill="${light}" opacity="0.55"/>`,
    );
  });
  return out.join("");
}

function flowers(rand, { w, h, top, count, colors }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const y = top + (h - top) * rand() ** 0.6;
    const depth = (y - top) / (h - top);
    const r = 1.2 + depth * 5 * rand();
    out.push(
      `<circle cx="${(rand() * w).toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${colors[Math.floor(rand() * colors.length)]}" opacity="${(0.55 + rand() * 0.45).toFixed(2)}"/>`,
    );
  }
  return out.join("");
}

function grassStrokes(rand, { w, h, top, count, colors }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const y = top + (h - top) * rand() ** 0.8;
    const depth = (y - top) / (h - top);
    const x = rand() * w;
    const len = 6 + depth * 46 * (0.4 + rand());
    const lean = (rand() - 0.5) * len * 0.6;
    out.push(
      `<path d="M${x.toFixed(1)} ${y.toFixed(1)} q${(lean * 0.3).toFixed(1)} ${(-len * 0.6).toFixed(1)} ${lean.toFixed(1)} ${(-len).toFixed(1)}" stroke="${colors[Math.floor(rand() * colors.length)]}" stroke-width="${(1 + depth * 3).toFixed(1)}" stroke-linecap="round" fill="none" opacity="${(0.4 + rand() * 0.5).toFixed(2)}"/>`,
    );
  }
  return out.join("");
}

function fallsSvg(rand, scene) {
  const { w } = scene;
  const f = scene.falls;
  const lipNoise = noise1d(rng(scene.seed + 101), 4);
  const lipAt = (x) => f.lip + lipNoise(x / w) * 14;

  const plateau = ridge(rng(scene.seed + 102), { w, h: f.bottom + 200, base: f.lip - 50, amp: 10 });
  const bushPts = ridgePoints(rng(scene.seed + 103), { w, base: f.lip - 22, amp: 8, steps: 240 });
  const bush = ridge(rng(scene.seed + 103), {
    w,
    h: f.bottom + 200,
    base: f.lip - 22,
    amp: 8,
    steps: 240,
  });

  const cliffTop = Array.from({ length: 121 }, (_, i) => {
    const x = (i / 120) * w;
    return `${x.toFixed(1)} ${lipAt(x).toFixed(1)}`;
  });
  const cliff = `M-40 ${f.bottom + 120} L-40 ${lipAt(0).toFixed(1)} L${cliffTop.join(" L")} L${w + 40} ${lipAt(w).toFixed(1)} L${w + 40} ${f.bottom + 120} Z`;

  const segments = [];
  let x = f.left;
  while (x < f.right) {
    const width = 180 + rand() * 340;
    const x1 = Math.min(x + width, f.right);
    segments.push({ x0: x, x1, flow: 0.6 + rand() * 0.4 });
    x = x1 + 10 + rand() * 34;
  }

  const water = segments
    .map(({ x0, x1, flow }) => {
      const strokes = [];
      for (let sx = x0; sx < x1; sx += 2 + rand() * 3) {
        const edge = Math.min(1, (sx - x0) / 28, (x1 - sx) / 28);
        const top = lipAt(sx);
        const len = f.bottom - top + (rand() - 0.6) * 60;
        const sway = (rand() - 0.5) * 8;
        strokes.push(
          `<path d="M${sx.toFixed(1)} ${top.toFixed(1)} q${sway.toFixed(1)} ${(len * 0.5).toFixed(1)} ${(sway * 0.4).toFixed(1)} ${len.toFixed(1)}" stroke="${f.streaks[Math.floor(rand() * f.streaks.length)]}" stroke-width="${(3 + rand() * 6).toFixed(1)}" opacity="${((0.45 + rand() * 0.55) * flow * edge).toFixed(2)}" fill="none" stroke-linecap="round"/>`,
        );
      }
      for (let k = 0; k < (x1 - x0) / 60; k++) {
        const vx = x0 + 20 + rand() * (x1 - x0 - 40);
        const top = lipAt(vx);
        strokes.push(
          `<path d="M${vx.toFixed(1)} ${top.toFixed(1)} L${(vx + (rand() - 0.5) * 6).toFixed(1)} ${f.bottom.toFixed(1)}" stroke="#ffffff" stroke-width="${(18 + rand() * 26).toFixed(1)}" opacity="0.28" stroke-linecap="round"/>`,
        );
      }
      return `${strokes.join("")}<path d="M${(x0 + 6).toFixed(1)} ${lipAt(x0).toFixed(1)} L${(x1 - 6).toFixed(1)} ${lipAt(x1).toFixed(1)}" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity="0.95"/>`;
    })
    .join("");

  const islands = [];
  segments.slice(0, -1).forEach((sg, i) => {
    const gx = (sg.x1 + segments[i + 1].x0) / 2;
    const count = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < count; k++) {
      const r = 10 + rand() * 18;
      const tx = gx + (rand() - 0.5) * 70;
      const ty = lipAt(tx) - r * 0.4 - rand() * 10;
      islands.push(
        `<circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="${r.toFixed(1)}" fill="${f.bush[0]}"/>`,
        `<circle cx="${(tx - r * 0.25).toFixed(1)}" cy="${(ty - r * 0.2).toFixed(1)}" r="${(r * 0.55).toFixed(1)}" fill="${f.bush[1]}" opacity="0.6"/>`,
      );
    }
  });

  const mistPalette = scene.palette;
  const mist = f.mist.map((m, i) => cloudSvg(rand, `m${i}`, m, mistPalette)).join("");

  const bands = f.rainbow.colors
    .map((c, i) => {
      const r = f.rainbow.r - i * 15;
      const a0 = (205 * Math.PI) / 180;
      const a1 = (300 * Math.PI) / 180;
      const p0 = [f.rainbow.cx + r * Math.cos(a0), f.rainbow.cy + r * Math.sin(a0)];
      const p1 = [f.rainbow.cx + r * Math.cos(a1), f.rainbow.cy + r * Math.sin(a1)];
      return `<path d="M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A${r} ${r} 0 0 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}" stroke="${c}" stroke-width="17" fill="none"/>`;
    })
    .join("");

  return `
  <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fbfdff"/><stop offset="0.45" stop-color="#e3edf4"/><stop offset="1" stop-color="#f4f8fb"/>
  </linearGradient>
  <linearGradient id="basalt" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${f.rock[0]}"/><stop offset="1" stop-color="${f.rock[1]}"/>
  </linearGradient>
  <linearGradient id="plateau" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${f.plateau[0]}"/><stop offset="1" stop-color="${f.plateau[1]}"/>
  </linearGradient>
  <path d="${plateau}" fill="url(#plateau)" filter="url(#haze)"/>
  <g filter="url(#brush)">${trees(rand, bushPts, { color: f.bush[0], light: f.bush[1], size: 9, density: 0.95 })}</g>
  <path d="${bush}" fill="${f.bush[0]}" filter="url(#brush)"/>
  <path d="${cliff}" fill="url(#basalt)" filter="url(#brush)"/>
  <g filter="url(#falls)">${water}</g>
  <g filter="url(#brush)">${islands.join("")}</g>
  <g opacity="${f.mistOpacity}" filter="url(#mist)">${mist}</g>
  <g opacity="${f.rainbow.opacity}" filter="url(#rainbow)">${bands}</g>`;
}

const f1 = (n) => n.toFixed(1);

function pathFrom(pts) {
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${f1(x)} ${f1(y)}`).join(" ");
}

function densify(rand, pts, { steps = 10, ampX = 0, ampY = 0 } = {}) {
  const nx = noise1d(rand, 4);
  const ny = noise1d(rand, 4);
  const out = [];
  const total = (pts.length - 1) * steps;
  pts.slice(0, -1).forEach(([x0, y0], i) => {
    const [x1, y1] = pts[i + 1];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const u = (i * steps + s) / total;
      out.push([x0 + (x1 - x0) * t + nx(u) * ampX, y0 + (y1 - y0) * t + ny(u) * ampY]);
    }
  });
  out.push(pts[pts.length - 1]);
  return out;
}

function topAt(pts, x) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (x >= x0 && x <= x1) {
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  }
  return pts[pts.length - 1][1];
}

function puffGradient(id, p) {
  return `<radialGradient id="${id}" cx="0.42" cy="0.38" r="0.62" fx="0.36" fy="0.3"><stop offset="0" stop-color="${p.cloudTop}"/><stop offset="0.5" stop-color="${p.cloudMid}"/><stop offset="0.85" stop-color="${p.cloudShade}"/><stop offset="1" stop-color="${p.cloudShade}"/></radialGradient>`;
}

function vgrad(id, stops, span) {
  const attrs = span
    ? `gradientUnits="userSpaceOnUse" x1="0" y1="${f1(span[0])}" x2="0" y2="${f1(span[1])}"`
    : `x1="0" y1="0" x2="0" y2="1"`;
  return `<linearGradient id="${id}" ${attrs}>${stops
    .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`)
    .join("")}</linearGradient>`;
}

function cloudBank({ seed, y, w, count, width, height, jitter = 60 }) {
  const rand = rng(seed);
  return Array.from({ length: count }, (_, i) => ({
    cx: ((i + 0.5) / count) * w + (rand() - 0.5) * jitter * 2,
    cy: y + (rand() - 0.5) * jitter,
    width: width * (0.8 + rand() * 0.4),
    height: height * (0.75 + rand() * 0.5),
    puffs: Math.round(14 + (width / 60) * (0.8 + rand() * 0.4)),
  }));
}

const LAYERS = {
  clouds(rand, scene, l, id) {
    const p = l.palette ?? scene.palette;
    const body = l.items.map((c, i) => cloudSvg(rand, `${id}c${i}`, c, p, `${id}p`)).join("");
    return `${puffGradient(`${id}p`, p)}<g opacity="${l.opacity ?? 1}"${l.filter ? ` filter="url(#${l.filter})"` : ""}>${body}</g>`;
  },

  ridge(rand, scene, l, id) {
    const { w, h } = scene;
    const opts = { w, h, base: l.base, amp: l.amp, octaves: l.octaves ?? 5 };
    const seed = scene.seed + l.base;
    const path = ridge(rng(seed), opts);
    const pts = ridgePoints(rng(seed), opts);
    const tree = l.trees ? `<g filter="url(#brush)">${trees(rand, pts, l.trees)}</g>` : "";
    const meadow = l.meadow
      ? `<g filter="url(#brush)">${grassStrokes(rand, {
          w,
          h,
          top: l.base - l.amp,
          count: l.meadow.count ?? 900,
          colors: l.meadow.colors,
        })}${l.meadow.flowers ? flowers(rand, { w, h, top: l.base, count: 420, colors: l.meadow.flowers }) : ""}</g>`
      : "";
    return `${vgrad(id, [
      [0, l.fill[1]],
      [1, l.fill[0]],
    ])}${tree}<path d="${path}" fill="url(#${id})" filter="url(#${l.filter ?? "brush"})"/>${meadow}`;
  },

  ground(rand, scene, l, id) {
    const { w, h } = scene;
    const hz = l.horizon;
    const depth = (y) => (y - hz) / (h - hz);
    const patches = Array.from({ length: l.patches ?? 170 }, () => {
      const y = hz + (h - hz) * rand() ** 1.5;
      const t = depth(y);
      const rx = 30 + t * 280 * (0.5 + rand());
      const ry = rx * (0.07 + t * 0.32);
      const c = l.patchColors[Math.floor(rand() * l.patchColors.length)];
      return `<ellipse cx="${f1(rand() * w)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${c}" opacity="${(0.35 + rand() * 0.4).toFixed(2)}"/>`;
    }).join("");
    const dots = Array.from({ length: l.trees ?? 2400 }, () => {
      const y = hz + 6 + (h - hz) * rand() ** 1.25;
      const t = depth(y);
      const r = 1 + t * t * 8 * (0.5 + rand() * 0.9);
      const x = rand() * w;
      const lit =
        t > 0.3
          ? `<circle cx="${f1(x - r * 0.3)}" cy="${f1(y - r * 0.3)}" r="${f1(r * 0.5)}" fill="${l.treeLight}" opacity="0.5"/>`
          : "";
      return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${l.treeColor}" opacity="${(0.5 + t * 0.45).toFixed(2)}"/>${lit}`;
    }).join("");
    return `${vgrad(id, [
      [0, l.colors[0]],
      [0.35, l.colors[1]],
      [1, l.colors[2]],
    ])}${vgrad(`${id}h`, [
      [0, l.haze, 0.9],
      [1, l.haze, 0],
    ])}
    <rect x="-40" y="${hz}" width="${w + 80}" height="${h - hz + 40}" fill="url(#${id})"/>
    <g filter="url(#paint)">${patches}</g><g filter="url(#brush)">${dots}</g>
    <rect x="-40" y="${hz - 6}" width="${w + 80}" height="${f1((h - hz) * 0.2)}" fill="url(#${id}h)"/>`;
  },

  shadows(rand, scene, l) {
    const { w, h } = scene;
    const hz = l.horizon;
    const s = Array.from({ length: l.count }, () => {
      const y = hz + (h - hz) * (0.08 + rand() * 0.92);
      const t = (y - hz) / (h - hz);
      const rx = 70 + t * 380 * (0.6 + rand());
      return `<ellipse cx="${f1(rand() * w)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(rx * (0.1 + t * 0.3))}"/>`;
    }).join("");
    return `<g fill="${l.color ?? "#173434"}" opacity="${l.opacity ?? 0.22}" filter="url(#shadow)">${s}</g>`;
  },

  river(rand, scene, l, id) {
    const left = densify(rand, l.left, { steps: 24, ampX: l.wiggle ?? 70 });
    const right = densify(rand, l.right, { steps: 24, ampX: l.wiggle ?? 70 });
    const d = `${pathFrom([...left, ...[...right].reverse()])} Z`;
    const ys = [...left, ...right].map((p) => p[1]);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    const fringe = [...left, ...right]
      .flatMap(([x, y]) => {
        const t = (y - top) / (bottom - top);
        return Array.from({ length: 3 }, () => {
          const r = 2 + t * 9 * (0.5 + rand());
          return `<circle cx="${f1(x + (rand() - 0.5) * (10 + t * 30))}" cy="${f1(y + (rand() - 0.5) * (4 + t * 10))}" r="${f1(r)}" fill="${rand() > 0.4 ? l.islandDark : l.island}"/>`;
        });
      })
      .join("");
    const ripples = Array.from({ length: l.ripples ?? 700 }, () => {
      const y = top + (bottom - top) * rand() ** 0.8;
      const t = (y - top) / (bottom - top);
      const len = 6 + t * 80 * rand();
      return `<path d="M${f1(rand() * scene.w)} ${f1(y)} h${f1(len)}" stroke="${rand() > 0.35 ? l.ripple : l.rippleDark}" stroke-width="${f1(0.8 + t * 3)}" stroke-linecap="round" opacity="${(0.25 + rand() * 0.5).toFixed(2)}"/>`;
    }).join("");
    const islands = (l.islands ?? [])
      .map(({ x, y, rx, ry }) => {
        const dots = Array.from({ length: Math.round((rx * ry) / 50) }, () => {
          const a = rand() * Math.PI * 2;
          const k = Math.sqrt(rand()) * 0.85;
          const r = 1.5 + (ry / 10) * rand();
          return `<circle cx="${f1(x + Math.cos(a) * rx * k)}" cy="${f1(y + Math.sin(a) * ry * k)}" r="${f1(r)}" fill="${l.islandDark}" opacity="0.7"/>`;
        }).join("");
        return `<g filter="url(#paint)"><ellipse cx="${f1(x)}" cy="${f1(y + ry * 0.25)}" rx="${f1(rx * 1.04)}" ry="${f1(ry * 0.9)}" fill="${l.ripple}" opacity="0.6"/><ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${l.island}"/><ellipse cx="${f1(x - rx * 0.15)}" cy="${f1(y - ry * 0.2)}" rx="${f1(rx * 0.65)}" ry="${f1(ry * 0.55)}" fill="${l.islandLight}" opacity="0.55"/></g><g filter="url(#brush)">${dots}</g>`;
      })
      .join("");
    return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(top)}" x2="0" y2="${f1(bottom)}"><stop offset="0" stop-color="${l.colors[0]}"/><stop offset="1" stop-color="${l.colors[1]}"/></linearGradient>
    <clipPath id="${id}c"><path d="${d}"/></clipPath>
    <path d="${d}" fill="url(#${id})" filter="url(#brush)"/>
    <g clip-path="url(#${id}c)">${ripples}</g>${islands}<g filter="url(#brush)">${fringe}</g>`;
  },

  chasm(rand, scene, l, id) {
    const lip = densify(rand, l.lip, { steps: 40, ampY: 6 });
    const drop = l.drop;
    const near = lip.map(([x, y]) => [x, y + drop]);
    const chasm = `${pathFrom([...lip, ...[...near].reverse()])} Z`;
    const dry = l.dry ?? [];
    const flowAt = (x) => (dry.some(([a, b]) => x > a && x < b) ? 0.25 : 1);
    const streaks = [];
    const x0 = lip[0][0];
    const x1 = lip[lip.length - 1][0];
    for (let x = x0; x < x1; x += 2 + rand() * 3) {
      const y = topAt(lip, x);
      const len = drop * (0.55 + rand() * 0.5);
      streaks.push(
        `<path d="M${f1(x)} ${f1(y)} l${f1((rand() - 0.5) * 3)} ${f1(len)}" stroke="${rand() > 0.3 ? "#ffffff" : "#d6e3ec"}" stroke-width="${f1(2 + rand() * 3)}" stroke-linecap="round" opacity="${((0.5 + rand() * 0.5) * flowAt(x)).toFixed(2)}"/>`,
      );
    }
    const rimTop = near.map(([x, y]) => [x, y + 4]);
    const rimBottom = near.map(([x, y]) => [x, y + l.rim]);
    const { x: ox, w: ow } = l.outlet;
    const side = (keep) => {
      const top = rimTop.filter(([x]) => keep(x));
      const bottom = rimBottom.filter(([x]) => keep(x));
      return top.length > 1 ? `${pathFrom([...top, ...[...bottom].reverse()])} Z` : "";
    };
    const rimL = side((x) => x < ox - ow / 2);
    const rimR = side((x) => x > ox + ow / 2);
    const rimTrees = near
      .filter(([x]) => Math.abs(x - ox) > ow / 2)
      .flatMap(([x, y]) =>
        rand() > 0.35
          ? [
              `<circle cx="${f1(x)}" cy="${f1(y + 6 + rand() * l.rim * 0.6)}" r="${f1(4 + rand() * 7)}" fill="${l.rimDark}"/>`,
            ]
          : [],
      )
      .join("");
    const gorge = l.gorge;
    const pt = (i) => gorge[Math.max(0, Math.min(gorge.length - 1, i))];
    const segs = gorge.slice(0, -1).map(([gx, gy, gw], i) => {
      const [px, py] = pt(i - 1);
      const [hx, hy, hw] = pt(i + 1);
      const [nx, ny] = pt(i + 2);
      const c1 = [gx + (hx - px) / 6, gy + (hy - py) / 6];
      const c2 = [hx - (nx - gx) / 6, hy - (ny - gy) / 6];
      return {
        d: `M${f1(gx)} ${f1(gy)} C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(hx)} ${f1(hy)}`,
        w: (gw + hw) / 2,
      };
    });
    const stroke = (color, k, extra = "") =>
      segs
        .map(
          (s) =>
            `<path d="${s.d}" stroke="${color}" stroke-width="${f1(Math.max(2, s.w * k))}" stroke-linecap="round" fill="none"${extra}/>`,
        )
        .join("");
    const gorgeSvg = [
      stroke(l.rimDark, 1.55, ' opacity="0.85"'),
      stroke(l.rock[0], 1),
      stroke(l.rock[1], 0.55),
      stroke(l.gorgeWater, 0.16, ' opacity="0.9"'),
    ].join("");
    return `${vgrad(id, [
      [0, l.rock[0]],
      [0.6, l.rock[1]],
      [1, "#cfdde6"],
    ])}
    <g filter="url(#brush)">${gorgeSvg}</g>
    <path d="${chasm}" fill="url(#${id})" filter="url(#brush)"/>
    <g filter="url(#falls)">${streaks.join("")}</g>
    <path d="${pathFrom(lip)}" stroke="#ffffff" stroke-width="4" fill="none" opacity="0.9" filter="url(#brush)"/>
    <g filter="url(#brush)"><path d="${rimL}" fill="${l.rimLight}"/><path d="${rimR}" fill="${l.rimLight}"/>${rimTrees}</g>`;
  },

  rainbow(rand, scene, l) {
    const colors = ["#ff5c5c", "#ffa24d", "#ffe35c", "#6fd36f", "#5aa9ff", "#7b6cff"];
    const bands = colors
      .map((c, i) => {
        const r = l.r - i * (l.band ?? 15);
        const a0 = (l.from * Math.PI) / 180;
        const a1 = (l.to * Math.PI) / 180;
        return `<path d="M${f1(l.cx + r * Math.cos(a0))} ${f1(l.cy + r * Math.sin(a0))} A${r} ${r} 0 0 1 ${f1(l.cx + r * Math.cos(a1))} ${f1(l.cy + r * Math.sin(a1))}" stroke="${c}" stroke-width="${(l.band ?? 15) + 2}" fill="none"/>`;
      })
      .join("");
    return `<g opacity="${l.opacity}" filter="url(#rainbow)">${bands}</g>`;
  },

  mountain(rand, scene, l, id) {
    const top = densify(rand, l.points, { steps: 12, ampY: l.rough ?? 5 });
    const base = l.base;
    const xa = top[0][0];
    const xb = top[top.length - 1][0];
    const d = `M${f1(xa)} ${base} ${pathFrom(top).replace(/^M/, "L")} L${f1(xb)} ${base} Z`;
    const minY = Math.min(...top.map((p) => p[1]));
    const strata = [];
    if (l.strata) {
      for (
        let y = minY + 8;
        y < Math.min(base, minY + (l.strata.depth ?? 9999));
        y += l.strata.gap * (0.7 + rand() * 0.6)
      ) {
        const wv = densify(
          rand,
          [
            [xa, y],
            [xb, y + (rand() - 0.5) * 10],
          ],
          { steps: 30, ampY: 4 },
        );
        strata.push(
          `<path d="${pathFrom(wv)}" stroke="${rand() > 0.5 ? l.strata.dark : l.strata.light}" stroke-width="${f1(1.5 + rand() * 3.5)}" fill="none" opacity="${(0.18 + rand() * 0.22).toFixed(2)}"/>`,
        );
      }
    }
    const gullies = Array.from({ length: l.gullies ?? 0 }, () => {
      const x = xa + rand() * (xb - xa);
      const y = topAt(top, x);
      const len = 40 + rand() * (l.gullyLength ?? 260);
      const wob = (rand() - 0.5) * 20;
      return `<path d="M${f1(x)} ${f1(y + 3)} q${f1(wob)} ${f1(len / 2)} ${f1(wob * 0.3)} ${f1(len)}" stroke="${l.gullyColor}" stroke-width="${f1(2 + rand() * 6)}" stroke-linecap="round" fill="none" opacity="${(0.15 + rand() * 0.25).toFixed(2)}"/>`;
    }).join("");
    const lowerTrees = l.scrub
      ? Array.from({ length: l.scrub.count }, () => {
          const x = xa + rand() * (xb - xa);
          const ty = topAt(top, x);
          const from = Math.max(ty + 20, base - (base - minY) * l.scrub.height);
          const y = from + rand() * (base - from);
          const r = 3 + rand() * l.scrub.size;
          return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${rand() > 0.4 ? l.scrub.color : l.scrub.light}" opacity="${(0.5 + rand() * 0.4).toFixed(2)}"/>`;
        }).join("")
      : "";
    return `${vgrad(
      id,
      l.fill.map((c, i) => [(i / (l.fill.length - 1)).toFixed(2), c]),
      [minY, base],
    )}
    <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="${l.lightLeft ?? 0.12}"/><stop offset="1" stop-color="#000000" stop-opacity="${l.darkRight ?? 0.12}"/></linearGradient>
    <clipPath id="${id}c"><path d="${d}"/></clipPath>
    <g filter="url(#brush)">
      <path d="${d}" fill="url(#${id})"/>
      <g clip-path="url(#${id}c)">${strata.join("")}${gullies}${lowerTrees}<rect x="${f1(xa)}" y="${f1(minY)}" width="${f1(xb - xa)}" height="${f1(base - minY)}" fill="url(#${id}s)"/></g>
    </g>`;
  },

  tablecloth(rand, scene, l, id) {
    const { x0, x1, top, drop } = l;
    const ridgeTop = (x) => (l.surface ? topAt(l.surface, x) : top);
    const puffs = [];
    for (let x = x0; x <= x1; x += 14 + rand() * 14) {
      const r = 16 + rand() * 30;
      puffs.push(
        `<circle cx="${f1(x)}" cy="${f1(ridgeTop(x) - r * 0.25 + (rand() - 0.5) * 8)}" r="${f1(r)}"/>`,
      );
    }
    const bottom = [];
    for (let x = x1; x >= x0; x -= 22) {
      const tongue = Math.abs(Math.sin(x / 47 + rand())) * (0.4 + rand() * 0.6);
      bottom.push([x, ridgeTop(x) + drop * (0.25 + 0.75 * tongue)]);
    }
    const topEdge = [];
    for (let x = x0; x <= x1; x += 22) {
      topEdge.push([x, ridgeTop(x) - 10]);
    }
    const drape = `${pathFrom([...topEdge, ...bottom])} Z`;
    const minTop = Math.min(...topEdge.map((p) => p[1]));
    const wisps = Array.from({ length: Math.round((x1 - x0) / 9) }, () => {
      const x = x0 + rand() * (x1 - x0);
      const y = ridgeTop(x);
      return `<path d="M${f1(x)} ${f1(y)} l${f1((rand() - 0.5) * 8)} ${f1(drop * (0.3 + rand() * 0.8))}" stroke="${l.color}" stroke-width="${f1(3 + rand() * 7)}" stroke-linecap="round" opacity="${(0.1 + rand() * 0.2).toFixed(2)}"/>`;
    }).join("");
    return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(minTop)}" x2="0" y2="${f1(minTop + drop * 1.1)}"><stop offset="0" stop-color="${l.color}" stop-opacity="0.95"/><stop offset="0.55" stop-color="${l.color}" stop-opacity="0.6"/><stop offset="1" stop-color="${l.color}" stop-opacity="0"/></linearGradient>
    <g opacity="${l.opacity ?? 1}">
      <g filter="url(#mistl)"><path d="${drape}" fill="url(#${id})"/>${wisps}</g>
      <g fill="${l.color}" filter="url(#paint)">${puffs.join("")}</g>
      <g fill="${l.shade}" opacity="0.35" filter="url(#paint)">${puffs
        .slice(0, Math.round(puffs.length))
        .filter(() => rand() > 0.6)
        .join("")}</g>
    </g>`;
  },

  water(rand, scene, l, id) {
    const { w, h } = scene;
    const top = l.top;
    const bottom = l.bottom ?? h;
    const ripples = Array.from({ length: l.ripples ?? 900 }, () => {
      const y = top + (bottom - top) * rand() ** 0.9;
      const t = (y - top) / (bottom - top);
      const len = 6 + t * 120 * rand();
      const glint = l.glint && rand() < 0.3;
      const x = glint ? l.glint.x + (rand() - 0.5) * l.glint.spread : rand() * w;
      const color = glint ? l.glint.color : rand() > 0.4 ? l.light : l.dark;
      return `<path d="M${f1(x)} ${f1(y)} h${f1(len)}" stroke="${color}" stroke-width="${f1(0.8 + t * 3.2)}" stroke-linecap="round" opacity="${(0.25 + rand() * 0.5).toFixed(2)}"/>`;
    }).join("");
    return `${vgrad(id, [
      [0, l.colors[0]],
      [1, l.colors[1]],
    ])}
    <rect x="-40" y="${top}" width="${w + 80}" height="${bottom - top + 40}" fill="url(#${id})"/>
    <g filter="url(#brush)">${ripples}</g>
    <rect x="-40" y="${top - 2}" width="${w + 80}" height="10" fill="${l.horizonLine ?? l.light}" opacity="0.5" filter="url(#haze)"/>`;
  },

  beach(rand, scene, l, id) {
    const { w, h } = scene;
    const shore = densify(
      rand,
      [
        [-40, l.top],
        [w + 40, l.top + (l.tilt ?? 0)],
      ],
      { steps: 60, ampY: 10 },
    );
    const sand = `${pathFrom(shore)} L${w + 40} ${h + 40} L-40 ${h + 40} Z`;
    const foam = [0, 1, 2, 3]
      .map((k) => {
        const off = -8 - k * (12 + k * 8);
        const line = densify(
          rand,
          [
            [-40, l.top + off],
            [w + 40, l.top + off + (l.tilt ?? 0)],
          ],
          { steps: 60, ampY: 6 + k * 2 },
        );
        return `<path d="${pathFrom(line)}" stroke="#ffffff" stroke-width="${f1(5 - k)}" fill="none" opacity="${(0.85 - k * 0.18).toFixed(2)}" stroke-linecap="round"/>`;
      })
      .join("");
    const wet = shore.map(([x, y]) => [x, y + 26]);
    return `${vgrad(
      id,
      [
        [0, l.sand[0]],
        [1, l.sand[1]],
      ],
      [l.top, h],
    )}
    <g filter="url(#brush)">${foam}
      <path d="${sand}" fill="url(#${id})"/>
      <path d="${pathFrom([...shore, ...[...wet].reverse()])} Z" fill="${l.wet}" opacity="0.5"/>
    </g>`;
  },

  fynbos(rand, scene, l, id) {
    const { w, h } = scene;
    const opts = { w, h, base: l.base, amp: l.amp, octaves: 5 };
    const path = ridge(rng(scene.seed + l.base), opts);
    const pts = ridgePoints(rng(scene.seed + l.base), opts);
    const yTop = (x) => topAt(pts, x);
    const depthAt = (y) =>
      Math.min(1, Math.max(0, (y - (l.base - l.amp)) / (h - (l.base - l.amp))));
    const restio = Array.from({ length: l.restios ?? 900 }, () => {
      const x = rand() * w;
      const y = yTop(x) + rand() ** 0.7 * (h - yTop(x));
      const t = depthAt(y);
      const len = 10 + t * 90 * (0.4 + rand());
      return `<path d="M${f1(x)} ${f1(y)} q${f1((rand() - 0.5) * len * 0.3)} ${f1(-len * 0.6)} ${f1((rand() - 0.5) * len * 0.4)} ${f1(-len)}" stroke="${l.restioColors[Math.floor(rand() * l.restioColors.length)]}" stroke-width="${f1(1 + t * 2.5)}" fill="none" stroke-linecap="round" opacity="${(0.5 + rand() * 0.4).toFixed(2)}"/>`;
    }).join("");
    const shrubs = Array.from({ length: l.shrubs ?? 260 }, () => {
      const x = rand() * w;
      const y = yTop(x) + 6 + rand() ** 0.8 * (h - yTop(x));
      const t = depthAt(y);
      const r = 5 + t * 34 * (0.5 + rand());
      const c = l.shrubColors[Math.floor(rand() * l.shrubColors.length)];
      return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${c}"/><circle cx="${f1(x - r * 0.25)}" cy="${f1(y - r * 0.3)}" r="${f1(r * 0.55)}" fill="${l.shrubLight}" opacity="0.4"/>`;
    }).join("");
    const blooms = Array.from({ length: l.proteas ?? 60 }, () => {
      const x = rand() * w;
      const y = yTop(x) + 20 + rand() ** 0.5 * (h - yTop(x) - 20);
      const t = depthAt(y);
      const r = 4 + t * 26 * (0.6 + rand() * 0.6);
      if (rand() < (l.pincushion ?? 0.3)) {
        const dots = Array.from({ length: 10 }, (_, k) => {
          const a = (k / 10) * Math.PI * 2;
          return `<circle cx="${f1(x + Math.cos(a) * r * 0.9)}" cy="${f1(y + Math.sin(a) * r * 0.9)}" r="${f1(r * 0.18)}" fill="#ffb347"/>`;
        }).join("");
        return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.85)}" fill="#f07a2a"/>${dots}`;
      }
      return `<ellipse cx="${f1(x)}" cy="${f1(y + r * 0.6)}" rx="${f1(r * 0.9)}" ry="${f1(r * 0.4)}" fill="#3f5a34"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="url(#${id}p)"/><circle cx="${f1(x)}" cy="${f1(y - r * 0.05)}" r="${f1(r * 0.45)}" fill="#f6e4c6" opacity="0.85"/>`;
    }).join("");
    return `${vgrad(id, [
      [0, l.fill[1]],
      [1, l.fill[0]],
    ])}<radialGradient id="${id}p" cx="0.5" cy="0.45" r="0.55"><stop offset="0" stop-color="#f8d9d6"/><stop offset="0.6" stop-color="#e98aa0"/><stop offset="1" stop-color="#b84a66"/></radialGradient>
    <path d="${path}" fill="url(#${id})" filter="url(#brush)"/>
    <g filter="url(#brush)">${shrubs}${restio}${blooms}</g>`;
  },

  canopies(rand, scene, l) {
    return l.items.map((c) => canopy(rand, c)).join("");
  },
};

const defs = (w, h) => `
  <filter id="paint" x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="4" seed="3" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="46" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="1.6"/>
  </filter>
  <filter id="brush" x="-5%" y="-20%" width="110%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="0.02 0.06" numOctaves="3" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="0.7"/>
  </filter>
  <filter id="haze"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="falls" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.05 0.004" numOctaves="3" seed="9" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="12" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="0.8"/>
  </filter>
  <filter id="shadow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="22"/></filter>
  <filter id="mistl" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="10"/></filter>
  <filter id="mist" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16"/></filter>
  <filter id="rainbow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0.9 -0.25"/>
  </filter>
  <filter id="canvas" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.004 0.012" numOctaves="3" seed="5" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 -0.18"/>
  </filter>
  <rect id="full" width="${w}" height="${h}"/>`;

const scenes = {
  falls: {
    seed: 77,
    w: 2400,
    h: 1600,
    sky: ["#1546a0", "#2a66c0", "#6aa3dc", "#c4dcef"],
    glow: { cx: 0.7, cy: 0.62, color: "#fff6e0", opacity: 0.6 },
    palette: {
      cloudTop: "#ffffff",
      cloudLight: "#ffffff",
      cloudMid: "#eef3f7",
      cloudShade: "#b4c4d4",
    },
    clouds: [
      { cx: 330, cy: 330, width: 620, height: 210, puffs: 14 },
      { cx: 2080, cy: 300, width: 680, height: 240, puffs: 16 },
    ],
    falls: {
      lip: 707,
      bottom: 975,
      left: 60,
      right: 2340,
      plateau: ["#7fa0b2", "#93b1bd"],
      bush: ["#3f5c3a", "#8aa66e"],
      rock: ["#6e4a38", "#33241f"],
      streaks: ["#ffffff", "#ffffff", "#e8f0f6", "#c8d8e5", "#a8bfd1"],
      mistOpacity: 0.78,
      mist: [
        { cx: 1780, cy: 1005, width: 720, height: 700, puffs: 36 },
        { cx: 600, cy: 1035, width: 560, height: 320, puffs: 20 },
        { cx: 1150, cy: 1065, width: 900, height: 220, puffs: 22 },
        { cx: 2250, cy: 1065, width: 560, height: 240, puffs: 16 },
        { cx: 160, cy: 1075, width: 500, height: 200, puffs: 14 },
        { cx: 1200, cy: 1125, width: 2600, height: 180, puffs: 44 },
      ],
      rainbow: {
        cx: 1620,
        cy: 1385,
        r: 640,
        opacity: 0.3,
        colors: ["#ff5c5c", "#ffa24d", "#ffe35c", "#6fd36f", "#5aa9ff", "#7b6cff"],
      },
    },
    canopies: [
      {
        cx: 60,
        cy: 1030,
        width: 420,
        height: 380,
        puffs: 24,
        leaves: 520,
        trunk: { x: 150, top: 920, bottom: 1700, lean: -24, width: 22, color: "#3a2a20" },
      },
      { cx: 250, cy: 1230, width: 460, height: 360, puffs: 24, leaves: 520 },
      {
        cx: 2360,
        cy: 1070,
        width: 400,
        height: 360,
        puffs: 22,
        leaves: 480,
        trunk: { x: 2270, top: 970, bottom: 1700, lean: 20, width: 20, color: "#3a2a20" },
      },
      { cx: 2160, cy: 1260, width: 440, height: 320, puffs: 22, leaves: 480 },
    ].map((c) => ({ ...c, color: "#2c5a31", shade: "#1b3a22", light: "#5f9a4c", tip: "#a9cf72" })),
    hills: [
      {
        base: 1160,
        amp: 70,
        fill: ["#2a5233", "#46773f"],
        trees: { color: "#264d2f", light: "#86b566", size: 30, density: 0.5 },
        meadow: true,
      },
    ],
  },
  sky: {
    seed: 21,
    w: 2400,
    h: 1600,
    sky: ["#123b8c", "#1f56b0", "#4b84cf", "#9cc1e6"],
    glow: { cx: 0.62, cy: 0.7, color: "#ffe2b8", opacity: 0.55 },
    palette: {
      cloudTop: "#fffaf0",
      cloudLight: "#ffffff",
      cloudMid: "#f2ead9",
      cloudShade: "#9aa9c9",
    },
    clouds: [
      { cx: 1820, cy: 1080, width: 1250, height: 900, puffs: 34 },
      { cx: 380, cy: 1180, width: 1000, height: 560, puffs: 26 },
      { cx: 1080, cy: 1250, width: 900, height: 380, puffs: 20 },
      { cx: 1900, cy: 260, width: 520, height: 160, puffs: 12 },
      { cx: 260, cy: 380, width: 420, height: 120, puffs: 10 },
    ],
    hills: [
      { base: 1320, amp: 90, fill: ["#6f8fbf", "#8fa9cc"], filter: "haze" },
      {
        base: 1400,
        amp: 110,
        fill: ["#3f6f6a", "#5f8a74"],
        trees: { color: "#2f5a4e", light: "#7fa58a", size: 18, density: 0.7 },
      },
      {
        base: 1490,
        amp: 70,
        fill: ["#4f7f3f", "#7ea25a"],
        trees: { color: "#355f2e", light: "#a6c070", size: 26, density: 0.55 },
      },
    ],
  },
  meadow: {
    seed: 8,
    w: 2000,
    h: 1400,
    sky: ["#1b4f9e", "#2e6cc0", "#6aa0db", "#c7ddf0"],
    glow: { cx: 0.3, cy: 0.6, color: "#fff4d6", opacity: 0.4 },
    palette: {
      cloudTop: "#fffdf4",
      cloudLight: "#ffffff",
      cloudMid: "#f4f0dc",
      cloudShade: "#a3b4cf",
    },
    clouds: [
      { cx: 1300, cy: 760, width: 1100, height: 640, puffs: 30 },
      { cx: 380, cy: 820, width: 760, height: 420, puffs: 22 },
      { cx: 1750, cy: 300, width: 420, height: 140, puffs: 10 },
    ],
    hills: [
      { base: 930, amp: 50, fill: ["#6d8fb5", "#93aec8"], filter: "haze" },
      {
        base: 990,
        amp: 40,
        fill: ["#4c7a55", "#6d9561"],
        trees: { color: "#365f3c", light: "#8fb378", size: 16, density: 0.6 },
      },
      { base: 1060, amp: 30, fill: ["#7fae4c", "#a9cc62"], meadow: true },
    ],
    flowers: ["#ffffff", "#fff6c9", "#f3f0ff"],
  },
  dusk: {
    seed: 42,
    w: 2400,
    h: 1400,
    sky: ["#f2b8a2", "#f6cdb0", "#fbe3c8", "#fff1df"],
    glow: { cx: 0.5, cy: 0.62, color: "#fff8ec", opacity: 0.9 },
    palette: {
      cloudTop: "#fff6ea",
      cloudLight: "#fffaf3",
      cloudMid: "#fbe4d0",
      cloudShade: "#e9b9a8",
    },
    clouds: [
      { cx: 360, cy: 760, width: 900, height: 520, puffs: 26 },
      { cx: 2080, cy: 700, width: 900, height: 580, puffs: 26 },
      { cx: 1200, cy: 300, width: 600, height: 140, puffs: 12 },
    ],
    hills: [
      { base: 1080, amp: 70, fill: ["#d9a6a0", "#e8bfb0"], filter: "haze" },
      {
        base: 1170,
        amp: 60,
        fill: ["#b98a7c", "#cfa48f"],
        trees: { color: "#9b6f63", light: "#e2b9a2", size: 16, density: 0.5 },
      },
      { base: 1260, amp: 40, fill: ["#c99a6a", "#e2bc86"], meadow: true },
    ],
    flowers: ["#fff4e0", "#ffe6c4"],
  },
  golden: {
    seed: 64,
    w: 2000,
    h: 1400,
    sky: ["#3d6fb8", "#7fa6d4", "#e9c98f", "#f6dca6"],
    glow: { cx: 0.7, cy: 0.62, color: "#fff1c4", opacity: 0.85 },
    palette: {
      cloudTop: "#fff6dc",
      cloudLight: "#fffaea",
      cloudMid: "#f6dfb0",
      cloudShade: "#c9a07a",
    },
    clouds: [
      { cx: 520, cy: 640, width: 900, height: 420, puffs: 24 },
      { cx: 1600, cy: 520, width: 700, height: 300, puffs: 18 },
    ],
    hills: [
      { base: 860, amp: 60, fill: ["#a58a6c", "#bfa585"], filter: "haze" },
      {
        base: 930,
        amp: 50,
        fill: ["#6c6a3c", "#8b8549"],
        trees: { color: "#55542f", light: "#c9b874", size: 22, density: 0.65 },
      },
      { base: 1010, amp: 35, fill: ["#c99a3e", "#e6c066"], meadow: true },
    ],
    flowers: ["#fff3cf", "#ffe7a8"],
  },
  haze: {
    seed: 17,
    w: 2000,
    h: 1400,
    sky: ["#5b4ab8", "#7a6cd0", "#b3a8e8", "#ece6fb"],
    glow: { cx: 0.5, cy: 0.55, color: "#fff0f6", opacity: 0.6 },
    palette: {
      cloudTop: "#fffaff",
      cloudLight: "#ffffff",
      cloudMid: "#efe6fb",
      cloudShade: "#a99ad6",
    },
    clouds: [
      { cx: 1000, cy: 900, width: 1500, height: 700, puffs: 36 },
      { cx: 250, cy: 420, width: 420, height: 140, puffs: 10 },
      { cx: 1750, cy: 360, width: 480, height: 150, puffs: 10 },
    ],
    hills: [
      { base: 1150, amp: 60, fill: ["#8f86c4", "#ada4d8"], filter: "haze" },
      {
        base: 1250,
        amp: 45,
        fill: ["#6f78a8", "#8d94bf"],
        trees: { color: "#5a6292", light: "#b4b8e0", size: 14, density: 0.5 },
      },
    ],
  },
};

const whiteClouds = {
  cloudTop: "#fffaf0",
  cloudLight: "#ffffff",
  cloudMid: "#f2ead9",
  cloudShade: "#9aa9c9",
};

function fallsAerial({ seed, sky, glow, clouds, mist, ground, river, shadow, low }) {
  const lip = [
    [100, 880],
    [700, 872],
    [1300, 862],
    [1900, 852],
    [2330, 848],
  ];
  return {
    seed,
    w: 2400,
    h: 1600,
    sky,
    glow,
    palette: clouds,
    layers: [
      {
        type: "clouds",
        palette: clouds,
        items: [
          { cx: 300, cy: 445, width: 640, height: 320, puffs: 22 },
          { cx: 920, cy: 452, width: 520, height: 210, puffs: 18 },
          { cx: 1900, cy: 440, width: 820, height: 380, puffs: 26 },
          { cx: 1450, cy: 458, width: 440, height: 170, puffs: 14 },
          { cx: 600, cy: 160, width: 420, height: 120, puffs: 10 },
          { cx: 2100, cy: 130, width: 380, height: 110, puffs: 10 },
        ],
      },
      { type: "ground", horizon: 430, ...ground },
      {
        type: "river",
        left: [
          [1010, 440],
          [985, 455],
          [940, 470],
          [900, 490],
          [930, 515],
          [880, 545],
          [760, 575],
          [700, 610],
          [560, 650],
          [500, 700],
          [360, 745],
          [300, 790],
          [180, 830],
          [100, 880],
        ],
        right: [
          [1090, 440],
          [1130, 455],
          [1180, 472],
          [1260, 492],
          [1240, 520],
          [1330, 550],
          [1520, 585],
          [1560, 620],
          [1760, 660],
          [1830, 710],
          [2000, 750],
          [2120, 790],
          [2260, 820],
          [2330, 850],
        ],
        wiggle: 30,
        ...river,
        islands: [
          { x: 1000, y: 520, rx: 90, ry: 14 },
          { x: 1400, y: 600, rx: 140, ry: 22 },
          { x: 700, y: 690, rx: 160, ry: 26 },
          { x: 1700, y: 720, rx: 120, ry: 22 },
          { x: 1150, y: 790, rx: 210, ry: 32 },
          { x: 420, y: 815, rx: 130, ry: 22 },
          { x: 1980, y: 812, rx: 110, ry: 20 },
        ],
      },
      {
        type: "shadows",
        horizon: 430,
        count: low ? 22 : 14,
        opacity: low ? 0.26 : 0.2,
        color: shadow,
      },
      {
        type: "chasm",
        lip,
        drop: 70,
        rim: 46,
        outlet: { x: 1480, w: 70 },
        rimLight: ground.rim[0],
        rimDark: ground.rim[1],
        rock: ["#7a6150", "#3a2c24"],
        gorgeWater: "#3f7f8a",
        dry: [
          [160, 330],
          [2100, 2300],
        ],
        gorge: [
          [1480, 985, 22],
          [1300, 1060, 30],
          [1620, 1150, 38],
          [1220, 1270, 48],
          [1700, 1420, 60],
          [1250, 1620, 74],
        ],
      },
      {
        type: "clouds",
        palette: mist,
        filter: "mist",
        opacity: 0.82,
        items: [
          { cx: 1380, cy: 905, width: 420, height: 760, puffs: 30 },
          { cx: 860, cy: 915, width: 380, height: 220, puffs: 16 },
          { cx: 1880, cy: 905, width: 360, height: 220, puffs: 16 },
        ],
      },
      { type: "rainbow", cx: 1350, cy: 1150, r: 300, from: 200, to: 340, opacity: 0.32, band: 10 },
      ...(low
        ? [
            {
              type: "clouds",
              palette: clouds,
              items: [
                { cx: 260, cy: 1260, width: 820, height: 380, puffs: 28 },
                { cx: 2120, cy: 1360, width: 900, height: 430, puffs: 30 },
                { cx: 1150, cy: 1600, width: 1100, height: 380, puffs: 32 },
                { cx: 1720, cy: 650, width: 380, height: 120, puffs: 12 },
                { cx: 520, cy: 610, width: 300, height: 95, puffs: 10 },
              ],
            },
          ]
        : []),
    ],
  };
}

const tableTop = [
  [-40, 940],
  [150, 860],
  [300, 750],
  [400, 660],
  [455, 612],
  [510, 640],
  [600, 690],
  [690, 700],
  [730, 670],
  [752, 610],
  [770, 556],
  [800, 545],
  [1000, 541],
  [1200, 538],
  [1400, 540],
  [1580, 536],
  [1640, 542],
  [1662, 590],
  [1690, 660],
  [1760, 740],
  [1860, 805],
  [1960, 860],
  [2100, 905],
  [2440, 950],
];
const tableCloth = [
  [775, 552],
  [800, 545],
  [1000, 541],
  [1200, 538],
  [1400, 540],
  [1580, 536],
  [1645, 544],
];
const lionsHead = [
  [1840, 1010],
  [1930, 920],
  [2010, 820],
  [2060, 730],
  [2110, 684],
  [2160, 690],
  [2210, 740],
  [2270, 820],
  [2340, 880],
  [2440, 920],
];

function tableBay({
  seed,
  sky,
  glow,
  clouds,
  rock,
  lion,
  strata,
  gully,
  scrub,
  cloth,
  water,
  beach,
  fynbos,
}) {
  return {
    seed,
    w: 2400,
    h: 1600,
    sky,
    glow,
    palette: clouds,
    layers: [
      {
        type: "clouds",
        palette: clouds,
        items: [
          { cx: 350, cy: 380, width: 620, height: 270, puffs: 20 },
          { cx: 2050, cy: 330, width: 720, height: 310, puffs: 22 },
          { cx: 1250, cy: 220, width: 420, height: 120, puffs: 10 },
          { cx: 1780, cy: 700, width: 340, height: 110, puffs: 10 },
        ],
      },
      {
        type: "mountain",
        points: tableTop,
        base: 1012,
        fill: rock,
        strata: { gap: 15, depth: 210, ...strata },
        gullies: 80,
        gullyLength: 190,
        gullyColor: gully,
        scrub: { count: 1400, height: 0.55, size: 8, ...scrub },
        rough: 4,
      },
      { type: "tablecloth", x0: 775, x1: 1645, top: 540, drop: 130, surface: tableCloth, ...cloth },
      {
        type: "mountain",
        points: lionsHead,
        base: 1012,
        fill: lion,
        strata: { gap: 13, depth: 170, ...strata },
        gullies: 30,
        gullyLength: 200,
        gullyColor: gully,
        scrub: { count: 420, height: 0.45, size: 6, ...scrub },
        rough: 3,
      },
      { type: "water", top: 1010, bottom: 1272, ripples: 1100, ...water },
      { type: "beach", top: 1272, tilt: -20, ...beach },
      { type: "fynbos", base: 1500, amp: 70, proteas: 30, restios: 600, shrubs: 140, ...fynbos },
    ],
  };
}

const scale = (pts, k, cx, baseFrom, baseTo) =>
  pts.map(([x, y]) => [cx + (x - cx) * k, baseTo - (baseFrom - y) * k]);

Object.assign(scenes, {
  "clouds-tall": {
    seed: 31,
    w: 2400,
    h: 1600,
    sky: ["#0f3a8a", "#1f5bb5", "#5d93d6", "#b8d5ee"],
    glow: { cx: 0.5, cy: 0.75, color: "#fff0d0", opacity: 0.5 },
    palette: whiteClouds,
    layers: [
      {
        type: "clouds",
        items: [
          { cx: 1650, cy: 1150, width: 1100, height: 1250, puffs: 42 },
          { cx: 520, cy: 1150, width: 900, height: 900, puffs: 34 },
          { cx: 1100, cy: 1210, width: 800, height: 420, puffs: 22 },
          { cx: 2280, cy: 1180, width: 520, height: 520, puffs: 18 },
          { cx: 300, cy: 300, width: 380, height: 110, puffs: 9 },
          { cx: 1300, cy: 230, width: 300, height: 90, puffs: 8 },
        ],
      },
      { type: "ridge", base: 1260, amp: 60, fill: ["#6d8fb5", "#93aec8"], filter: "haze" },
      {
        type: "ridge",
        base: 1330,
        amp: 70,
        fill: ["#3f6f5a", "#5f8a64"],
        trees: { color: "#2f5a44", light: "#7fa58a", size: 16, density: 0.7 },
      },
      {
        type: "ridge",
        base: 1430,
        amp: 40,
        fill: ["#6f9e44", "#9cc25a"],
        meadow: {
          colors: ["#6f9e44", "#9cc25a", "#5c8a36", "#c8dc7c"],
          flowers: ["#ffffff", "#fff6c9"],
        },
      },
    ],
  },

  "towers-hero": {
    seed: 31,
    w: 2400,
    h: 1800,
    sky: ["#0f3a8a", "#1f5bb5", "#5d93d6", "#b8d5ee"],
    glow: { cx: 0.5, cy: 0.5, color: "#fff0d0", opacity: 0.45 },
    palette: whiteClouds,
    layers: [
      {
        type: "clouds",
        items: [
          { cx: 2010, cy: 900, width: 980, height: 860, puffs: 40 },
          { cx: 380, cy: 910, width: 820, height: 720, puffs: 34 },
          { cx: 1220, cy: 940, width: 900, height: 230, puffs: 22 },
          { cx: 1500, cy: 180, width: 300, height: 80, puffs: 8 },
          { cx: 820, cy: 240, width: 260, height: 70, puffs: 7 },
        ],
      },
      { type: "ridge", base: 960, amp: 40, fill: ["#6d8fb5", "#93aec8"], filter: "haze" },
      {
        type: "ridge",
        base: 1010,
        amp: 45,
        fill: ["#3f6f5a", "#5f8a64"],
        trees: { color: "#2f5a44", light: "#7fa58a", size: 13, density: 0.7 },
      },
      {
        type: "ridge",
        base: 1090,
        amp: 30,
        fill: ["#6f9e44", "#9cc25a"],
        meadow: {
          colors: ["#6f9e44", "#9cc25a", "#5c8a36", "#c8dc7c"],
          flowers: ["#ffffff", "#fff6c9"],
        },
      },
    ],
  },

  "clouds-dawn": {
    seed: 12,
    w: 2400,
    h: 1600,
    sky: ["#33427f", "#7b6fb4", "#e9a9a8", "#fcdcbc"],
    glow: { cx: 0.5, cy: 0.8, color: "#fff2d8", opacity: 0.9 },
    palette: {
      cloudTop: "#fff3e8",
      cloudLight: "#fff8f0",
      cloudMid: "#f6c9c0",
      cloudShade: "#8f80b8",
    },
    layers: [
      {
        type: "clouds",
        items: [
          { cx: 600, cy: 780, width: 1000, height: 440, puffs: 30 },
          { cx: 1820, cy: 700, width: 1100, height: 540, puffs: 32 },
          { cx: 1200, cy: 380, width: 700, height: 160, puffs: 14 },
          { cx: 250, cy: 300, width: 400, height: 120, puffs: 10 },
        ],
      },
      { type: "ridge", base: 1080, amp: 80, fill: ["#7c6aa8", "#9c8cc4"], filter: "haze" },
      {
        type: "ridge",
        base: 1180,
        amp: 70,
        fill: ["#5a4f86", "#77689e"],
        trees: { color: "#4a416f", light: "#a79bd0", size: 14, density: 0.6 },
      },
      {
        type: "water",
        top: 1250,
        colors: ["#f0b9b4", "#8f7fb5"],
        light: "#ffe3d0",
        dark: "#6f5f99",
        glint: { x: 1200, spread: 420, color: "#fff2dc" },
        ripples: 700,
      },
      {
        type: "ridge",
        base: 1520,
        amp: 40,
        fill: ["#3c3560", "#544a7e"],
        meadow: { colors: ["#3c3560", "#6a5c94", "#8b7bb0"], count: 500 },
      },
    ],
  },

  "clouds-above": {
    seed: 44,
    w: 2400,
    h: 1600,
    sky: ["#0c2f78", "#1d55b0", "#6aa0db", "#cfe3f3"],
    glow: { cx: 0.7, cy: 0.55, color: "#fff4dc", opacity: 0.7 },
    palette: { ...whiteClouds, cloudShade: "#a9b8d4" },
    layers: [
      {
        type: "clouds",
        items: [
          { cx: 2000, cy: 820, width: 640, height: 640, puffs: 26 },
          { cx: 380, cy: 860, width: 480, height: 420, puffs: 20 },
          { cx: 900, cy: 240, width: 360, height: 90, puffs: 8 },
        ],
      },
      {
        type: "mountain",
        points: [
          [980, 880],
          [1160, 720],
          [1280, 610],
          [1360, 548],
          [1410, 532],
          [1470, 566],
          [1590, 670],
          [1780, 880],
        ],
        base: 940,
        fill: ["#f6f8fc", "#c3cde0", "#7a8cae"],
        gullies: 46,
        gullyLength: 220,
        gullyColor: "#4a5c80",
        lightLeft: 0.35,
        darkRight: 0.3,
      },
      {
        type: "clouds",
        palette: { ...whiteClouds, cloudMid: "#f1ece2", cloudShade: "#c3cfe3" },
        filter: "mistl",
        opacity: 0.9,
        items: cloudBank({ seed: 5, y: 870, w: 2400, count: 8, width: 460, height: 120 }),
      },
      {
        type: "clouds",
        palette: { ...whiteClouds, cloudMid: "#f1ece2", cloudShade: "#b9c7de" },
        items: cloudBank({ seed: 6, y: 1060, w: 2400, count: 6, width: 620, height: 200 }),
      },
      {
        type: "clouds",
        palette: { ...whiteClouds, cloudShade: "#b3c2da" },
        items: cloudBank({ seed: 7, y: 1300, w: 2400, count: 5, width: 780, height: 290 }),
      },
      {
        type: "clouds",
        palette: { ...whiteClouds, cloudShade: "#abbbd6" },
        items: cloudBank({ seed: 8, y: 1620, w: 2400, count: 4, width: 980, height: 380 }),
      },
    ],
  },

  "falls-aerial": fallsAerial({
    seed: 91,
    sky: ["#174aa6", "#2f6cc2", "#7fb0de", "#d6e7f2"],
    glow: { cx: 0.55, cy: 0.3, color: "#fff6e0", opacity: 0.35 },
    clouds: whiteClouds,
    mist: {
      cloudTop: "#ffffff",
      cloudLight: "#ffffff",
      cloudMid: "#eef3f7",
      cloudShade: "#b8c8d6",
    },
    ground: {
      colors: ["#a9c0c0", "#7f9a6a", "#5f7f3e"],
      haze: "#c8dbe6",
      patchColors: ["#6f8f48", "#8aa25a", "#a1a865", "#56773a"],
      treeColor: "#3c5a2c",
      treeLight: "#8fb06a",
      trees: 2600,
      rim: ["#4f7f3c", "#2f5528"],
    },
    river: {
      colors: ["#c9dbe6", "#4d7f9c"],
      ripple: "#d9e8f0",
      rippleDark: "#3d6a86",
      island: "#3f6a34",
      islandLight: "#7fa85a",
      islandDark: "#2a4a24",
    },
    shadow: "#173434",
  }),

  "falls-golden": fallsAerial({
    seed: 92,
    sky: ["#3a5fa8", "#8aa3c9", "#f2c48f", "#f9dfb0"],
    glow: { cx: 0.75, cy: 0.32, color: "#ffe2a8", opacity: 0.9 },
    clouds: {
      cloudTop: "#fff4dc",
      cloudLight: "#fff8e8",
      cloudMid: "#f6d6a6",
      cloudShade: "#c4937a",
    },
    mist: {
      cloudTop: "#fff6e6",
      cloudLight: "#fffaf2",
      cloudMid: "#f7dfc4",
      cloudShade: "#c9a48e",
    },
    ground: {
      colors: ["#e3c9a0", "#a99a5c", "#7b7a3a"],
      haze: "#f2d7ae",
      patchColors: ["#9a8a4a", "#b8a45e", "#857a3a", "#6f7a3a"],
      treeColor: "#4e4a26",
      treeLight: "#d6b56c",
      trees: 2600,
      rim: ["#6b7a38", "#3f4a22"],
    },
    river: {
      colors: ["#f6d6a0", "#7d7f8c"],
      ripple: "#ffe6b8",
      rippleDark: "#5d6278",
      island: "#5a6230",
      islandLight: "#b9a85e",
      islandDark: "#3a3e1e",
    },
    shadow: "#3a2a1a",
  }),

  "falls-low-clouds": fallsAerial({
    seed: 93,
    sky: ["#123f98", "#2a66c0", "#78aade", "#d2e5f2"],
    glow: { cx: 0.5, cy: 0.4, color: "#fff6e0", opacity: 0.4 },
    clouds: { ...whiteClouds, cloudShade: "#a3b4cf" },
    mist: {
      cloudTop: "#ffffff",
      cloudLight: "#ffffff",
      cloudMid: "#eef3f7",
      cloudShade: "#b8c8d6",
    },
    ground: {
      colors: ["#a9c0c0", "#7a9868", "#56773a"],
      haze: "#c8dbe6",
      patchColors: ["#6f8f48", "#8aa25a", "#a1a865", "#56773a"],
      treeColor: "#3c5a2c",
      treeLight: "#8fb06a",
      trees: 2600,
      rim: ["#4f7f3c", "#2f5528"],
    },
    river: {
      colors: ["#c9dbe6", "#4d7f9c"],
      ripple: "#d9e8f0",
      rippleDark: "#3d6a86",
      island: "#3f6a34",
      islandLight: "#7fa85a",
      islandDark: "#2a4a24",
    },
    shadow: "#173434",
    low: true,
  }),

  "table-bay": tableBay({
    seed: 61,
    sky: ["#1a4fa0", "#2f6dc0", "#79aee0", "#cfe4f3"],
    glow: { cx: 0.3, cy: 0.55, color: "#fff4dc", opacity: 0.4 },
    clouds: whiteClouds,
    rock: ["#b4b6c0", "#8f97a8", "#6f8270", "#557552"],
    lion: ["#8a9ab0", "#728396", "#617a5f"],
    strata: { dark: "#4a5770", light: "#d0d8e4" },
    gully: "#3e4a60",
    scrub: { color: "#4f6e45", light: "#7d9a5f" },
    cloth: { color: "#ffffff", shade: "#b9c6d8", opacity: 0.95 },
    water: {
      colors: ["#8fb6d6", "#2e6c98"],
      light: "#d8eaf5",
      dark: "#285d84",
      glint: { x: 600, spread: 600, color: "#ffffff" },
      horizonLine: "#c6dbe9",
    },
    beach: { sand: ["#efe3c6", "#d9c49c"], wet: "#bfae8a" },
    fynbos: {
      fill: ["#5a6b3a", "#7d8a4e"],
      restioColors: ["#9c8a5a", "#6f7a3e", "#b39a62", "#7a5a3a"],
      shrubColors: ["#6f8550", "#88975e", "#5c7444"],
      shrubLight: "#c7d29a",
    },
  }),

  "table-sunset": tableBay({
    seed: 62,
    sky: ["#2c3e7a", "#8a6aa8", "#f19a7a", "#fcd29a"],
    glow: { cx: 0.62, cy: 0.62, color: "#ffe0a8", opacity: 0.95 },
    clouds: {
      cloudTop: "#ffe9d0",
      cloudLight: "#fff2e0",
      cloudMid: "#f7b49a",
      cloudShade: "#8a6a9e",
    },
    rock: ["#eaa47c", "#c07e6c", "#85626c", "#504e5c"],
    lion: ["#d99478", "#a8746c", "#5a4f5c"],
    strata: { dark: "#7a4a50", light: "#ffd2aa" },
    gully: "#5a3a48",
    scrub: { color: "#4a4448", light: "#8a6a5a" },
    cloth: { color: "#ffe6d2", shade: "#b88aa0", opacity: 0.92 },
    water: {
      colors: ["#f6b98e", "#4a4f7a"],
      light: "#ffd9b0",
      dark: "#3d3f6a",
      glint: { x: 1500, spread: 420, color: "#fff0c8" },
      horizonLine: "#ffd7a8",
    },
    beach: { sand: ["#e8c9a6", "#b9927a"], wet: "#9a7a6a" },
    fynbos: {
      fill: ["#3a3540", "#5a4a50"],
      restioColors: ["#7a5a4a", "#5a4a3a", "#9a6a4a"],
      shrubColors: ["#4f4a4a", "#5f5550", "#3f3f42"],
      shrubLight: "#e0a080",
      proteas: 26,
    },
  }),

  "table-fynbos": {
    seed: 63,
    w: 2400,
    h: 1600,
    sky: ["#1d58ad", "#3576c6", "#86b7e3", "#d4e7f4"],
    glow: { cx: 0.25, cy: 0.5, color: "#fff4dc", opacity: 0.45 },
    palette: whiteClouds,
    layers: [
      {
        type: "clouds",
        items: [
          { cx: 260, cy: 250, width: 520, height: 210, puffs: 16 },
          { cx: 2160, cy: 220, width: 560, height: 230, puffs: 18 },
          { cx: 1250, cy: 130, width: 360, height: 100, puffs: 9 },
        ],
      },
      {
        type: "mountain",
        points: scale(tableTop, 1.5, 1200, 1012, 1080),
        base: 1100,
        fill: ["#a8b4c6", "#8796ac", "#6c8070", "#4f7050"],
        strata: { gap: 20, depth: 320, dark: "#4a5770", light: "#d0d8e4" },
        gullies: 110,
        gullyLength: 290,
        gullyColor: "#3e4a60",
        scrub: { count: 2000, height: 0.55, size: 10, color: "#456a3e", light: "#7d9a5f" },
        rough: 5,
      },
      {
        type: "tablecloth",
        x0: 1200 + (775 - 1200) * 1.5,
        x1: 1200 + (1645 - 1200) * 1.5,
        top: 1080 - (1012 - 540) * 1.5,
        drop: 180,
        surface: scale(tableCloth, 1.5, 1200, 1012, 1080),
        color: "#ffffff",
        shade: "#b9c6d8",
        opacity: 0.95,
      },
      {
        type: "ridge",
        base: 1090,
        amp: 30,
        fill: ["#2f5a37", "#4a7a45"],
        trees: { color: "#264d2f", light: "#7fae62", size: 22, density: 0.9 },
      },
      {
        type: "fynbos",
        base: 1190,
        amp: 90,
        fill: ["#5a6b3a", "#7d8a4e"],
        proteas: 150,
        pincushion: 0.3,
        restios: 1400,
        shrubs: 380,
        restioColors: ["#9c8a5a", "#6f7a3e", "#b39a62", "#7a5a3a"],
        shrubColors: ["#6f8550", "#88975e", "#5c7444"],
        shrubLight: "#c7d29a",
      },
    ],
  },
});

function render(name, scene) {
  const { w, h } = scene;
  const rand = rng(scene.seed);
  const skyStops = scene.sky
    .map((c, i) => `<stop offset="${(i / (scene.sky.length - 1)).toFixed(2)}" stop-color="${c}"/>`)
    .join("");
  const clouds = (scene.clouds ?? [])
    .map((c, i) => cloudSvg(rand, `c${i}`, c, scene.palette))
    .join("");
  const hills = (scene.hills ?? [])
    .map((hl, i) => {
      const gid = `h${i}`;
      const opts = { w, h, base: hl.base, amp: hl.amp };
      const path = ridge(rng(scene.seed + i * 13), opts);
      const pts = ridgePoints(rng(scene.seed + i * 13), opts);
      const grad = `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hl.fill[1]}"/><stop offset="1" stop-color="${hl.fill[0]}"/></linearGradient>`;
      const tree = hl.trees ? `<g filter="url(#brush)">${trees(rand, pts, hl.trees)}</g>` : "";
      const meadow = hl.meadow
        ? `<g filter="url(#brush)">${grassStrokes(rand, {
            w,
            h,
            top: hl.base - hl.amp,
            count: 900,
            colors: [hl.fill[0], hl.fill[1], "#5c8a36", "#c8dc7c"],
          })}${scene.flowers ? flowers(rand, { w, h, top: hl.base, count: 420, colors: scene.flowers }) : ""}</g>`
        : "";
      return `${grad}${tree}<path d="${path}" fill="url(#${gid})" filter="url(#${hl.filter ?? "brush"})"/>${meadow}`;
    })
    .join("");
  const g = scene.glow;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>${defs(w, h)}
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${skyStops}</linearGradient>
    <radialGradient id="puff" cx="0.42" cy="0.38" r="0.62" fx="0.36" fy="0.3"><stop offset="0" stop-color="${scene.palette.cloudTop}"/><stop offset="0.5" stop-color="${scene.palette.cloudMid}"/><stop offset="0.85" stop-color="${scene.palette.cloudShade}"/><stop offset="1" stop-color="${scene.palette.cloudShade}"/></radialGradient>
    <radialGradient id="glow" cx="${g.cx}" cy="${g.cy}" r="0.6"><stop offset="0" stop-color="${g.color}" stop-opacity="${g.opacity}"/><stop offset="1" stop-color="${g.color}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <use href="#full" filter="url(#canvas)" opacity="0.5"/>
  ${clouds}
  ${scene.falls ? fallsSvg(rand, scene) : ""}
  ${(scene.layers ?? []).map((l, i) => LAYERS[l.type](rand, scene, l, `L${i}`)).join("")}
  ${hills}
  ${(scene.canopies ?? []).map((c) => canopy(rand, c)).join("")}
  <use href="#full" filter="url(#grain)" opacity="0.22"/>
</svg>`;
}

await mkdir(outDir, { recursive: true });
const only = process.argv.slice(2);
for (const [name, scene] of Object.entries(scenes)) {
  if (only.length && !only.includes(name)) {
    continue;
  }
  const svg = render(name, scene);
  if (process.env.SVG_OUT) {
    await writeFile(join(process.env.SVG_OUT, `${name}.svg`), svg);
  }
  await sharp(Buffer.from(svg))
    .extract({ left: 0, top: 0, width: scene.w, height: scene.h - 28 })
    .webp({ quality: 82 })
    .toFile(join(outDir, `${name}.webp`));
  const { width, height } = await sharp(join(outDir, `${name}.webp`)).metadata();
  console.log(`${name}.webp ${width}x${height}`);
}

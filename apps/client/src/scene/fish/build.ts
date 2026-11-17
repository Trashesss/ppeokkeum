import { BufferAttribute, BufferGeometry, Color } from 'three';
import type { FinSpec, FishShape } from './shapes';

/**
 * 체형 명세 → 저폴리 메시 (플랫 셰이딩, 면마다 한 색).
 * 좌표: 길이 1, 주둥이가 +z, 등이 +y. 꼬리지느러미까지 포함해 z ∈ [-0.5, 0.5].
 */

const SEG = 8;
function ringStops(n: number): number[] {
  // 머리 쪽을 조금 더 촘촘하게, 마지막은 주둥이 끝
  const out = Array.from({ length: n - 1 }, (_, i) => 0.97 * Math.pow(i / (n - 2), 0.92));
  out.push(1);
  return out;
}

type V = [number, number, number];

class Builder {
  pos: number[] = [];
  col: number[] = [];
  tri(a: V, b: V, c: V, color: Color) {
    this.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) this.col.push(color.r, color.g, color.b);
  }
  quad(a: V, b: V, c: V, d: V, color: Color) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function profile(s: FishShape, t: number): number {
  if (t <= s.peak) return s.stalk + (1 - s.stalk) * Math.sin(((t / s.peak) * Math.PI) / 2);
  return Math.pow(Math.max(0, Math.cos((((t - s.peak) / (1 - s.peak)) * Math.PI) / 2)), s.snout);
}

export function buildFishGeometry(s: FishShape): BufferGeometry {
  return s.kind === 'ray' ? buildRay(s) : buildFish(s);
}

function buildFish(s: FishShape): BufferGeometry {
  const b = new Builder();
  const back = new Color(s.colors.back);
  const belly = new Color(s.colors.belly);
  const fin = new Color(s.colors.fin);
  const pat = new Color(s.pattern?.color ?? s.colors.back);
  const c = new Color();

  const z0 = -0.5 + s.tail.length;
  const zAt = (t: number) => z0 + t * (0.5 - z0);
  const top = (t: number) => s.height * profile(s, t);
  const bot = (t: number) => top(t) * s.bellyRatio;
  const wid = (t: number) => s.width * profile(s, t) * (1 + (s.headWiden ?? 0) * smooth(0.55, 0.95, t));

  const ring = (t: number): V[] =>
    Array.from({ length: SEG }, (_, k) => {
      const a = (k / SEG) * Math.PI * 2;
      const sy = Math.sin(a);
      return [wid(t) * Math.cos(a), sy * (sy >= 0 ? top(t) : bot(t)), zAt(t)] as V;
    });

  const faceColor = (t: number, rel: number, id: number, k: number) => {
    // rel: 1 = 등 꼭대기, -1 = 배 바닥
    c.copy(belly).lerp(back, smooth(-0.45, 0.1, rel));
    const p = s.pattern;
    if (p && rel > -0.25) {
      const d = p.density ?? 1;
      if (p.kind === 'stripes' && rel > 0.1 && Math.sin(t * 46 * d + Math.sin(k * 1.9) * 2.4) > 0.15) c.copy(pat);
      else if (p.kind === 'spots' && hash(id) < 0.2 * d) c.copy(pat);
      else if (p.kind === 'bars' && Math.sin(t * Math.PI * 7 * d) > 0.45) c.lerp(pat, 0.75);
      else if (p.kind === 'mottle' && hash(id) < 0.35) c.lerp(pat, 0.55);
      else if (p.kind === 'scales' && (id + Math.floor(t * 12)) % 2 === 0) c.lerp(pat, 0.25);
    }
    return c.multiplyScalar(0.95 + hash(id * 3.7) * 0.1);
  };

  // 몸통
  const stops = ringStops(s.rings ?? 12);
  const rings = stops.map(ring);
  let id = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    const tm = (stops[i]! + stops[i + 1]!) / 2;
    for (let k = 0; k < SEG; k++) {
      const k2 = (k + 1) % SEG;
      const rel = Math.sin(((k + 0.5) / SEG) * Math.PI * 2);
      const col = faceColor(tm, rel, id++, k);
      b.quad(rings[i]![k]!, rings[i + 1]![k]!, rings[i + 1]![k2]!, rings[i]![k2]!, col);
    }
  }
  // 꼬리자루 마감
  const capC: V = [0, 0, zAt(0)];
  for (let k = 0; k < SEG; k++) b.tri(capC, rings[0]![(k + 1) % SEG]!, rings[0]![k]!, fin);

  // 눈: 흰자 + 동공
  const te = 0.88;
  const ex = wid(te) * 0.9;
  const ey = top(te) * 0.3;
  const er = Math.max(0.022, s.height * 0.14);
  for (const side of [-1, 1]) {
    octa(b, [side * ex, ey, zAt(te)], er, new Color('#f4f1e8'));
    octa(b, [side * (ex + er * 0.55), ey, zAt(te) + er * 0.15], er * 0.62, new Color('#1b1918'));
  }

  // 꼬리지느러미 (x=0 평면)
  const L = s.tail.length;
  const S = s.tail.spread;
  const st = top(0);
  const sb = -bot(0);
  const zc = zAt(0);
  if (s.tail.kind === 'fork') {
    const tipT: V = [0, S, zc - L];
    const tipB: V = [0, -S, zc - L];
    const notch: V = [0, 0, zc - L * 0.45];
    const ctr: V = [0, 0, zc];
    b.tri([0, st, zc], tipT, ctr, fin);
    b.tri(ctr, tipT, notch, fin);
    b.tri(ctr, notch, tipB, fin);
    b.tri(ctr, tipB, [0, sb, zc], fin);
  } else {
    const n = 5;
    const ctr: V = [0, 0, zc];
    let prev: V = [0, st, zc];
    for (let i = 0; i <= n; i++) {
      const a = Math.PI / 2 - (i / n) * Math.PI;
      const r = s.tail.kind === 'round' ? L : L / Math.max(0.35, Math.cos(a));
      const p: V = [0, Math.sin(a) * Math.max(S, st * 1.2), zc - Math.min(L, Math.cos(a) * r + L * 0.25)];
      b.tri(ctr, prev, p, fin);
      prev = p;
    }
    b.tri(ctr, prev, [0, sb, zc], fin);
  }

  // 등·뒷·기름 지느러미
  const finAlong = (f: FinSpec, dir: 1 | -1) => {
    const edge = (t: number) => (dir === 1 ? top(t) : -bot(t));
    const lead = f.to - (f.to - f.from) * 0.22;
    const bFrom: V = [0, edge(f.from) * 0.97, zAt(f.from)];
    const bTo: V = [0, edge(f.to) * 0.97, zAt(f.to)];
    const tip: V = [0, edge(lead) + dir * f.height, zAt(lead) - f.height * 0.25];
    const trail: V = [0, edge(f.from) + dir * f.height * 0.3, zAt(f.from) - f.height * 0.35];
    b.tri(bFrom, bTo, tip, fin);
    b.tri(bFrom, tip, trail, fin);
  };
  for (const d of s.dorsal) finAlong(d, 1);
  if (s.anal) finAlong(s.anal, -1);
  if (s.adipose) finAlong({ from: 0.12, to: 0.18, height: 0.03 }, 1);

  // 가슴지느러미
  if (s.pectoral) {
    const t = 0.76;
    const P = s.pectoral;
    for (const side of [-1, 1]) {
      const base: V = [side * wid(t) * 0.85, -bot(t) * 0.35, zAt(t)];
      b.tri(base, [side * (wid(t) + P * 0.55), -bot(t) * 0.75, zAt(t) - P], [side * wid(t) * 0.8, -bot(t) * 0.55, zAt(t) - P * 0.55], fin);
    }
  }

  // 수염 (얇은 띠)
  if (s.whiskers) {
    const W = s.whiskers;
    const zs = zAt(0.97);
    const dark = new Color(s.colors.fin).multiplyScalar(0.8);
    for (const side of [-1, 1]) {
      for (const [len, drop] of [[W, 0.25], [W * 0.45, 0.9]] as const) {
        const a: V = [side * wid(0.97) * 0.6, -0.005, zs];
        const e: V = [side * (wid(0.97) * 0.6 + len * 0.7), -len * drop * 0.45, zs - len * 0.55];
        const m: V = [(a[0] + e[0]) / 2, (a[1] + e[1]) / 2 + 0.015, (a[2] + e[2]) / 2];
        b.quad(a, m, [m[0], m[1] - 0.012, m[2]], [a[0], a[1] - 0.012, a[2]], dark);
        b.quad(m, e, [e[0], e[1] - 0.006, e[2]], [m[0], m[1] - 0.012, m[2]], dark);
      }
    }
  }
  return b.geometry();
}

function octa(b: Builder, [x, y, z]: V, r: number, color: Color) {
  const px: V = [x + r, y, z], nx: V = [x - r, y, z], py: V = [x, y + r, z], ny: V = [x, y - r, z], pz: V = [x, y, z + r], nz: V = [x, y, z - r];
  b.tri(py, pz, px, color); b.tri(py, nx, pz, color); b.tri(py, nz, nx, color); b.tri(py, px, nz, color);
  b.tri(ny, px, pz, color); b.tri(ny, pz, nx, color); b.tri(ny, nx, nz, color); b.tri(ny, nz, px, color);
}

function buildRay(s: FishShape): BufferGeometry {
  const b = new Builder();
  const back = new Color(s.colors.back);
  const belly = new Color(s.colors.belly);
  const pat = new Color(s.pattern?.color ?? s.colors.back);
  const W = s.width;
  const outline: V[] = [
    [0, 0, 0.42], [0.18, 0, 0.36], [0.36, 0, 0.22], [W, 0, 0.04], [0.42, 0, -0.08], [0.24, 0, -0.2], [0.08, 0, -0.26],
    [-0.08, 0, -0.26], [-0.24, 0, -0.2], [-0.42, 0, -0.08], [-W, 0, 0.04], [-0.36, 0, 0.22], [-0.18, 0, 0.36],
  ];
  const topC: V = [0, s.height, 0.06];
  const botC: V = [0, -s.height * s.bellyRatio, 0.06];
  const c = new Color();
  outline.forEach((p, i) => {
    const q = outline[(i + 1) % outline.length]!;
    const mid: V = [(p[0] + q[0]) * 0.55, s.height * 0.45, (p[2] + q[2]) * 0.55 + 0.03];
    c.copy(back);
    b.tri(topC, mid, p, hash(i) < 0.3 ? pat : c);
    b.tri(topC, q, mid, hash(i + 40) < 0.3 ? pat : c);
    b.tri(mid, q, p, c.copy(back).multiplyScalar(0.9));
    b.tri(botC, p, q, belly);
  });
  for (const side of [-1, 1]) octa(b, [side * 0.09, s.height * 0.85, 0.24], 0.025, new Color('#1b1918'));
  // 꼬리
  const tl = s.tail.length;
  b.quad([0.012, 0.01, -0.26], [0.004, 0.01, -0.26 - tl], [-0.004, 0.01, -0.26 - tl], [-0.012, 0.01, -0.26], back);
  return b.geometry();
}

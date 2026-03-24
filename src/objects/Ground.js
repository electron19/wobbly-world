import * as THREE from 'three';
import { WorldObject } from './WorldObject.js';
import { toonMat, toonGrad, C } from '../core/Materials.js';
import { ROADS, ROAD_CLEAR } from '../world/zones.js';

/** Wysokość krawężnika — używana też przez WorldBuilder do ustawiania obiektów. */
export const SIDEWALK_H = 0.10;

/**
 * Zwraca wysokość podłoża (y) dla danej pozycji XZ.
 * Chodnik: |x| ∈ (3, 4.5] lub |z| ∈ (3, 4.5].
 */
export function getSidewalkHeight(x, z) {
  const onNS = Math.abs(x) >= 3 && Math.abs(x) <= 4.5;
  const onEW = Math.abs(z) >= 3 && Math.abs(z) <= 4.5;
  return (onNS || onEW) ? SIDEWALK_H : 0;
}

/**
 * Teren: trawa + siatka dróg + chodniki + fizyczna podłoga.
 */
export class Ground extends WorldObject {
  constructor(scene, physics, vehiclePhysics = null, size = 200) {
    super(scene, physics, vehiclePhysics);
    this._build(size);
  }

  // ─── Proceduralny generator tekstur ─────────────────────────────────────────

  /**
   * Tworzy canvas z 1 kaflem chodnikowym (duże betonowe płyty USA-style).
   * Repeat ustawiany per-mesh przez _texFor z tileSize = SW (1.5 jedn.).
   */
  _makeSidewalkCanvas(size = 128) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Płyta: jasno-szara prawie biała z ciepłym odcieniem
    ctx.fillStyle = '#E0DCCE';
    ctx.fillRect(0, 0, size, size);

    // Spoina — 3px ciemniejsza linia wokół krawędzi kafla
    const gap = 4;
    ctx.strokeStyle = '#BCBAB0';
    ctx.lineWidth = gap;
    ctx.strokeRect(gap / 2, gap / 2, size - gap, size - gap);

    // Subtelny szum betonu — losowe jaśniejsze/ciemniejsze piksele
    const img = ctx.getImageData(0, 0, size, size);
    const d   = img.data;
    const rng = mulberry32(0xC0FFEE11);
    for (let i = 0; i < d.length; i += 4) {
      const n = (rng() - 0.5) * 18;
      d[i]   = Math.min(255, Math.max(0, d[i]   + n));
      d[i+1] = Math.min(255, Math.max(0, d[i+1] + n));
      d[i+2] = Math.min(255, Math.max(0, d[i+2] + n));
    }
    ctx.putImageData(img, 0, 0);

    return canvas;
  }

  /** Tworzy canvas źródłowy trawy (bez repeat — ustawiany per-mesh). */
  _makeGrassCanvas(size = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#5a9e35';
    ctx.fillRect(0, 0, size, size);
    const rng = mulberry32(0xABCD1234);
    for (let i = 0; i < 500; i++) {
      const x = rng() * size;
      const y = rng() * size;
      ctx.fillStyle = rng() < 0.35 ? 'rgba(0,0,0,0.50)' : 'rgba(20,55,5,0.45)';
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + rng() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas;
  }

  /** Tworzy canvas źródłowy asfaltu (bez repeat — ustawiany per-mesh). */
  _makeRoadCanvas(size = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, size, size);
    const rng = mulberry32(0x9F3B7A12);
    for (let i = 0; i < 350; i++) {
      const x = rng() * size;
      const y = rng() * size;
      ctx.fillStyle = `rgba(0,0,0,${0.30 + rng() * 0.25})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + rng() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas;
  }

  /** Tworzy teksturę z canvas z odpowiednim repeat dla podanej geometrii. */
  _texFor(canvas, worldW, worldD, tileSize) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(worldW / tileSize, worldD / tileSize);
    return tex;
  }

  _build(s) {
    const grassCanvas = this._makeGrassCanvas();
    const roadCanvas  = this._makeRoadCanvas();
    const swCanvas    = this._makeSidewalkCanvas();

    // ─── Trawa ───────────────────────────────────────────────────────────────
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(s, s),
      new THREE.MeshToonMaterial({
        map: this._texFor(grassCanvas, s, s, 10),
        gradientMap: toonGrad,
      }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    this.root.add(grass);

    // ─── Chodniki — paski boczne z przerwami na każdym skrzyżowaniu ──────────
    const SW_H = 0.10;
    const SW   = 1.5;
    const BW   = 3.75;   // środek paska (3 + SW/2)
    const EX   = 4.5;    // krawędź głównego skrzyżowania

    const addSW = (cx, cz, w, d) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, SW_H, d),
        new THREE.MeshToonMaterial({
          map: this._texFor(swCanvas, w, d, SW),
          gradientMap: toonGrad,
        }),
      );
      m.position.set(cx, SW_H / 2, cz);
      m.receiveShadow = m.castShadow = true;
      this.root.add(m);
      this._bodies.push(
        this.physics.addStaticBox(cx, SW_H / 2, cz, w / 2, SW_H / 2, d / 2)
      );
      if (this.vehiclePhysics) {
        this.vehiclePhysics.addStaticBox(cx, SW_H / 2, cz, w / 2, SW_H / 2, d / 2, 'ground');
      }
    };

    /** Podziel [from, to] wycinając podane przedziały cuts. */
    const splitSegs = (from, to, cuts) => {
      const sorted = [...cuts].sort((a, b) => a[0] - b[0]);
      const segs = [];
      let pos = from;
      for (const [cMin, cMax] of sorted) {
        if (cMin > pos) segs.push([pos, Math.min(cMin, to)]);
        pos = Math.max(pos, cMax);
        if (pos >= to) break;
      }
      if (pos < to) segs.push([pos, to]);
      return segs;
    };

    // Cięcia z dróg E-W (dla pasków N-S) i N-S (dla pasków E-W)
    const ewCuts = ROADS.filter(r => r.axis === 'z')
      .map(r => [r.center - ROAD_CLEAR, r.center + ROAD_CLEAR]);
    const nsCuts = ROADS.filter(r => r.axis === 'x')
      .map(r => [r.center - ROAD_CLEAR, r.center + ROAD_CLEAR]);

    // 4 rogi głównego skrzyżowania (x=0, z=0)
    [-BW, BW].forEach(cx => [-BW, BW].forEach(cz => addSW(cx, cz, SW, SW)));

    // Paski N-S (x=±BW, wzdłuż Z) — segmenty z przerwami przy drogach E-W
    [-BW, BW].forEach(cx => {
      for (const [s0, s1] of splitSegs( EX,  s / 2, ewCuts)) addSW(cx, (s0+s1)/2, SW, s1-s0);
      for (const [s0, s1] of splitSegs(-s/2, -EX,  ewCuts)) addSW(cx, (s0+s1)/2, SW, s1-s0);
    });

    // Paski E-W (z=±BW, wzdłuż X) — segmenty z przerwami przy drogach N-S
    [-BW, BW].forEach(cz => {
      for (const [s0, s1] of splitSegs( EX,  s / 2, nsCuts)) addSW((s0+s1)/2, cz, s1-s0, SW);
      for (const [s0, s1] of splitSegs(-s/2, -EX,  nsCuts)) addSW((s0+s1)/2, cz, s1-s0, SW);
    });

    // ─── Drogi ───────────────────────────────────────────────────────────────
    [[0, 0, s, 6], [0, 0, 6, s]].forEach(([x, z, w, d]) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshToonMaterial({
          map: this._texFor(roadCanvas, w, d, 3),
          gradientMap: toonGrad,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.01, z);
      m.receiveShadow = true;
      this.root.add(m);
    });

    // ─── Przerywana linia środkowa ─────────────────────────────────────────
    const lineMat = toonMat(0xFFFFCC);
    for (let i = -4; i <= 4; i++) {
      if (Math.abs(i) < 0.5) continue;
      [[i * 10, 0, 0.25, 5], [0, i * 10, 5, 0.25]].forEach(([x, z, w, d]) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, 0.012, z);
        this.root.add(m);
      });
    }

    // ─── Fizyczna podłoga (gruba warstwa poniżej y=0) ─────────────────────
    this._bodies.push(
      this.physics.addStaticBox(0, -0.5, 0, s / 2, 0.5, s / 2)
    );
  }
}

// ─── Shared factory — chodnik jako betonowe płyty USA-style ─────────────────
/** Jeden kafel chodnikowy (128×128 px). Wynik można cachować i reużywać. */
export function makeSidewalkCanvas(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#E0DCCE';
  ctx.fillRect(0, 0, size, size);
  const gap = 4;
  ctx.strokeStyle = '#BCBAB0';
  ctx.lineWidth = gap;
  ctx.strokeRect(gap / 2, gap / 2, size - gap, size - gap);
  const img = ctx.getImageData(0, 0, size, size);
  const d   = img.data;
  const rng = mulberry32(0xC0FFEE11);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * 18;
    d[i]   = Math.min(255, Math.max(0, d[i]   + n));
    d[i+1] = Math.min(255, Math.max(0, d[i+1] + n));
    d[i+2] = Math.min(255, Math.max(0, d[i+2] + n));
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Tworzy MeshToonMaterial z teksturą chodnika dopasowaną do podanego wymiaru.
 * @param {HTMLCanvasElement} canvas  wynik makeSidewalkCanvas()
 * @param {number} w   szerokość siatki w jednostkach Three.js
 * @param {number} d   głębokość siatki w jednostkach Three.js
 * @param {number} tileSize  rozmiar kafla w jednostkach (default 1.5)
 */
export function makeSidewalkMat(canvas, w, d, tileSize = 1.5) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(w / tileSize, d / tileSize);
  return new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGrad });
}

// ─── Szybki deterministyczny PRNG (mulberry32) ───────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

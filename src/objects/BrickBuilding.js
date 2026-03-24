import * as THREE from 'three';
import { Building }            from './Building.js';
import { toonMat, addOutline } from '../core/Materials.js';

/**
 * Kamienica z cegły — styl amerykański XIX w. (brownstone / rowhouse).
 *
 * 3–5 pięter, czerwona lub brązowa cegła, kamienne obramowania okien,
 * gzyms wieńczący, stoop (zewnętrzne schody wejściowe), łukowe okna.
 *
 * Parametry cfg:
 *   floors      — liczba pięter (3..5, domyślnie 4)
 *   brickColor  — kolor cegły (domyślnie ciemnoczerwony)
 *   stoneColor  — kolor kamienia/piaskowca (obramowania, gzyms)
 *   trimColor   — kolor drzwi / elementów drewnianych
 *   facing      — obrót Y (radiany)
 */
export class BrickBuilding extends Building {
  constructor(scene, physics, cfg = {}, vehiclePhysics = null) {
    const floors = cfg.floors ?? 4;
    super(scene, physics, {
      w:          9,
      d:          12,
      h:          floors * 3.5,
      floors,
      brickColor: 0x8B3A2A,
      stoneColor: 0xD4C5A9,
      trimColor:  0x2C4A2A,
      facing:     0,
      ...cfg,
    }, vehiclePhysics);
  }

  _buildGeometry() {
    const { w, d, h, floors, brickColor, stoneColor, trimColor, facing } = this.cfg;
    const floorH = h / floors;

    const brickMat  = toonMat(brickColor);
    const stoneMat  = toonMat(stoneColor);
    const trimMat   = toonMat(trimColor);
    const glassMat  = new THREE.MeshToonMaterial({
      color: 0x4A6A8A, transparent: true, opacity: 0.82,
    });

    this.root.rotation.y = facing;

    // ── Główna bryła ─────────────────────────────────────────────────────────
    this._box(0, h / 2, 0, w, h, d, brickMat);

    // ── Gzyms wieńczący i parapet ────────────────────────────────────────────
    this._box(0, h + 0.30, 0, w + 0.60, 0.60, d + 0.60, stoneMat);
    this._box(0, h + 0.85, 0, w + 0.40, 0.50, d + 0.40, brickMat);

    // ── Pasy kamienne na styku pięter ────────────────────────────────────────
    for (let f = 1; f < floors; f++) {
      this._box(0, f * floorH + 0.12, 0, w + 0.22, 0.24, d + 0.22, stoneMat);
    }

    // ── Okna — front i tył ───────────────────────────────────────────────────
    const winW  = 1.40;
    const winH  = floorH * 0.56;
    const nWins = 3;  // okna na piętro (na front / tył)
    const wStep = w / (nWins + 1);

    [d / 2, -d / 2].forEach(fz => {
      const sign = fz > 0 ? 1 : -1;
      for (let f = 0; f < floors; f++) {
        const wy = f * floorH + floorH * 0.55;
        for (let wi = 1; wi <= nWins; wi++) {
          const wx = -w / 2 + wStep * wi;
          // Kamienna rama
          this._box(wx, wy,                fz + sign * 0.07, winW + 0.22, winH + 0.28, 0.14, stoneMat);
          // Szkło okna
          this._box(wx, wy,                fz + sign * 0.12, winW, winH, 0.06, glassMat);
          // Łukowy klucz (klucz arkady — szerszy blok nad oknem)
          this._box(wx, wy + winH * 0.56,  fz + sign * 0.08, winW + 0.24, 0.28, 0.16, stoneMat);
          // Parapet okienny (gzyms dolny)
          this._box(wx, wy - winH * 0.56,  fz + sign * 0.10, winW + 0.32, 0.14, 0.20, stoneMat);
        }
      }
    });

    // ── Okna boczne (prostsza forma) ─────────────────────────────────────────
    const nSide = Math.floor(d / 3.6);
    const sStep = d / (nSide + 1);
    [-w / 2, w / 2].forEach(fx => {
      const sign = fx > 0 ? 1 : -1;
      for (let f = 0; f < floors; f++) {
        const wy = f * floorH + floorH * 0.55;
        for (let si = 1; si <= nSide; si++) {
          const wz = -d / 2 + sStep * si;
          this._box(fx + sign * 0.07, wy, wz, 0.14, winH + 0.22, winW + 0.18, stoneMat);
          this._box(fx + sign * 0.12, wy, wz, 0.06, winH,         winW,        glassMat);
        }
      }
    });

    // ── Stoop — zewnętrzne schody wejściowe ──────────────────────────────────
    const stoopW = 3.0;
    // Podest
    this._box(0, 0.50, d / 2 + 1.00, stoopW, 1.00, 1.80, stoneMat);
    // Stopień 1
    this._box(0, 0.18, d / 2 + 1.95, stoopW + 0.30, 0.36, 0.55, stoneMat);
    // Stopień 2
    this._box(0, 0.06, d / 2 + 2.55, stoopW + 0.50, 0.12, 0.55, stoneMat);

    // ── Drzwi wejściowe ───────────────────────────────────────────────────────
    const doorH = floorH * 0.75;
    const doorW = 2.20;
    this._box(0, doorH / 2, d / 2 + 0.08, doorW, doorH, 0.12, trimMat);
    this._box(0, doorH / 2, d / 2 + 0.14, doorW - 0.30, doorH - 0.22, 0.06, glassMat);
    // Łukowy nadproże
    this._box(0, doorH - 0.08, d / 2 + 0.09, doorW + 0.26, 0.36, 0.14, stoneMat);

    // ── Poręcze stoopa ───────────────────────────────────────────────────────
    [-1, 1].forEach(s => {
      this._box(s * stoopW / 2, 0.85, d / 2 + 0.60, 0.12, 0.70, 1.90, stoneMat);
    });
  }

  _buildColliders(wx, wy, wz) {
    const { w, h, d } = this.cfg;
    this._addPhysicsBox(wx, wy + (h + 0.9) / 2, wz, w / 2, (h + 0.9) / 2, d / 2);
  }
}

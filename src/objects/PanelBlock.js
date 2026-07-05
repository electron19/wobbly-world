import * as THREE from 'three';
import { Building }            from './Building.js';
import { toonMat } from '../core/Materials.js';

/**
 * Polish prefab panel block ("wielka płyta") — 1970s–80s estate housing.
 *
 * Characteristic features:
 *   - Flat roof with concrete parapet
 *   - Uniform window grid per floor (front + back facades)
 *   - Small concrete balconies (front facade, every ~5 m apartment bay)
 *   - Stairwell towers projecting slightly every ~15 m along the length
 *   - Horizontal spandrel strips between floors
 *   - Ground floor slightly taller (shops / service)
 *
 * Parameters (cfg):
 *   w       — building length (long axis X)   default 50
 *   d       — building depth (short axis Z)   default 14
 *   floors  — number of storeys               default 4
 *   variant — colour scheme index 0-3         default 0
 *   facing  — rotation.y                      default 0
 */
export class PanelBlock extends Building {
  constructor(scene, physics, cfg = {}, vehiclePhysics = null) {
    super(scene, physics, {
      w:       50,
      d:       14,
      floors:   4,
      variant:  0,
      facing:   0,
      ...cfg,
    }, vehiclePhysics);
  }

  _buildGeometry() {
    const { w, d, floors, variant, facing } = this.cfg;

    // ── Colour palettes ──────────────────────────────────────────────────────────
    const PALETTES = [
      { body: 0xC4C0B4, spandrel: 0xA8A49A, accent: 0x7A8A6A, glass: 0x6A8EA8, balcony: 0xB0ACA4 },  // gray-green
      { body: 0xD0C9BC, spandrel: 0xAFA9A0, accent: 0x8A6A4A, glass: 0x5A7A8A, balcony: 0xBBB5AC },  // beige-brown
      { body: 0xBCBAB2, spandrel: 0xA0A09A, accent: 0x5A6A8A, glass: 0x4A6A7A, balcony: 0xACAAAA },  // blue-gray
      { body: 0xC8C4B8, spandrel: 0xABAA9E, accent: 0x8A5A4A, glass: 0x5A7A6A, balcony: 0xB5B2A8 },  // rust accent
    ];
    const pal = PALETTES[variant % PALETTES.length];

    const bodyMat     = toonMat(pal.body);
    const spandrelMat = toonMat(pal.spandrel);
    const accentMat   = toonMat(pal.accent);
    const balconyMat  = toonMat(pal.balcony);
    const glassMat    = new THREE.MeshToonMaterial({
      color: pal.glass, transparent: true, opacity: 0.75,
    });

    this.root.rotation.y = facing;

    // ── Dimensions ────────────────────────────────────────────────────────────────
    const groundH = 3.8;   // ground floor (service / entry)
    const floorH  = 3.2;   // upper floors
    const totalH  = groundH + floors * floorH;

    this.cfg.h = totalH;   // expose for _buildColliders

    // ── Main body ────────────────────────────────────────────────────────────────
    this._box(0, totalH / 2, 0, w, totalH, d, bodyMat);

    // ── Flat roof parapet ─────────────────────────────────────────────────────────
    this._box(0, totalH + 0.25, 0, w + 0.40, 0.50, d + 0.40, spandrelMat);
    this._box(0, totalH + 0.65, 0, w + 0.20, 0.35, d + 0.20, bodyMat);

    // ── Horizontal spandrel strips between floors ────────────────────────────────
    // Between ground and floor 1:
    this._box(0, groundH + 0.10, 0, w + 0.10, 0.22, d + 0.10, spandrelMat);
    for (let f = 1; f < floors; f++) {
      const sy = groundH + f * floorH + 0.10;
      this._box(0, sy, 0, w + 0.10, 0.20, d + 0.10, spandrelMat);
    }

    // ── Window grid — front (+Z) and back (-Z) ───────────────────────────────────
    const winW  = 1.20;
    const winH  = floorH * 0.52;
    const bayW  = 4.80;          // apartment bay width (~5 m)
    const nBays = Math.max(1, Math.round(w / bayW));
    const actualBayW = w / nBays;

    // Ground-floor windows (narrower, taller service windows)
    const gwH = groundH * 0.55;
    const gwW = winW * 0.90;
    for (let b = 0; b < nBays; b++) {
      const bx = -w / 2 + actualBayW * (b + 0.5);
      [d / 2 + 0.05, -(d / 2 + 0.05)].forEach(gz => {
        this._box(bx, groundH * 0.55, gz, gwW, gwH, 0.07, glassMat);
      });
    }

    // Upper floor windows
    for (let f = 0; f < floors; f++) {
      const wy = groundH + f * floorH + floorH * 0.52;
      for (let b = 0; b < nBays; b++) {
        const bx = -w / 2 + actualBayW * (b + 0.5);
        // Front and back window panes
        [d / 2 + 0.05, -(d / 2 + 0.05)].forEach(gz => {
          this._box(bx, wy, gz, winW, winH, 0.07, glassMat);
        });
      }
    }

    // ── Balconies — front facade (+Z side), upper floors only ────────────────────
    const balconyD   = 1.30;
    const balconyH   = 0.15;
    const railH      = 0.80;

    for (let f = 0; f < floors; f++) {
      const by = groundH + f * floorH + 0.08;
      for (let b = 0; b < nBays; b++) {
        const bx = -w / 2 + actualBayW * (b + 0.5);
        // Balcony slab
        this._box(bx, by + balconyH / 2, d / 2 + balconyD / 2,
                  actualBayW * 0.80, balconyH, balconyD, balconyMat);
        // Balcony railing (top bar)
        this._box(bx, by + railH, d / 2 + balconyD - 0.06,
                  actualBayW * 0.80, 0.10, 0.06, spandrelMat);
        // Railing side panels (vertical slabs)
        [-actualBayW * 0.40, actualBayW * 0.40].forEach(sx => {
          this._box(bx + sx, by + railH / 2, d / 2 + balconyD / 2,
                    0.07, railH, balconyD, spandrelMat);
        });
      }
    }

    // ── Stairwell towers — slightly protruding, every ~15 m ──────────────────────
    const stairInterval = 15.0;
    const nStairs = Math.max(1, Math.round(w / stairInterval));
    const stairSpacing  = w / nStairs;
    const stairW  = 4.0;
    const stairD  = 1.8;
    const stairH  = totalH + 0.8;  // stairwells rise above roofline

    for (let s = 0; s < nStairs; s++) {
      const sx = -w / 2 + stairSpacing * (s + 0.5);
      // Protrusion on back face only (stairwells on back side = typical)
      this._box(sx, stairH / 2, -(d / 2 + stairD / 2), stairW, stairH, stairD, bodyMat);
      // Small stairwell window strip per floor
      for (let f = 0; f <= floors; f++) {
        const swy = (f === 0 ? groundH * 0.5 : groundH + (f - 0.5) * floorH);
        this._box(sx, swy, -(d / 2 + stairD + 0.05),
                  stairW * 0.55, floorH * 0.40, 0.07, glassMat);
      }
      // Stairwell top cap
      this._box(sx, stairH + 0.20, -(d / 2 + stairD / 2),
                stairW + 0.20, 0.40, stairD + 0.20, accentMat);
    }

    // ── Accent colour band on front facade (mid-height decorative strip) ─────────
    const accentY = groundH + Math.floor(floors / 2) * floorH - 0.30;
    this._box(0, accentY, d / 2 + 0.06, w, 0.55, 0.06, accentMat);

    // ── Entry portico — centred on front facade ───────────────────────────────────
    const portW  = Math.min(actualBayW * 2, 8);
    const portH  = groundH + 0.20;
    const portD  = 1.60;
    const portZ  = d / 2 + portD / 2;
    this._box(0, portH / 2, portZ, portW, portH, portD, bodyMat);
    // Canopy
    this._box(0, portH + 0.14, portZ, portW + 0.30, 0.28, portD + 0.30, spandrelMat);
    // Entry door glass
    this._box(0, groundH * 0.44, d / 2 + portD + 0.03, portW * 0.55, groundH * 0.78, 0.07, glassMat);

    // ── Pavement path in front of entry ─────────────────────────────────────────
    this._box(0, 0.03, d / 2 + portD + 4.0, portW + 1.0, 0.06, 8.0, toonMat(0xC0BDB5));
  }

  _buildColliders(wx, wy, wz) {
    const { w, d, h, facing } = this.cfg;
    // Single box collider for the main slab
    if (facing && Math.abs(facing) > 0.01) {
      this._addPhysicsBoxRotated(wx, wy + h / 2, wz, w / 2, h / 2, d / 2, facing);
    } else {
      this._addPhysicsBox(wx, wy + h / 2, wz, w / 2, h / 2, d / 2);
    }
  }
}

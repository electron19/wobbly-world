import * as THREE from 'three';
import { Building } from './Building.js';
import { toonMat, addOutline } from '../core/Materials.js';

/**
 * PoppyFactory — Playtime Co. toy factory inspired by Poppy Playtime.
 *
 * Large industrial building with:
 *  - Bright yellow walls (signature Playtime Co. colour)
 *  - Navy blue trim, parapet and pilasters
 *  - "PLAYTIME CO." sign panel on the front facade
 *  - 3 tall smokestacks on the roof
 *  - Grid windows on all facades
 *  - 3 loading bays with dock platforms
 *  - Water tower on the roof (right side)
 *
 * Default dimensions: W=38, H=14, D=24  (fits between z=-100 and z=-150 roads)
 * Default facing: FW (−π/2) — facade points west toward x=130 road
 */
export class PoppyFactory extends Building {
  constructor(scene, physics, cfg = {}, vehiclePhysics = null) {
    super(scene, physics, {
      w: 38, h: 14, d: 24,
      bodyColor:  0xF0CC30,   // bright Playtime yellow
      trimColor:  0x1A2B6B,   // navy blue
      signColor:  0xCC1A1A,   // red sign background
      glassColor: 0x4A8FA0,   // teal windows
      stackColor: 0x505055,   // dark grey smokestacks
      facing: 0,
      ...cfg,
    }, vehiclePhysics);
  }

  _buildGeometry() {
    const { w: W, h: H, d: D,
            bodyColor, trimColor, signColor, glassColor, stackColor, facing } = this.cfg;

    this.root.rotation.y = facing;

    const bodyMat   = toonMat(bodyColor);
    const trimMat   = toonMat(trimColor);
    const signMat   = toonMat(signColor);
    const stackMat  = toonMat(stackColor);
    const whiteMat  = toonMat(0xF5F5F5);
    const chromeMat = toonMat(0xBBBBBB);
    const darkMat   = toonMat(0x1A1A1A);
    const dockMat   = toonMat(0x888888);
    const glassMat  = new THREE.MeshToonMaterial({
      color: glassColor, transparent: true, opacity: 0.78,
    });

    // ── Main building body ────────────────────────────────────────────────────
    this._box(0, H / 2, 0, W, H, D, bodyMat);

    // ── Flat roof — parapet (navy border + yellow inner) ─────────────────────
    this._box(0, H + 0.30, 0, W + 0.70, 0.60, D + 0.70, trimMat);   // outer lip
    this._box(0, H + 0.72, 0, W + 0.40, 0.40, D + 0.40, bodyMat);   // inner parapet cap

    // ── Corner pilasters (full height, navy) ────────────────────────────────
    const pilW = 0.90;
    [[-W / 2, D / 2], [W / 2, D / 2], [-W / 2, -D / 2], [W / 2, -D / 2]]
      .forEach(([px, pz]) => {
        this._box(px, H / 2, pz, pilW, H + 0.62, pilW, trimMat);
      });

    // ── Horizontal trim bands (industrial feel) ──────────────────────────────
    // Base coping
    this._box(0, 0.28, 0, W + 0.20, 0.56, D + 0.20, trimMat);
    // Mid band at ~7 h
    this._box(0, 7.0, D / 2 + 0.05, W - pilW, 0.38, 0.12, trimMat);
    this._box(0, 7.0, -D / 2 - 0.05, W - pilW, 0.38, 0.12, trimMat);
    this._box(-W / 2 - 0.05, 7.0, 0, 0.12, 0.38, D - pilW, trimMat);
    this._box( W / 2 + 0.05, 7.0, 0, 0.12, 0.38, D - pilW, trimMat);

    // ── Front facade (+Z) — loading bays ─────────────────────────────────────
    const bayH = H * 0.50, bayW = 4.2;
    const bayPositions = [-12, 0, 12];   // 3 bays along X
    bayPositions.forEach(bx => {
      // Bay door (dark)
      this._box(bx, bayH / 2, D / 2 + 0.06, bayW, bayH, 0.12, darkMat);
      // Metal frame — top
      this._box(bx, bayH + 0.18, D / 2 + 0.07, bayW + 0.36, 0.36, 0.10, chromeMat);
      // Metal frame — sides
      this._box(bx - bayW / 2 - 0.18, bayH / 2, D / 2 + 0.07, 0.36, bayH, 0.10, chromeMat);
      this._box(bx + bayW / 2 + 0.18, bayH / 2, D / 2 + 0.07, 0.36, bayH, 0.10, chromeMat);
      // Loading dock platform
      this._box(bx, 0.28, D / 2 + 1.0, bayW + 0.50, 0.56, 2.0, dockMat);
    });

    // ── Front windows above bays (2 rows × 8 cols) ───────────────────────────
    const winH = 1.5, winW = 2.0;
    const winStartY = bayH + 1.0;
    const colPositions = [-16, -11.4, -6.8, -2.2, 2.2, 6.8, 11.4, 16];
    for (let row = 0; row < 2; row++) {
      const wy = winStartY + row * (winH + 0.65);
      colPositions.forEach(wx => {
        this._box(wx, wy, D / 2 + 0.06, winW, winH, 0.08, glassMat);
        this._box(wx, wy, D / 2 + 0.075, winW + 0.16, winH + 0.16, 0.06, trimMat);
      });
    }

    // ── Side windows — left (−X) and right (+X), 2 rows × 4 cols ────────────
    const sideWinZ = [-9, -3, 3, 9];
    for (let row = 0; row < 2; row++) {
      const wy = winStartY + row * (winH + 0.65);
      sideWinZ.forEach(wz => {
        // Left wall
        this._box(-W / 2 - 0.06, wy, wz, 0.08, winH, winW, glassMat);
        this._box(-W / 2 - 0.075, wy, wz, 0.06, winH + 0.16, winW + 0.16, trimMat);
        // Right wall
        this._box( W / 2 + 0.06, wy, wz, 0.08, winH, winW, glassMat);
        this._box( W / 2 + 0.075, wy, wz, 0.06, winH + 0.16, winW + 0.16, trimMat);
      });
    }

    // ── Back wall (−Z) — small windows only ─────────────────────────────────
    const backWinX = [-14, -7, 0, 7, 14];
    backWinX.forEach(bwx => {
      this._box(bwx, bayH / 2 + 1.5, -D / 2 - 0.06, winW, winH, 0.08, glassMat);
      this._box(bwx, bayH / 2 + 1.5, -D / 2 - 0.075, winW + 0.16, winH + 0.16, 0.06, trimMat);
    });

    // ── "PLAYTIME CO." sign on front facade, above windows ───────────────────
    const signY = H * 0.87;
    // Red sign board
    this._box(0, signY, D / 2 + 0.09, 24.0, 3.2, 0.18, signMat);
    // White border frame
    this._box(0, signY, D / 2 + 0.10, 24.6, 3.6, 0.12, whiteMat);
    // White letter bars — 2 lines of text (simplified as horizontal bars)
    // Line 1: "PLAYTIME" — 3 bars
    [-0.70, 0, 0.70].forEach(offset => {
      this._box(offset * 6.5, signY + 0.60, D / 2 + 0.14, 5.8, 0.52, 0.06, whiteMat);
    });
    // Line 2: "CO." — single bar centred
    this._box(0, signY - 0.60, D / 2 + 0.14, 10.0, 0.50, 0.06, whiteMat);
    // Decorative stars (small white squares along sign edges)
    [-10.5, -7, 7, 10.5].forEach(sx => {
      this._box(sx, signY, D / 2 + 0.14, 0.45, 0.45, 0.06, whiteMat);
    });
    // Logo circle left of sign (Playtime Co. round emblem — approximated with box)
    this._box(-9.5, signY + 0.10, D / 2 + 0.14, 1.6, 1.6, 0.06, whiteMat);
    this._box(-9.5, signY + 0.10, D / 2 + 0.15, 0.9, 0.9, 0.05, signMat); // inner
    // Logo circle right
    this._box( 9.5, signY + 0.10, D / 2 + 0.14, 1.6, 1.6, 0.06, whiteMat);
    this._box( 9.5, signY + 0.10, D / 2 + 0.15, 0.9, 0.9, 0.05, signMat);

    // ── 3 Smokestacks on roof ────────────────────────────────────────────────
    const stacks = [{ x: -12, z: -7 }, { x: 0, z: -5 }, { x: 12, z: -7 }];
    const stH = 11, stW = 2.2;
    stacks.forEach(({ x, z }) => {
      // Stack body
      this._box(x, H + stH / 2, z, stW, stH, stW, stackMat);
      // Cap — slightly wider, dark trim
      this._box(x, H + stH + 0.45, z, stW + 0.50, 0.90, stW + 0.50, trimMat);
      // Safety stripe (red band)
      this._box(x, H + stH * 0.70, z, stW + 0.08, 0.90, stW + 0.08, signMat);
      // Second stripe near base
      this._box(x, H + stH * 0.25, z, stW + 0.08, 0.70, stW + 0.08, signMat);
    });

    // ── Water tower on roof (front-right) ───────────────────────────────────
    const twX = 14, twZ = 7;
    // Four support legs
    [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]].forEach(([lx, lz]) => {
      this._box(twX + lx, H + 3.0, twZ + lz, 0.24, 6.0, 0.24, chromeMat);
    });
    // Cross braces
    this._box(twX, H + 2.5, twZ - 1.1, 2.2, 0.18, 0.18, chromeMat);
    this._box(twX, H + 2.5, twZ + 1.1, 2.2, 0.18, 0.18, chromeMat);
    // Tank body (wooden barrel — brown)
    this._box(twX, H + 6.5, twZ, 3.0, 3.0, 3.0, toonMat(0x8B6A14));
    // Tank ring bands
    [-0.6, 0, 0.6].forEach(ry => {
      this._box(twX, H + 6.5 + ry, twZ, 3.12, 0.22, 3.12, chromeMat);
    });
    // Conical cap (narrower top box)
    this._box(twX, H + 8.4, twZ, 2.2, 1.0, 2.2, toonMat(0x6B5010));
  }

  _buildColliders(wx, wy, wz) {
    const { w: W, h: H, d: D, facing } = this.cfg;
    // For ±90° rotated buildings (FW / FE) swap X↔Z extents so the physics
    // box matches the visual world-space footprint.
    const isLateral = Math.abs(Math.sin(facing)) > 0.99;
    const hw = isLateral ? D / 2 : W / 2;
    const hd = isLateral ? W / 2 : D / 2;
    this._addPhysicsBox(wx, wy + H / 2, wz, hw, H / 2, hd);
  }
}

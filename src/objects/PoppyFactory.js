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
 *  - Walkable interior (hasInterior=true) — enter through central loading bay
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

    this.hasInterior = true;   // player can enter through central loading bay
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

  // ─── Wnętrze (Poppy Playtime style) ──────────────────────────────────────

  _buildInterior() {
    const { w: W, h: H, d: D } = this.cfg;
    const g = new THREE.Group();

    const bx = (x, y, z, w, h, d, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };

    // ── Materiały ─────────────────────────────────────────────────────────────
    const floorMat = toonMat(0x2E2E2E);          // dark concrete floor
    const wallMat  = new THREE.MeshToonMaterial({ color: 0x252830, side: THREE.BackSide });
    const ceilMat  = toonMat(0x1A1A22);           // near-black ceiling
    const machMat  = toonMat(0x3A4A5A);           // industrial machine steel
    const pipeMat  = toonMat(0x4A4A55);           // pipe grey-blue
    const convMat  = toonMat(0x1A1A1A);           // conveyor belt dark
    const warnMat  = toonMat(0xFF5500);           // warning orange
    const safeYel  = toonMat(0xFFCC00);           // safety yellow
    const blue1    = toonMat(0x1A4FC4);           // Playtime blue
    const red1     = toonMat(0xCC1A1A);           // danger red
    const green1   = toonMat(0x1A8A2A);           // Playtime green accent
    const chromMat = toonMat(0x888888);           // chrome metal
    const woodMat  = toonMat(0x6B4A20);           // wooden crate
    const darkBox  = toonMat(0x111111);           // very dark shadow box

    // ── Podłoga — dark concrete ───────────────────────────────────────────────
    bx(0, 0.06, 0, W - 0.5, 0.12, D - 0.5, floorMat);

    // Pasy ostrzegawcze na podłodze przy ścianach (czarno-żółte)
    [[-W / 2 + 1.2, 0], [W / 2 - 1.2, 0]].forEach(([fx]) => {
      for (let fz = -D / 2 + 2; fz < D / 2 - 2; fz += 1.6) {
        bx(fx, 0.10, fz, 2.2, 0.04, 0.70, warnMat);
      }
    });

    // ── Sufit i ściany wewnętrzne (BackSide box) ──────────────────────────────
    const wallBox = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.08, H - 0.04, D - 0.08), wallMat,
    );
    wallBox.position.set(0, H / 2, 0);
    g.add(wallBox);

    // Sufit (widoczny tył od wewnątrz — lekko ciemniejszy)
    const ceilMesh = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.5, D - 0.5), ceilMat);
    ceilMesh.rotation.x = Math.PI / 2;
    ceilMesh.position.set(0, H - 0.06, 0);
    g.add(ceilMesh);

    // ── Kanały wentylacyjne przy suficie ─────────────────────────────────────
    for (const vx of [-10, 0, 10]) {
      bx(vx, H - 0.55, 0, 2.4, 1.0, D - 1.0, machMat);
      // Kratki na kanale
      for (let vz = -D / 2 + 3; vz < D / 2 - 3; vz += 3.0) {
        bx(vx, H - 0.56, vz, 2.42, 0.10, 0.14, darkBox);
      }
    }

    // ── Pasy świetlne (czerwone) na ścianach bocznych przy suficie ───────────
    for (const lx of [-W / 2 + 0.12, W / 2 - 0.12]) {
      bx(lx, H - 1.0, 0, 0.10, 0.22, D - 2.0, red1);
    }

    // ── Maszyny produkcyjne — lewa strona ─────────────────────────────────────
    // Machine A — wielka prasa hydrauliczna
    const machAX = -13;
    bx(machAX, 3.5, -4, 6.0, 7.0, 5.0, machMat);         // korpus
    bx(machAX, 7.6, -4, 4.0, 0.50, 3.5, warnMat);        // pasek ostrzeg. na górze
    bx(machAX, 3.5, -4, 3.2, 0.28, 5.2, safeYel);        // pas środkowy
    bx(machAX - 2.8, 5.0, -4, 0.50, 4.0, 0.50, pipeMat); // boczna rura hydraul.
    bx(machAX + 2.8, 5.0, -4, 0.50, 4.0, 0.50, pipeMat);
    bx(machAX, 1.5, -4, 5.5, 3.0, 4.5, darkBox);         // ciemne "wnętrze" maszyny
    bx(machAX, 0.50, -4, 5.8, 1.0, 5.2, chromMat);       // podstawa

    // Machine B — przenośnikowa maszyna pakująca
    const machBX = -13;
    bx(machBX, 3.0, 5, 5.5, 6.0, 4.0, machMat);
    bx(machBX, 6.2, 5, 3.5, 0.40, 3.2, warnMat);
    bx(machBX, 3.0, 5, 1.5, 0.24, 3.8, blue1);
    bx(machBX, 0.50, 5, 5.8, 1.0, 4.5, chromMat);
    // Beczki przy maszynie
    for (let bi = 0; bi < 3; bi++) {
      bx(machBX - 4.0, 0.90, 4.0 + bi * 1.4, 0.90, 1.80, 0.90, toonMat(0x445566));
      bx(machBX - 4.0, 1.85, 4.0 + bi * 1.4, 0.94, 0.18, 0.94, chromMat);
    }

    // ── Przenośnik taśmowy — oś centralna ─────────────────────────────────────
    // Biegnący od tyłu fabryki (z=-9) ku wejściu (z=9)
    const cbW = 3.5, cbH = 1.40;
    bx(0, cbH / 2, 0, cbW, cbH, D - 4.0, machMat);          // rama przenośnika
    bx(0, cbH, 0, cbW - 0.30, 0.18, D - 4.5, convMat);      // taśma
    // Wałki napędowe
    for (let cz = -D / 2 + 3; cz < D / 2 - 3; cz += 2.0) {
      bx(0, cbH + 0.06, cz, cbW, 0.22, 0.22, chromMat);
    }
    // Pudełka-zabawki na taśmie
    const toyColors = [blue1, red1, green1, safeYel];
    for (let ti = 0; ti < 6; ti++) {
      const tz = -7 + ti * 2.4;
      bx(0.6, cbH + 0.40, tz, 0.80, 0.80, 0.80, toyColors[ti % toyColors.length]);
      bx(-0.5, cbH + 0.40, tz + 0.9, 0.65, 0.65, 0.65, toyColors[(ti + 2) % toyColors.length]);
    }

    // ── Maszyny produkcyjne — prawa strona ────────────────────────────────────
    const machCX = 13;
    bx(machCX, 4.0, -4, 5.5, 8.0, 5.0, machMat);
    bx(machCX, 8.2, -4, 4.0, 0.50, 3.5, warnMat);
    bx(machCX, 4.0, -4, 1.8, 0.28, 4.8, red1);
    bx(machCX, 0.50, -4, 5.8, 1.0, 5.2, chromMat);
    bx(machCX + 2.5, 6.0, -4, 0.50, 6.0, 0.50, pipeMat);
    bx(machCX - 2.5, 6.0, -4, 0.50, 6.0, 0.50, pipeMat);
    // Rury łączące maszynę ze ścianą
    bx(machCX + 3.0, 10.0, -4, 4.0, 0.50, 0.50, pipeMat);
    bx(W / 2 - 1.5, 10.0, -4, 3.0, 0.50, 0.50, pipeMat);

    // ── Regały z zabawkami — prawa-tylna strona ───────────────────────────────
    for (let shelf = 0; shelf < 3; shelf++) {
      const sy = 1.5 + shelf * 2.8;
      bx(15, sy, -8, 6.0, 0.20, 2.5, woodMat);          // półka
      bx(12.2, sy - 0.8, -8, 0.20, 1.6, 2.6, woodMat);  // lewa noga
      bx(17.8, sy - 0.8, -8, 0.20, 1.6, 2.6, woodMat);  // prawa noga
      // Pudełka na półce
      for (let col = 0; col < 4; col++) {
        bx(13.0 + col * 1.3, sy + 0.45, -8, 1.1, 0.9, 0.90,
           toyColors[col % toyColors.length]);
      }
    }

    // ── "Huggy Wuggy" — wielka niebieska zabawka w rogu ─────────────────────
    // (tyłowy-prawy narożnik, x=16, z=-9)
    const hX = 15, hZ = -9;
    bx(hX, 4.5, hZ, 3.2, 9.0, 2.5, blue1);               // korpus
    bx(hX, 9.8, hZ, 2.8, 1.4, 2.2, toonMat(0x0A2A8A));   // głowa
    bx(hX - 0.6, 9.9, hZ - 1.2, 0.9, 0.9, 0.10, toonMat(0xFFFF88)); // oko L
    bx(hX + 0.6, 9.9, hZ - 1.2, 0.9, 0.9, 0.10, toonMat(0xFFFF88)); // oko P
    bx(hX, 9.5, hZ - 1.2, 1.8, 0.45, 0.10, red1);        // uśmiech
    bx(hX, 9.9, hZ - 1.1, 0.10, 0.55, 0.10, toonMat(0xFFFFFF)); // ząb
    // Długie ręce (charakterystyczne dla Huggy Wuggy)
    bx(hX - 3.5, 7.0, hZ, 7.0, 0.70, 0.70, blue1);       // ręka lewa
    bx(hX + 3.5, 7.0, hZ, 7.0, 0.70, 0.70, blue1);       // ręka prawa
    bx(hX - 6.8, 7.0, hZ, 0.90, 1.40, 0.90, blue1);      // dłoń lewa
    bx(hX + 6.8, 7.0, hZ, 0.90, 1.40, 0.90, blue1);      // dłoń prawa
    // Nogi
    bx(hX - 0.9, 1.4, hZ, 1.0, 2.8, 1.0, blue1);
    bx(hX + 0.9, 1.4, hZ, 1.0, 2.8, 1.0, blue1);

    // ── Kładka (catwalk) na wysokości y=7 ────────────────────────────────────
    const ckY = 7.0;
    bx(0, ckY + 0.10, 0, W - 4.0, 0.20, 2.2, chromMat);         // platforma
    bx(0, ckY + 0.10, 0, W - 4.0, 0.06, 2.2, darkBox);          // krata
    // Barierki
    for (const bz of [-1.1, 1.1]) {
      bx(0, ckY + 0.8, bz, W - 4.0, 0.12, 0.10, chromMat);      // górna poręcz
      bx(0, ckY + 0.45, bz, W - 4.0, 0.10, 0.10, chromMat);     // dolna poprzeczka
      // Słupki barierki
      for (let px = -W / 2 + 3.5; px < W / 2 - 3; px += 2.5) {
        bx(px, ckY + 0.6, bz, 0.10, 1.20, 0.10, chromMat);
      }
    }
    // Schody prowadzące na kładkę (z lewej ściany)
    for (let si = 0; si < 8; si++) {
      bx(-W / 2 + 2.2 + si * 0.40, si * 0.87 + 0.44, -0.5, 0.80, 0.16, 1.5, chromMat);
    }

    // ── Łańcuchy zwisające z sufitu ───────────────────────────────────────────
    const chainPositions = [
      [-8, D / 2 - 4], [8, D / 2 - 4],
      [-8, -(D / 2 - 4)], [8, -(D / 2 - 4)],
      [-15, 0], [15, 0],
    ];
    chainPositions.forEach(([cx, cz]) => {
      const len = 2.5 + Math.random() * 3;
      bx(cx, H - len / 2 - 0.5, cz, 0.12, len, 0.12, toonMat(0x333344));
      // Hak na dole łańcucha
      bx(cx, H - len - 0.8, cz, 0.28, 0.50, 0.28, chromMat);
    });

    // ── Panel sterowania przy wejściu ─────────────────────────────────────────
    const ctrlZ = D / 2 - 1.8;
    bx(4.0, 1.8, ctrlZ - 0.15, 2.4, 3.0, 0.30, machMat);   // obudowa
    bx(4.0, 2.0, ctrlZ,        1.8, 0.9, 0.10, darkBox);   // ekran
    bx(4.0, 1.3, ctrlZ,        1.8, 0.36, 0.10, toonMat(0x112244)); // klawiatura
    // Lampki statusu (czerwona, żółta, zielona)
    [[3.2, 3.2], [4.0, 3.2], [4.8, 3.2]].forEach(([lx, ly], i) => {
      bx(lx, ly, ctrlZ, 0.28, 0.28, 0.12,
         [red1, safeYel, green1][i]);
    });

    // ── Kratki podłogowe (odwodnienie) ────────────────────────────────────────
    for (let gi = -1; gi <= 1; gi++) {
      bx(0, 0.10, gi * 5, cbW - 0.20, 0.04, 1.0, darkBox);
    }

    // ── Skrzynie przy tylnej ścianie ──────────────────────────────────────────
    for (let cx = -8; cx <= 8; cx += 3.5) {
      bx(cx, 0.65, -(D / 2 - 1.2), 2.5, 1.30, 1.8, woodMat);
      bx(cx, 1.95, -(D / 2 - 1.2), 2.3, 1.30, 1.6, woodMat);
      // Napis (stripe) na skrzyni
      bx(cx, 0.65, -(D / 2 - 1.2) + 0.92, 2.0, 0.30, 0.06, safeYel);
    }

    // ── Znaki ostrzegawcze na ścianach ────────────────────────────────────────
    // Lewy: "CAUTION" żółto-czarne pasy
    for (let wz = -8; wz <= 8; wz += 4) {
      bx(-W / 2 + 0.12, 5.0, wz, 0.10, 2.0, 1.4, safeYel);
      bx(-W / 2 + 0.12, 5.0, wz, 0.10, 2.0, 0.35, toonMat(0x111111));
    }
    // Prawy: czerwone "DANGER" pasy
    for (let wz = -8; wz <= 8; wz += 5) {
      bx(W / 2 - 0.12, 4.0, wz, 0.10, 1.6, 1.2, red1);
    }
    // Tył: numery stref (niebieskie pasy)
    for (let wz = -10; wz <= 10; wz += 6) {
      bx(W / 2 - 2.0, 4.5, -(D / 2 - 0.12), 1.8, 1.8, 0.10, blue1);
    }

    g.visible = false;
    this.root.add(g);
    this._interiorGroup = g;
  }

  // ─── Pozycje interakcji z graczem ────────────────────────────────────────

  /** Punkt przed centralną bramą załadunkową (detekcja E). */
  getDoorApproachPos()  { return this._localToWorld(0, 0,  this.cfg.d / 2 + 2.0); }
  /** Pozycja spawnu wewnątrz — tuż za bramą wejściową. */
  getInteriorSpawnPos() { return this._localToWorld(0, 1.0, this.cfg.d / 2 - 2.0); }
  /** Pozycja wyjścia — przed bramą na zewnątrz. */
  getExitPos()          { return this._localToWorld(0, 1.0, this.cfg.d / 2 + 2.5); }

  // ─── Kolizje ─────────────────────────────────────────────────────────────

  _buildColliders(wx, wy, wz) {
    const { w: W, h: H, d: D, facing } = this.cfg;
    const cosF = Math.cos(facing), sinF = Math.sin(facing);
    const isLateral = Math.abs(sinF) > 0.99;
    const hw = isLateral ? D / 2 : W / 2;
    const hd = isLateral ? W / 2 : D / 2;

    // ── Solid exterior (wyłączany gdy gracz wewnątrz) ─────────────────────────
    this._solidBody = this._addPhysicsBoxRotated(wx, wy + H / 2, wz, W / 2, H / 2, D / 2, facing);

    // ── Sufit/dach — zawsze solid, blokuje wyskok przez dach ─────────────────
    this._addPhysicsBoxRotated(wx, wy + H + 0.25, wz, W / 2, 0.25, D / 2, facing);

    // ── Hollow walls — aktywne gdy gracz wewnątrz ─────────────────────────────
    const WT   = 0.30;   // grubość ściany
    const bayW = 4.2;    // szerokość bramy
    const bayH = H * 0.5;  // wysokość bramy = 7

    const wp = (lx, ly, lz) => ({
      x: wx + lx * cosF + lz * sinF,
      y: wy + ly,
      z: wz - lx * sinF + lz * cosF,
    });

    const addWall = (lx, ly, lz, phw, phh, phd) => {
      const p = wp(lx, ly, lz);
      const b = this._addPhysicsBoxRotated(p.x, p.y, p.z, phw, phh, phd, facing);
      b.setEnabled(false);
      this._hollowBodies.push(b);
    };

    // Ściana przednia z otworem centralnej bramy
    const sideW = (W / 2 - bayW / 2);
    addWall(-(bayW / 2 + sideW / 2), H / 2, D / 2 - WT / 2, sideW / 2, H / 2, WT / 2);
    addWall( (bayW / 2 + sideW / 2), H / 2, D / 2 - WT / 2, sideW / 2, H / 2, WT / 2);
    // Nadproże nad bramą
    const lintH = H - bayH;
    addWall(0, bayH + lintH / 2, D / 2 - WT / 2, W / 2, lintH / 2, WT / 2);

    // Ściana tylna (pełna)
    addWall(0, H / 2, -(D / 2 - WT / 2), W / 2, H / 2, WT / 2);

    // Ściany boczne
    addWall(-(W / 2 - WT / 2), H / 2, 0, WT / 2, H / 2, D / 2);
    addWall( (W / 2 - WT / 2), H / 2, 0, WT / 2, H / 2, D / 2);
  }
}

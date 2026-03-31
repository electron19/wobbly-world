/**
 * WorldBuilder — buduje całe miasto.
 *
 * Siatka ulic (6 dróg):
 *   N-S: x = -65, 0, +65
 *   E-W: z = -50,  0, +50
 *
 * Bloki między drogami (wewnętrzna strefa ±60 jednostek od środka):
 *   Centrum    4 bloki   — domy, sklepy
 *   Przedmieścia N/S     — domy
 *   CBD E/W (x>65/x<-65) — wieżowce, sklepy
 *   Daleko (narożniki)   — 2 wzgórza
 */
import * as THREE from 'three';
import { Ground, makeSidewalkCanvas, makeSidewalkMat } from '../objects/Ground.js';
import { House, HOUSE_PALETTES }  from '../objects/House.js';
import { Shop }                   from '../objects/Shop.js';
import { School }                 from '../objects/School.js';
import { Skyscraper }             from '../objects/Skyscraper.js';
import { BrickBuilding }          from '../objects/BrickBuilding.js';
import { TowerBlock }             from '../objects/TowerBlock.js';
import { TriOffice }             from '../objects/TriOffice.js';
import { Church }                 from '../objects/Church.js';
import { Warehouse }              from '../objects/Warehouse.js';
import { Hill }                   from '../objects/Hill.js';
import { Tree }                   from '../objects/Tree.js';
import { StreetLamp }             from '../objects/StreetLamp.js';
import { Car }                    from '../entities/Car.js';
import { isSafePoint, ROADS, ROAD_CLEAR } from '../world/zones.js';
import { rand }                   from '../core/RNG.js';

// Kierunki elewacji (rotation.y)
const FE =  Math.PI / 2;    // fasada na wschód  (dla budynków po zachodniej stronie drogi)
const FW = -Math.PI / 2;    // fasada na zachód  (dla budynków po wschodniej stronie drogi)
const FS =  0;               // fasada na południe (dla budynków po północnej stronie drogi)
const FN =  Math.PI;         // fasada na północ  (dla budynków po południowej stronie drogi)

export class WorldBuilder {
  constructor(scene, physics, vehiclePhysics) {
    this.scene          = scene;
    this.physics        = physics;
    this.vehiclePhysics = vehiclePhysics;
    this.objects        = [];
    this.cars           = [];
    this._circles       = []; // exclusion circles — budynki, drzewa omijają je
    this.knockableLamps = [];   // lampy do aktualizacji co klatkę
    this._swCanvas      = makeSidewalkCanvas(); // jeden canvas dla wszystkich chodników
  }

  build() {
    this._addGround();
    this._addRoads();
    this._addCentreBlocks();
    this._addNorthSuburbs();
    this._addSouthSuburbs();
    this._addCBD();
    this._addNorthMidBand();
    this._addSouthMidBand();
    this._addFarNorth();
    this._addFarSouth();
    this._addFarEast();
    this._addFarWest();
    this._addFarFarNorth();
    this._addFarFarSouth();
    this._addHills();
    this._addTrees();
    this._addStreetLamps();
    this._addCars();
    this._addBoundaries();
    return this;
  }

  _add(obj) { this.objects.push(obj); return obj; }

  /** Zarejestruj okrąg wykluczenia (hw, hd = półwymiary prostokąta). */
  _regCircle(cx, cz, hw, hd, margin = 1.5) {
    this._circles.push({ cx, cz, r: Math.hypot(hw, hd) + margin });
  }

  /** Czy punkt (tx, tz) jest wolny od dróg i budynków? */
  _isFreeForTree(tx, tz, treeR = 1.0) {
    if (!isSafePoint(tx, tz)) return false;
    for (const c of this._circles) {
      const dx = tx - c.cx, dz = tz - c.cz;
      if (dx * dx + dz * dz < (c.r + treeR) * (c.r + treeR)) return false;
    }
    return true;
  }

  /**
   * Podziel odcinek [from, to] na segmenty, wycinając przedziały z `cuts`.
   * @param {number} from
   * @param {number} to
   * @param {[number,number][]} cuts — przedziały do wycięcia, mogą się nakładać
   */
  _splitSegments(from, to, cuts) {
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
  }

  // Skrótowy helper — dom z paletą + ogródek
  _house(pal, x, z, facing, opts = {}) {
    const w = opts.w ?? 6, d = opts.d ?? 8;
    this._regCircle(x, z, w / 2, d / 2);
    this._addGarden(x, z, facing, w, d);
    return this._add(new House(this.scene, this.physics, {
      wallColor: pal.wall,
      roofColor: pal.roof,
      doorColor: pal.door,
      trimColor:  pal.trim,
      facing,
      ...opts,
    }, this.vehiclePhysics).placeAt(x, 0, z));
  }

  /** Kamienica z cegły — rejestruje koło wykluczenia, stawia budynek. */
  _brick(x, z, facing, opts = {}) {
    const w = opts.w ?? 9, d = opts.d ?? 12;
    this._regCircle(x, z, w / 2, d / 2, 2.0);
    return this._add(new BrickBuilding(this.scene, this.physics, { facing, ...opts }, this.vehiclePhysics).placeAt(x, 0, z));
  }

  /** Trójkątny budynek (a=10, b=50) — elongated, 5 pięter, stoi w polu poza miastem. */
  _triOffice(x, z, facing, opts = {}) {
    // W=10 → hw=5, D=50 → hd=25 (centrum geometryczne ≈ D/2 od frontu)
    this._regCircle(x, z, 5, 25, 3.0);
    return this._add(new TriOffice(this.scene, this.physics, { facing, ...opts }, this.vehiclePhysics).placeAt(x, 0, z));
  }

  /** Kościół — rejestruje koło wykluczenia, stawia budynek. */
  _church(x, z, facing, opts = {}) {
    this._regCircle(x, z, 10 / 2, 20 / 2, 2.0);
    return this._add(new Church(this.scene, this.physics, { facing, ...opts }, this.vehiclePhysics).placeAt(x, 0, z));
  }

  /** Magazyn przemysłowy — rejestruje koło wykluczenia, stawia budynek. */
  _warehouse(x, z, facing, opts = {}) {
    const w = opts.w ?? 24, d = opts.d ?? 16;
    this._regCircle(x, z, w / 2, d / 2, 2.0);
    return this._add(new Warehouse(this.scene, this.physics, { facing, ...opts }, this.vehiclePhysics).placeAt(x, 0, z));
  }

  /** Wieżowiec-blok (prosta bryła) — rejestruje koło wykluczenia, stawia budynek. */
  _tower(x, z, facing, opts = {}) {
    const w = opts.w ?? 12, d = opts.d ?? 14;
    this._regCircle(x, z, w / 2, d / 2, 2.5);
    return this._add(new TowerBlock(this.scene, this.physics, { facing, ...opts }, this.vehiclePhysics).placeAt(x, 0, z));
  }

  /**
   * Ogródek + ścieżka z białych płytek przed wejściem.
   * @param {number} x, z    centrum domu
   * @param {number} facing  obrót Y (FN/FS/FE/FW)
   * @param {number} w, d    wymiary domu (przed rotacją)
   */
  _addGarden(x, z, facing, w = 6, d = 8) {
    // Kierunek wejścia w przestrzeni świata (obróć lokalny +Z przez facing)
    const dx = Math.sin(facing);
    const dz = Math.cos(facing);

    // ── Zielony ogródek ─────────────────────────────────────────────────────
    // Płaski box nieco większy od domu, lekko podniesiony (2 cm)
    const gardenW = w + 2.0;
    const gardenD = d + 1.5;
    const gardenMat = new THREE.MeshToonMaterial({ color: 0x3EA832 });
    const garden = new THREE.Mesh(
      new THREE.BoxGeometry(gardenW, 0.04, gardenD), gardenMat,
    );
    // Obróć ogródek tak by był pod domem (taka sama rotacja)
    garden.rotation.y = facing;
    garden.position.set(x, 0.02, z);
    garden.receiveShadow = true;
    this.scene.add(garden);

    // ── Białe płytki — ścieżka od drzwi ku jezdni ───────────────────────────
    const tileMat = new THREE.MeshToonMaterial({ color: 0xEEECDC });
    const tileStep = 1.0;
    const tileStart = d / 2 + 0.6;   // pierwsza płytka tuż za frontem domu
    for (let i = 0; i < 4; i++) {
      const dist = tileStart + i * tileStep;
      const tx = x + dx * dist;
      const tz = z + dz * dist;
      const tile = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.06, 0.85), tileMat);
      tile.position.set(tx, 0.03, tz);
      tile.receiveShadow = true;
      this.scene.add(tile);
    }
  }

  // ─── Podłoże ────────────────────────────────────────────────────────────────

  _addGround() {
    // Ground jest zawsze widoczny — nie trafia do listy cullingowej
    new Ground(this.scene, this.physics, this.vehiclePhysics, 640);
  }

  // ─── Drogi ──────────────────────────────────────────────────────────────────
  // Buduje wizualną jezdnię + linie + chodniki + fizykę chodnika.

  _road({ axis, center, halfLen = 130 }) {
    const RW  = 3.0;
    const SWW = 1.5;
    const SWH = 0.10;
    const n   = Math.floor(halfLen / 10);

    const roadMat = new THREE.MeshToonMaterial({ color: 0x888888 });
    const lineMat = new THREE.MeshToonMaterial({ color: 0xFFFFCC });

    // Cięcia chodnika: miejsca skrzyżowań z prostopadłymi drogami
    const crossAxis  = axis === 'z' ? 'x' : 'z';
    const crossCuts  = ROADS
      .filter(r => r.axis === crossAxis)
      .map(r => [r.center - ROAD_CLEAR, r.center + ROAD_CLEAR]);
    const swSegments = this._splitSegments(-halfLen, halfLen, crossCuts);

    if (axis === 'z') {
      // ── Droga E-W przy z = center ─────────────────────────────────────────
      const road = new THREE.Mesh(new THREE.PlaneGeometry(halfLen * 2, RW * 2), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.011, center);
      road.receiveShadow = true;
      this.scene.add(road);

      for (let i = -n; i <= n; i++) {
        if (i === 0) continue;
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.25), lineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(i * 10, 0.013, center);
        this.scene.add(dash);
      }

      // Chodniki — segmenty między skrzyżowaniami
      [-1, 1].forEach(side => {
        const swZ = center + side * (RW + SWW / 2);
        for (const [s0, s1] of swSegments) {
          const len = s1 - s0, cx = (s0 + s1) / 2;
          const sw = new THREE.Mesh(new THREE.PlaneGeometry(len, SWW),
            makeSidewalkMat(this._swCanvas, len, SWW));
          sw.rotation.x = -Math.PI / 2;
          sw.position.set(cx, SWH, swZ);
          sw.receiveShadow = true;
          this.scene.add(sw);
          this.physics.addStaticBox(cx, SWH / 2, swZ, len / 2, SWH / 2, SWW / 2);
          if (this.vehiclePhysics)
            this.vehiclePhysics.addStaticBox(cx, SWH / 2, swZ, len / 2, SWH / 2, SWW / 2, 'ground');
        }
      });
    } else {
      // ── Droga N-S przy x = center ─────────────────────────────────────────
      const road = new THREE.Mesh(new THREE.PlaneGeometry(RW * 2, halfLen * 2), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(center, 0.011, 0);
      road.receiveShadow = true;
      this.scene.add(road);

      for (let i = -n; i <= n; i++) {
        if (i === 0) continue;
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 5), lineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(center, 0.013, i * 10);
        this.scene.add(dash);
      }

      // Chodniki — segmenty między skrzyżowaniami
      [-1, 1].forEach(side => {
        const swX = center + side * (RW + SWW / 2);
        for (const [s0, s1] of swSegments) {
          const len = s1 - s0, cz = (s0 + s1) / 2;
          const sw = new THREE.Mesh(new THREE.PlaneGeometry(SWW, len),
            makeSidewalkMat(this._swCanvas, SWW, len));
          sw.rotation.x = -Math.PI / 2;
          sw.position.set(swX, SWH, cz);
          sw.receiveShadow = true;
          this.scene.add(sw);
          this.physics.addStaticBox(swX, SWH / 2, cz, SWW / 2, SWH / 2, len / 2);
          if (this.vehiclePhysics)
            this.vehiclePhysics.addStaticBox(swX, SWH / 2, cz, SWW / 2, SWH / 2, len / 2, 'ground');
        }
      });
    }
  }

  _addRoads() {
    // Główny krzyż (x=0, z=0) jest w Ground.js — tu dodajemy pozostałe drogi.
    this._road({ axis: 'z', center:  -50, halfLen: 200 });
    this._road({ axis: 'z', center:   50, halfLen: 200 });
    this._road({ axis: 'z', center: -100, halfLen: 200 });
    this._road({ axis: 'z', center:  100, halfLen: 200 });
    this._road({ axis: 'z', center: -150, halfLen: 145 }); // ← nowe
    this._road({ axis: 'z', center:  150, halfLen: 145 }); // ← nowe
    this._road({ axis: 'x', center:   65, halfLen: 200 });
    this._road({ axis: 'x', center:  -65, halfLen: 200 });
    this._road({ axis: 'x', center:  130, halfLen: 200 });
    this._road({ axis: 'x', center: -130, halfLen: 200 });
    this._addCorners();
  }

  /**
   * Kwadratowe płyty narożne w każdym skrzyżowaniu dróg.
   * Na każdym skrzyżowaniu drogi N-S i E-W powstają 4 narożniki chodnika
   * (poza rogami głównego krzyżowania, które obsługuje Ground.js).
   */
  _addCorners() {
    const RW  = 3.0;
    const SWW = 1.5;
    const SWH = 0.10;

    const nsRoads = ROADS.filter(r => r.axis === 'x');  // x=0,±65
    const ewRoads = ROADS.filter(r => r.axis === 'z');  // z=0,±50

    nsRoads.forEach(ns => {
      ewRoads.forEach(ew => {
        // Pomiń główne skrzyżowanie (x=0, z=0) — rogi robi Ground.js
        if (ns.center === 0 && ew.center === 0) return;
        // 4 rogi: (±chodnik wzdłuż X, ±chodnik wzdłuż Z)
        [-1, 1].forEach(sx => {
          [-1, 1].forEach(sz => {
            const cx = ns.center + sx * (RW + SWW / 2);
            const cz = ew.center + sz * (RW + SWW / 2);
            const corner = new THREE.Mesh(
              new THREE.PlaneGeometry(SWW, SWW),
              makeSidewalkMat(this._swCanvas, SWW, SWW),
            );
            corner.rotation.x = -Math.PI / 2;
            corner.position.set(cx, SWH, cz);
            corner.receiveShadow = true;
            this.scene.add(corner);
            this.physics.addStaticBox(cx, SWH / 2, cz, SWW / 2, SWH / 2, SWW / 2);
            if (this.vehiclePhysics)
              this.vehiclePhysics.addStaticBox(cx, SWH / 2, cz, SWW / 2, SWH / 2, SWW / 2, 'ground');
          });
        });
      });
    });
  }

  // ─── Centrum (4 bloki między drogami wewnętrznymi) ──────────────────────────
  //
  // Zasady rozmieszczenia:
  //  • Minimalne odstępy: dom-dom ≥ 14j, dom-sklep ≥ 14j, dom-szkoła ≥ 19j
  //  • Fasada (drzwi + ścieżka) zawsze skierowana ku NAJBLIŻSZEJ drodze
  //  • Ścieżka wejściowa (4 płytki × 1j, start d/2+0.6 od centrum):
  //      FW → płytki w kierunku -X; FE → +X; FS → +Z; FN → -Z
  //      Ostatnia płytka musi być POZA ROAD_CLEAR (4.5j od osi drogi).
  //      Minimalny cofnięcie budynku od osi drogi: d/2 + 0.6 + 3 + 4.5 = 12.1j
  //      → budynki przy x=0 muszą być x ≥ 13; przy x=65 → x ≤ 52;
  //        przy z=0 → |z| ≥ 13; przy z=±50 → |z| ≤ 37.

  _addCentreBlocks() {
    const P = HOUSE_PALETTES;

    // ── Blok NE (x∈[13,52], z∈[-13,-37]) ────────────────────────────────────
    // Budynki na obwodzie bloku, fasada ku najbliższej drodze.
    // shop(14,-14,FW): ścieżka →-X, last tile x=6.4 > ROAD_CLEAR 4.5 ✓
    this._regCircle(14, -14, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FW }, this.vehiclePhysics).placeAt(14, 0, -14));
    // house(14,-32,FW): wzdłuż x=0 (18j od shopu ✓)
    this._house(P[0],  14, -32, FW, { roofStyle: 'pitched', hasChimney: true });
    // house(32,-14,FS): wzdłuż z=0 (18j od shopu ✓); ścieżka →+Z, last tile z=-6.4 > 4.5 ✓
    this._house(P[1],  32, -14, FS, { roofStyle: 'flat', floors: 2 });
    // house(52,-24,FE): wzdłuż x=65 (23j od house(32,-14) ✓); ścieżka →+X, last tile x=59.6 < 60.5 ✓
    this._house(P[2],  52, -24, FE, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    // house(34,-37,FN): wzdłuż z=-50 (17j od house(14,-32) ✓); ścieżka →-Z, last tile z=-44.6 > -45.5 ✓
    this._house(P[3],  34, -37, FN, { roofStyle: 'pitched' });

    // ── Blok NW (x∈[-13,-52], z∈[-13,-37]) ──────────────────────────────────
    // Szkoła (18×10) przy centrum; jej okrąg wykluczenia r≈12.2 → min 18.7j do domu.
    // shop(-14,-14,FE): fasada ku x=0 (wschód) ✓
    this._regCircle(-14, -14, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FE }, this.vehiclePhysics).placeAt(-14, 0, -14));
    // school(-34,-28,FE): dist do shopu 24.4j > 19.4j ✓
    this._regCircle(-34, -28, 18/2, 10/2);
    this._add(new School(this.scene, this.physics, { facing: FE }, this.vehiclePhysics).placeAt(-34, 0, -28));
    // house(-14,-32,FE): wzdłuż x=0 (18j od shopu, 26j od szkoły ✓)
    this._house(P[4], -14, -32, FE, { roofStyle: 'flat' });
    // house(-52,-16,FW): wzdłuż x=-65 (21.6j od szkoły ✓); ścieżka →-X, last tile x=-59.6 > -60.5 ✓
    this._house(P[5], -52, -16, FW, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    // house(-52,-34,FW): 18j od powyższego (19.0j od szkoły ✓)
    this._house(P[6], -52, -34, FW, { roofStyle: 'pitched', hasChimney: true });

    // ── Blok SE (x∈[13,52], z∈[13,37]) ──────────────────────────────────────
    // Symetrycznie do NE względem z=0.
    this._regCircle(14, 14, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, {
      facing: FW, wallColor: 0x98D8C8, roofColor: 0x27AE60, doorColor: 0xF39C12,
    }, this.vehiclePhysics).placeAt(14, 0, 14));
    // house(14,32,FW): wzdłuż x=0 ✓
    this._house(P[7],  14,  32, FW, { roofStyle: 'pitched', hasChimney: true });
    // house(32,14,FN): wzdłuż z=0, fasada ku północy (→z=0) ✓; ścieżka →-Z, last tile z=6.4 > 4.5 ✓
    this._house(P[8],  32,  14, FN, { roofStyle: 'flat', floors: 2 });
    // house(52,24,FE): wzdłuż x=65 ✓
    this._house(P[9],  52,  24, FE, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    // house(34,37,FS): wzdłuż z=50, fasada ku południu (→z=50) ✓; ścieżka →+Z, last tile z=44.6 < 45.5 ✓
    this._house(P[0],  34,  37, FS, { roofStyle: 'pitched' });

    // ── Blok SW (x∈[-13,-52], z∈[13,37]) ────────────────────────────────────
    // Symetrycznie do SE względem x=0.
    this._regCircle(-14, 14, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, {
      facing: FE, wallColor: 0xD5DBDB, roofColor: 0x2C3E50, signColor: 0xE74C3C,
    }, this.vehiclePhysics).placeAt(-14, 0, 14));
    // house(-14,32,FE): wzdłuż x=0 ✓
    this._house(P[1], -14,  32, FE, { roofStyle: 'flat' });
    // house(-32,14,FN): wzdłuż z=0, fasada ku północy ✓
    this._house(P[2], -32,  14, FN, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    // house(-52,24,FW): wzdłuż x=-65, fasada ku zachodowi ✓
    this._house(P[3], -52,  24, FW, { roofStyle: 'pitched', hasChimney: true });
    // house(-34,37,FS): wzdłuż z=50, fasada ku południu ✓
    this._house(P[4], -34,  37, FS, { roofStyle: 'flat', floors: 2 });
  }

  // ─── Przedmieścia północne (z ∈ [-55, -90]) ─────────────────────────────────

  _addNorthSuburbs() {
    const P = HOUSE_PALETTES;

    // Sklep przy E-W północnej (z=-50), strona północna
    this._regCircle( 30, -58, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FS,
      wallColor: 0xF5CBA7, roofColor: 0xCA6F1E,
    }, this.vehiclePhysics).placeAt( 30, 0, -58));
    this._regCircle(-30, -58, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FS,
      wallColor: 0xA9CCE3, roofColor: 0x1A5276,
    }, this.vehiclePhysics).placeAt(-30, 0, -58));

    // Domy NE (x∈[8,58], z∈[-58,-88])
    this._house(P[0],  12, -62, FS, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[1],  24, -68, FS, { roofStyle: 'flat' });
    this._house(P[2],  38, -62, FS, { roofStyle: 'dome' });
    this._house(P[3],  52, -68, FS, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[4],  58, -62, FE, { roofStyle: 'flat', floors: 2 });
    this._house(P[5],  14, -80, FS, { roofStyle: 'pitched' });
    this._house(P[6],  28, -84, FS, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[7],  44, -80, FS, { roofStyle: 'flat' });

    // Domy NW (x∈[-8,-58], z∈[-58,-88])
    this._house(P[8], -12, -62, FS, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[9], -26, -68, FS, { roofStyle: 'dome' });
    this._house(P[0], -40, -62, FS, { roofStyle: 'flat' });
    this._house(P[1], -54, -68, FS, { roofStyle: 'pitched' });
    this._house(P[2], -58, -62, FW, { roofStyle: 'flat', floors: 2 });
    this._house(P[3], -16, -80, FS, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[4], -32, -84, FS, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[5], -48, -80, FS, { roofStyle: 'flat' });
  }

  // ─── Przedmieścia południowe (z ∈ [55, 90]) ─────────────────────────────────

  _addSouthSuburbs() {
    const P = HOUSE_PALETTES;

    // Sklep przy E-W południowej (z=50), strona południowa
    this._regCircle( 28, 58, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FN,
      wallColor: 0xD5F5E3, roofColor: 0x1E8449,
    }, this.vehiclePhysics).placeAt( 28, 0, 58));
    this._regCircle(-28, 58, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FN,
      wallColor: 0xFCF3CF, roofColor: 0xD4AC0D, signColor: 0xCB4335,
    }, this.vehiclePhysics).placeAt(-28, 0, 58));

    // Domy SE (x∈[8,58], z∈[58,88])
    this._house(P[6],  12, 62, FN, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[7],  26, 68, FN, { roofStyle: 'flat' });
    this._house(P[8],  40, 62, FN, { roofStyle: 'dome' });
    this._house(P[9],  54, 68, FN, { roofStyle: 'pitched' });
    this._house(P[0],  58, 62, FE, { roofStyle: 'flat', floors: 2 });
    this._house(P[1],  14, 80, FN, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[2],  30, 84, FN, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[3],  46, 80, FN, { roofStyle: 'flat' });

    // Domy SW (x∈[-8,-58], z∈[58,88])
    this._house(P[4], -12, 62, FN, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[5], -26, 68, FN, { roofStyle: 'dome' });
    this._house(P[6], -40, 62, FN, { roofStyle: 'flat' });
    this._house(P[7], -54, 68, FN, { roofStyle: 'pitched' });
    this._house(P[8], -58, 62, FW, { roofStyle: 'flat', floors: 2 });
    this._house(P[9], -16, 80, FN, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[0], -32, 84, FN, { roofStyle: 'pitched' });
    this._house(P[1], -48, 80, FN, { roofStyle: 'flat' });
  }

  // ─── CBD — dzielnice biznesowe (x > 65 i x < -65) ───────────────────────────

  _addCBD() {
    const P = HOUSE_PALETTES;

    // ── CBD Wschodnie (x∈[70,120]) — odstępy min. 20j między środkami ────────
    this._regCircle( 82, -26, 5, 5);
    this._add(new Skyscraper(this.scene, this.physics, {
      facing: FW, wallColor: 0xB4C8D8, glassColor: 0x3A7BBF, accentColor: 0xFFCC44,
    }, this.vehiclePhysics).placeAt(82, 0, -26));

    // Wieżowiec-blok zamiast klasycznego Skyscraper — prostsza bryła
    this._tower( 82,  26, FW, { h: 30, bodyColor: 0xC8C8C8, glassColor: 0x5588AA });
    // Kamienica z cegły przy CBD
    this._brick(100, -22, FW, { floors: 5, brickColor: 0x8B3A2A });
    this._brick(100,  22, FW, { floors: 4, brickColor: 0x7B5A3A });

    // Sklepy przy x=65
    this._regCircle( 74, -38, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FW }, this.vehiclePhysics).placeAt(74, 0, -38));
    this._regCircle( 74,  38, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FW,
      wallColor: 0xEBDEF0, roofColor: 0x6C3483,
    }, this.vehiclePhysics).placeAt(74, 0, 38));


    // Domy w CBD wschodnim
    this._house(P[2],  78, -40, FW, { roofStyle: 'flat', floors: 2 });
    this._house(P[3],  78,  40, FW, { roofStyle: 'pitched' });
    this._house(P[4], 114, -20, FW, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[5], 114,  20, FW, { roofStyle: 'flat' });

    // ── CBD Zachodnie (x∈[-70,-120]) ───────────────────────────────────────
    this._regCircle(-82, -26, 5, 5);
    this._add(new Skyscraper(this.scene, this.physics, {
      facing: FE, wallColor: 0xC8D8B4, glassColor: 0x3A7A3A, accentColor: 0xFF8844,
    }, this.vehiclePhysics).placeAt(-82, 0, -26));

    this._tower(-82,  26, FE, { h: 28, bodyColor: 0xB8B8D8, glassColor: 0x446688 });
    this._brick(-100, -22, FE, { floors: 5, brickColor: 0x8B3A2A });
    this._brick(-100,  22, FE, { floors: 4, brickColor: 0x5A3A2A });

    // Sklepy przy x=-65
    this._regCircle(-74, -38, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FE }, this.vehiclePhysics).placeAt(-74, 0, -38));
    this._regCircle(-74,  38, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FE,
      wallColor: 0xFDEBD0, roofColor: 0xAF601A,
    }, this.vehiclePhysics).placeAt(-74, 0, 38));


    // Domy w CBD zachodnim
    this._house(P[6], -78, -40, FE, { roofStyle: 'flat', floors: 2 });
    this._house(P[7], -78,  40, FE, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[8],-114, -20, FE, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[9],-114,  20, FE, { roofStyle: 'flat' });
  }

  // ─── Pas środkowy północny (z∈[-95,-55]) ────────────────────────────────────

  _addNorthMidBand() {
    const P = HOUSE_PALETTES;

    // Wewnętrzny pas N-W (x∈[-60,-5])
    this._regCircle(-28, -72, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FS,
      wallColor: 0xF9E4B7, roofColor: 0xB7770D, signColor: 0x2E86C1,
    }, this.vehiclePhysics).placeAt(-28, 0, -72));
    this._house(P[5], -12, -68, FS, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[6], -44, -68, FS, { roofStyle: 'flat', floors: 2 });
    this._house(P[7], -54, -76, FW, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[8], -14, -82, FS, { roofStyle: 'flat' });
    this._house(P[9], -40, -84, FS, { roofStyle: 'pitched', hasChimney: true });

    // Wewnętrzny pas N-E (x∈[5,60])
    this._regCircle( 28, -72, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FS,
      wallColor: 0xD5EAD0, roofColor: 0x1A6B3A, signColor: 0xE74C3C,
    }, this.vehiclePhysics).placeAt( 28, 0, -72));
    this._house(P[0],  12, -68, FS, { roofStyle: 'dome' });
    this._house(P[1],  44, -68, FS, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[2],  54, -76, FE, { roofStyle: 'flat', floors: 2 });
    this._house(P[3],  14, -82, FS, { roofStyle: 'flat' });
    this._house(P[4],  42, -84, FS, { roofStyle: 'dome', w: 4.5, d: 4.5 });

    // Zewnętrzny pas N-W (x∈[-125,-70]) — mix domów i kamienic
    this._brick( -80, -68, FE, { floors: 3, brickColor: 0x8B3A2A });
    this._house(P[4], -96, -74, FE, { roofStyle: 'flat' });
    this._house(P[5],-110, -68, FE, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[6], -82, -86, FN, { roofStyle: 'pitched' });
    this._brick(-104, -84, FN, { floors: 4, brickColor: 0x5A3A2A });

    // Zewnętrzny pas N-E (x∈[70,125]) — mix domów i kamienic
    this._brick(  80, -68, FW, { floors: 3, brickColor: 0x7B4030 });
    this._house(P[9],  94, -74, FW, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[0], 112, -68, FW, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[1],  82, -86, FN, { roofStyle: 'flat' });
    this._brick( 104, -84, FN, { floors: 4, brickColor: 0x8B3A2A });
  }

  // ─── Pas środkowy południowy (z∈[55,95]) ─────────────────────────────────────

  _addSouthMidBand() {
    const P = HOUSE_PALETTES;

    // Wewnętrzny pas S-W (x∈[-60,-5])
    this._regCircle(-28, 72, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FN,
      wallColor: 0xF5CCD4, roofColor: 0x922B21, signColor: 0x1ABC9C,
    }, this.vehiclePhysics).placeAt(-28, 0, 72));
    this._house(P[0], -12, 68, FN, { roofStyle: 'pitched' });
    this._house(P[1], -44, 68, FN, { roofStyle: 'flat', floors: 2 });
    this._house(P[2], -54, 76, FW, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[3], -16, 82, FN, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[4], -42, 84, FN, { roofStyle: 'flat' });

    // Wewnętrzny pas S-E (x∈[5,60])
    this._regCircle( 28, 72, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FN,
      wallColor: 0xD6EAF8, roofColor: 0x1A5276, signColor: 0xF39C12,
    }, this.vehiclePhysics).placeAt( 28, 0, 72));
    this._house(P[5],  12, 68, FN, { roofStyle: 'dome' });
    this._house(P[6],  44, 68, FN, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[7],  54, 76, FE, { roofStyle: 'flat', floors: 2 });
    this._house(P[8],  14, 82, FN, { roofStyle: 'flat' });
    this._house(P[9],  42, 84, FN, { roofStyle: 'dome', w: 4.5, d: 4.5 });

    // Zewnętrzny pas S-W (x∈[-125,-70])
    this._house(P[1], -76, 68, FE, { roofStyle: 'flat' });
    this._house(P[2], -92, 74, FE, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[3],-108, 68, FE, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[4], -80, 84, FS, { roofStyle: 'pitched' });
    this._house(P[5],-104, 82, FS, { roofStyle: 'flat', floors: 2 });

    // Zewnętrzny pas S-E (x∈[70,125])
    this._house(P[6],  76, 68, FW, { roofStyle: 'dome' });
    this._house(P[7],  90, 74, FW, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[8], 112, 68, FW, { roofStyle: 'flat', floors: 2 });
    this._house(P[9],  82, 84, FS, { roofStyle: 'flat' });
    this._house(P[0], 106, 82, FS, { roofStyle: 'pitched' });
  }

  // ─── Daleka północ (z∈[-145,-105]) ───────────────────────────────────────────

  _addFarNorth() {
    const P = HOUSE_PALETTES;

    // Pas W (x∈[-125,-70])
    this._house(P[2], -78,-112, FE, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[3], -96,-118, FE, { roofStyle: 'flat' });
    this._house(P[4],-112,-112, FE, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[5], -82,-132, FS, { roofStyle: 'pitched' });
    this._house(P[6],-106,-130, FS, { roofStyle: 'flat', floors: 2 });

    // Pas IW (x∈[-60,-5])
    this._house(P[7], -14,-112, FS, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[8], -36,-118, FS, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[9], -54,-112, FS, { roofStyle: 'flat', floors: 2 });
    this._house(P[0], -18,-132, FS, { roofStyle: 'flat' });
    this._house(P[1], -46,-128, FS, { roofStyle: 'dome' });

    // Pas IE (x∈[5,60])
    this._house(P[2],  14,-112, FS, { roofStyle: 'pitched' });
    this._house(P[3],  34,-118, FS, { roofStyle: 'flat', floors: 2 });
    this._house(P[4],  56,-112, FS, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[5],  20,-132, FS, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[6],  48,-128, FS, { roofStyle: 'flat' });

    // Pas E (x∈[70,125])
    this._house(P[7],  78,-112, FW, { roofStyle: 'flat', floors: 2 });
    this._house(P[8],  96,-118, FW, { roofStyle: 'dome' });
    this._house(P[9], 112,-112, FW, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[0],  84,-132, FS, { roofStyle: 'flat' });
    this._house(P[1], 108,-128, FS, { roofStyle: 'pitched' });
  }

  // ─── Daleka południe (z∈[105,145]) ───────────────────────────────────────────

  _addFarSouth() {
    const P = HOUSE_PALETTES;

    // Pas W (x∈[-125,-70])
    this._house(P[4], -78, 112, FE, { roofStyle: 'dome' });
    this._house(P[5], -96, 118, FE, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[6],-112, 112, FE, { roofStyle: 'flat', floors: 2 });
    this._house(P[7], -82, 132, FN, { roofStyle: 'pitched' });
    this._house(P[8],-106, 130, FN, { roofStyle: 'flat' });

    // Pas IW (x∈[-60,-5])
    this._house(P[9], -14, 112, FN, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[0], -36, 118, FN, { roofStyle: 'flat', floors: 2 });
    this._house(P[1], -54, 112, FN, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[2], -18, 132, FN, { roofStyle: 'flat' });
    this._house(P[3], -48, 128, FN, { roofStyle: 'pitched' });

    // Pas IE (x∈[5,60])
    this._house(P[4],  14, 112, FN, { roofStyle: 'dome' });
    this._house(P[5],  32, 118, FN, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[6],  54, 112, FN, { roofStyle: 'flat', floors: 2 });
    this._house(P[7],  18, 132, FN, { roofStyle: 'pitched' });
    this._house(P[8],  46, 128, FN, { roofStyle: 'flat' });

    // Pas E (x∈[70,125])
    this._house(P[9],  78, 112, FW, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[0],  96, 118, FW, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[1], 114, 112, FW, { roofStyle: 'flat', floors: 2 });
    this._house(P[2],  82, 132, FN, { roofStyle: 'flat' });
    this._house(P[3], 108, 128, FN, { roofStyle: 'pitched' });
  }

  // ─── Daleki wschód (x∈[135,185]) — dzielnica przemysłowo-CBD ─────────────────

  _addFarEast() {
    const P = HOUSE_PALETTES;

    // Centrum dalekiego wschodu — mix: 1 wieżowiec + TowerBlock + kamienice
    this._regCircle(150, -28, 5, 5);
    this._add(new Skyscraper(this.scene, this.physics, {
      facing: FW, wallColor: 0xE8D5B8, glassColor: 0x8B4513, accentColor: 0xFF6600,
    }, this.vehiclePhysics).placeAt(150, 0, -28));
    this._tower(150,  28, FW, { h: 38, bodyColor: 0xB8D4E8, glassColor: 0x1155AA });
    this._tower(168,   0, FW, { h: 44, bodyColor: 0xC8E8C8, glassColor: 0x228833 });
    // Kamienice czynszowe przy głównej ulicy wschodu
    this._brick(172, -18, FW, { floors: 5, brickColor: 0x8B3A2A });
    this._brick(172,  18, FW, { floors: 4, brickColor: 0x7B5A3A });
    // Trójkątny budynek w polu na dalekim wschodzie — czubek skierowany ku miastu (FE = tip → W)
    // x=200: front fasada x=200, czubek x=150 (od drogi x=130: 15.5j > ROAD_CLEAR ✓)
    this._triOffice(200, -25, FE, { wallColor: 0xECF0EC, glassColor: 0x0A1520 });

    // Sklepy przy x=130
    this._regCircle(140, -38, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FW,
      wallColor: 0xFFF0C8, roofColor: 0xB8860B,
    }, this.vehiclePhysics).placeAt(140, 0, -38));
    this._regCircle(140,  38, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FW,
      wallColor: 0xC8E0FF, roofColor: 0x1A3A6A,
    }, this.vehiclePhysics).placeAt(140, 0,  38));

    // Domy w narożnikach
    this._house(P[4], 142, -78, FW, { roofStyle: 'flat', floors: 2 });
    this._house(P[5], 158, -72, FW, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[6], 172, -78, FW, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[7], 142,  78, FW, { roofStyle: 'flat' });
    this._house(P[8], 158,  72, FW, { roofStyle: 'pitched' });
    this._house(P[9], 172,  78, FW, { roofStyle: 'dome', w: 4.5, d: 4.5 });
  }

  // ─── Daleki zachód (x∈[-135,-185]) — dzielnica artystyczna ───────────────────

  _addFarWest() {
    const P = HOUSE_PALETTES;

    // Centrum dalekiego zachodu — mix: wieżowiec + TowerBlock + kamienice
    this._regCircle(-150, -28, 5, 5);
    this._add(new Skyscraper(this.scene, this.physics, {
      facing: FE, wallColor: 0xE8C8C8, glassColor: 0xAA2222, accentColor: 0x44FFAA,
    }, this.vehiclePhysics).placeAt(-150, 0, -28));
    this._tower(-150,  28, FE, { h: 36, bodyColor: 0xC8E8E8, glassColor: 0x226688 });
    this._tower(-168,   0, FE, { h: 42, bodyColor: 0xE8E0C8, glassColor: 0x887722 });
    // Kamienice z cegły (dzielnica artystyczna)
    this._brick(-172, -18, FE, { floors: 4, brickColor: 0x7B4030, stoneColor: 0xE0D4B8 });
    this._brick(-172,  18, FE, { floors: 5, brickColor: 0x8B3A2A });

    // Trójkątny budynek w polu — czubek skierowany ku miastu (FW = tip → E)
    // x=-200: front x=-200, czubek x=-150 (od drogi x=-130: 15.5j > ROAD_CLEAR ✓)
    this._triOffice(-200, 25, FW, { wallColor: 0xF0ECE8, glassColor: 0x1A0D05 });

    // Sklepy przy x=-130
    this._regCircle(-140, -38, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FE,
      wallColor: 0xFFE8CC, roofColor: 0xA05020,
    }, this.vehiclePhysics).placeAt(-140, 0, -38));
    this._regCircle(-140,  38, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FE,
      wallColor: 0xE0F0DC, roofColor: 0x2E7D32,
    }, this.vehiclePhysics).placeAt(-140, 0,  38));

    // Domy w narożnikach
    this._house(P[0], -142, -78, FE, { roofStyle: 'flat', floors: 2 });
    this._house(P[1], -160, -72, FE, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[2], -172, -78, FE, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[3], -142,  78, FE, { roofStyle: 'flat' });
    this._house(P[4], -160,  72, FE, { roofStyle: 'pitched' });
    this._house(P[5], -172,  78, FE, { roofStyle: 'dome', w: 4.5, d: 4.5 });
  }

  // ─── Daleka-daleka północ (z ∈ [-195,-155]) — nowa dzielnica za drogą z=-150 ───

  _addFarFarNorth() {
    const P = HOUSE_PALETTES;

    // Kościół centralny — obok osi x=0, po wschodniej stronie (x=30 > ROAD_CLEAR+5)
    this._church( 30, -174, FS, { wallColor: 0xD8CEC0, roofColor: 0x7A2828 });

    // Magazyny przemysłowe — przy N-S x=65 i x=-65 (wschodnia i zachodnia strona)
    this._warehouse( 86, -170, FW, { w: 22, h: 6, d: 14, bodyColor: 0xB8BFC8 });
    this._warehouse(-86, -170, FE, { w: 22, h: 6, d: 14, bodyColor: 0xC0BAB0 });

    // Domy — wewnętrzny pas NW (x∈[-60,-5])
    this._house(P[2], -16,-162, FS, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[3], -38,-168, FS, { roofStyle: 'flat', floors: 2 });
    this._house(P[4], -54,-162, FS, { roofStyle: 'dome' });
    this._house(P[5], -20,-182, FS, { roofStyle: 'flat' });
    this._house(P[6], -48,-186, FS, { roofStyle: 'pitched', hasChimney: true });

    // Domy — wewnętrzny pas NE (x∈[5,60])
    this._house(P[7],  16,-162, FS, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[8],  40,-168, FS, { roofStyle: 'pitched' });
    this._house(P[9],  56,-162, FS, { roofStyle: 'flat', floors: 2 });
    this._house(P[0],  18,-182, FS, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[1],  50,-186, FS, { roofStyle: 'dome' });

    // Kamienice — zewnętrzny pas NW (x∈[-125,-70])
    this._brick( -80,-164, FE, { floors: 3, brickColor: 0x7B4030 });
    this._house(P[2],-100,-170, FE, { roofStyle: 'flat' });
    this._house(P[3],-118,-164, FE, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[4], -84,-184, FS, { roofStyle: 'dome', w: 4.5, d: 4.5 });

    // Kamienice — zewnętrzny pas NE (x∈[70,125])
    this._brick(  80,-164, FW, { floors: 3, brickColor: 0x6B3828 });
    this._house(P[5],  98,-170, FW, { roofStyle: 'flat', floors: 2 });
    this._house(P[6], 118,-164, FW, { roofStyle: 'dome' });
    this._house(P[7],  84,-184, FS, { roofStyle: 'pitched' });
  }

  // ─── Daleka-daleka południe (z ∈ [155,195]) ──────────────────────────────────

  _addFarFarSouth() {
    const P = HOUSE_PALETTES;

    // Kościół centralny — obok osi x=0, po zachodniej stronie (x=-30)
    this._church(-30, 174, FN, { wallColor: 0xCED8D0, roofColor: 0x284A28, spireColor: 0x1E3A1E });

    // Magazyny przy bocznych drogach
    this._warehouse( 86, 170, FW, { w: 20, h: 7, d: 16, bodyColor: 0xC4C8B8 });
    this._warehouse(-86, 170, FE, { w: 20, h: 7, d: 16, bodyColor: 0xB8C0C4 });

    // Domy — wewnętrzny pas SW
    this._house(P[8], -16, 162, FN, { roofStyle: 'flat' });
    this._house(P[9], -36, 168, FN, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[0], -54, 162, FN, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[1], -20, 182, FN, { roofStyle: 'flat', floors: 2 });
    this._house(P[2], -48, 186, FN, { roofStyle: 'pitched' });

    // Domy — wewnętrzny pas SE
    this._house(P[3],  16, 162, FN, { roofStyle: 'dome' });
    this._house(P[4],  38, 168, FN, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[5],  56, 162, FN, { roofStyle: 'flat', floors: 2 });
    this._house(P[6],  22, 182, FN, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[7],  50, 186, FN, { roofStyle: 'pitched' });

    // Kamienice — zewnętrzny pas SW
    this._brick( -80, 164, FE, { floors: 4, brickColor: 0x8B4030 });
    this._house(P[8],-100, 170, FE, { roofStyle: 'flat', floors: 2 });
    this._house(P[9],-118, 164, FE, { roofStyle: 'pitched' });
    this._house(P[0], -84, 184, FN, { roofStyle: 'dome' });

    // Kamienice — zewnętrzny pas SE
    this._brick(  80, 164, FW, { floors: 4, brickColor: 0x7B3828 });
    this._house(P[1],  98, 170, FW, { roofStyle: 'flat' });
    this._house(P[2], 118, 164, FW, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[3],  82, 184, FN, { roofStyle: 'dome', w: 4.5, d: 4.5 });
  }

  // ─── Wzgórza — tylko 2, w odległych narożnikach ──────────────────────────────

  _addHills() {
    // ── Wzgórza w narożnikach świata ─────────────────────────────────────────
    // Zasada: dist(cx, każda_droga) > radius + ROAD_CLEAR(4.5) + 2.0
    // Drogi N-S: x=0,±65,±130 | Drogi E-W: z=0,±50,±100
    //
    // NW (-175,-175, r=30): od x=-130 → 45 > 36.5 ✓, od z=-100 → 75 > 36.5 ✓
    this._add(new Hill(this.scene, this.physics,
      { radius: 30, height: 16, color: 0x3a8a15, shape: 'round' },
      this.vehiclePhysics,
    ).placeAt(-175, 0, -175));

    // SE (175,175, r=24): od x=130 → 45 > 30.5 ✓, od z=100 → 75 > 30.5 ✓
    this._add(new Hill(this.scene, this.physics,
      { radius: 24, height: 11, color: 0x4a9a25, shape: 'mesa' },
      this.vehiclePhysics,
    ).placeAt(175, 0, 175));

    // NE (195,-195, r=28): od x=130 → 65 > 34.5 ✓, od z=-100 → 95 > 34.5 ✓
    this._add(new Hill(this.scene, this.physics,
      { radius: 28, height: 14, color: 0x3d9020, shape: 'round' },
      this.vehiclePhysics,
    ).placeAt(195, 0, -195));

    // SW (-195,195, r=26): od x=-130 → 65 > 32.5 ✓, od z=100 → 95 > 32.5 ✓
    this._add(new Hill(this.scene, this.physics,
      { radius: 26, height: 12, color: 0x509525, shape: 'mesa' },
      this.vehiclePhysics,
    ).placeAt(-195, 0, 195));

    // Dodatkowe — głęboko w narożnikach, daleko od wszystkich dróg
    // (-220,220, r=22): od x=-130 → 90 > 28.5 ✓
    this._add(new Hill(this.scene, this.physics,
      { radius: 22, height: 10, color: 0x4a8a1a, shape: 'round' },
      this.vehiclePhysics,
    ).placeAt(-220, 0, 220));

    // (220,-220, r=20): od x=130 → 90 > 26.5 ✓
    this._add(new Hill(this.scene, this.physics,
      { radius: 20, height: 9, color: 0x558a2a, shape: 'mesa' },
      this.vehiclePhysics,
    ).placeAt(220, 0, -220));
  }

  // ─── Drzewa ─────────────────────────────────────────────────────────────────
  // Każda pozycja jest walidowana przez isSafePoint — błędne pomijane z ostrzeżeniem.

  _addTrees() {
    const positions = [
      // ── Przy głównym skrzyżowaniu ─────────────────────────────────────
      [ -8, -8], [  8, -8], [ -8,  8], [  8,  8],
      [-16,-16], [ 16,-16], [-16, 16], [ 16, 16],

      // ── Wzdłuż N-S main ───────────────────────────────────────────────
      [ -8,-25], [  8,-25], [ -8, 25], [  8, 25],
      [ -8,-35], [  8,-35], [ -8, 35], [  8, 35],

      // ── Blok NE ───────────────────────────────────────────────────────
      [ 28,-20], [ 44,-20], [ 44,-34], [ 30,-38],

      // ── Blok NW ───────────────────────────────────────────────────────
      [-28,-20], [-44,-20], [-44,-34], [-30,-38],

      // ── Blok SE ───────────────────────────────────────────────────────
      [ 28, 20], [ 44, 20], [ 44, 34], [ 30, 38],

      // ── Blok SW ───────────────────────────────────────────────────────
      [-28, 20], [-44, 20], [-44, 34], [-30, 38],

      // ── Przy E-W północnej (z=-50) ────────────────────────────────────
      [-52,-40], [-38,-40], [-18,-40], [ 18,-40], [ 38,-40], [ 52,-40],
      [-52,-60], [-38,-60], [-18,-60], [ 18,-60], [ 38,-60], [ 52,-60],

      // ── Przy E-W południowej (z=50) ───────────────────────────────────
      [-52, 40], [-38, 40], [-18, 40], [ 18, 40], [ 38, 40], [ 52, 40],
      [-52, 60], [-38, 60], [-18, 60], [ 18, 60], [ 38, 60], [ 52, 60],

      // ── Przedmieścia N ───────────────────────────────────────────────
      [-18,-70], [ 18,-70], [-18,-84], [ 18,-84],
      [-36,-74], [ 36,-74], [-50,-74], [ 50,-74],

      // ── Przedmieścia S ───────────────────────────────────────────────
      [-18, 70], [ 18, 70], [-18, 84], [ 18, 84],
      [-36, 74], [ 36, 74], [-50, 74], [ 50, 74],

      // ── Przy N-S wschodniej (x=65) ────────────────────────────────────
      [ 56,-28], [ 56, 28], [ 74,-28], [ 74, 28],
      [ 56,-42], [ 56, 42], [ 74,-42], [ 74, 42],

      // ── Przy N-S zachodniej (x=-65) ───────────────────────────────────
      [-56,-28], [-56, 28], [-74,-28], [-74, 28],
      [-56,-42], [-56, 42], [-74,-42], [-74, 42],

      // ── Dzielnica wschodnia ───────────────────────────────────────────
      [110,-38], [110, 38], [110,-16], [110, 16],

      // ── Dzielnica zachodnia ───────────────────────────────────────────
      [-110,-38],[-110, 38],[-110,-16],[-110, 16],

      // ── Pas środkowy północny (z≈-70 do -85) ─────────────────────────
      [-52,-70],[-38,-70],[-18,-70],[ 18,-70],[ 38,-70],[ 52,-70],
      [-52,-86],[-38,-86],[-18,-86],[ 18,-86],[ 38,-86],[ 52,-86],
      [-88,-70],[-88,-84],[-104,-76],[ 88,-70],[ 88,-84],[ 104,-76],

      // ── Pas środkowy południowy (z≈70 do 86) ─────────────────────────
      [-52, 70],[-38, 70],[-18, 70],[ 18, 70],[ 38, 70],[ 52, 70],
      [-52, 86],[-38, 86],[-18, 86],[ 18, 86],[ 38, 86],[ 52, 86],
      [-88, 70],[-88, 84],[-104, 76],[ 88, 70],[ 88, 84],[ 104, 76],

      // ── Wzdłuż nowych dróg E-W z=±100 ────────────────────────────────
      [-120,-94],[-90,-94],[-52,-94],[-18,-94],[ 18,-94],[ 52,-94],[ 90,-94],[120,-94],
      [-120,-106],[-90,-106],[-52,-106],[-18,-106],[ 18,-106],[ 52,-106],[ 90,-106],[120,-106],
      [-120, 94],[-90, 94],[-52, 94],[-18, 94],[ 18, 94],[ 52, 94],[ 90, 94],[120, 94],
      [-120, 106],[-90, 106],[-52, 106],[-18, 106],[ 18, 106],[ 52, 106],[ 90, 106],[120, 106],

      // ── Wzdłuż nowych dróg N-S x=±130 ────────────────────────────────
      [124,-80],[124,-60],[124,-26],[124, 26],[124, 60],[124, 80],
      [136,-80],[136,-60],[136,-26],[136, 26],[136, 60],[136, 80],
      [-124,-80],[-124,-60],[-124,-26],[-124, 26],[-124, 60],[-124, 80],
      [-136,-80],[-136,-60],[-136,-26],[-136, 26],[-136, 60],[-136, 80],

      // ── Daleka północ (z≈-115 do -135) ───────────────────────────────
      [-52,-116],[-18,-116],[ 18,-116],[ 52,-116],
      [-52,-132],[-18,-132],[ 18,-132],[ 52,-132],
      [-92,-118],[-92,-130],[ 92,-118],[ 92,-130],

      // ── Daleka południe ───────────────────────────────────────────────
      [-52, 116],[-18, 116],[ 18, 116],[ 52, 116],
      [-52, 132],[-18, 132],[ 18, 132],[ 52, 132],
      [-92, 118],[-92, 130],[ 92, 118],[ 92, 130],

      // ── Daleki wschód ─────────────────────────────────────────────────
      [144,-56],[144, 56],[160,-40],[160, 40],[178,-56],[178, 56],

      // ── Daleki zachód ─────────────────────────────────────────────────
      [-144,-56],[-144, 56],[-160,-40],[-160, 40],[-178,-56],[-178, 56],
    ];

    positions.forEach(([x, z]) => {
      // treeR=2.5 — sprawdź czy nie koliduje z drogą, budynkiem LUB innym drzewem/lampą
      if (!this._isFreeForTree(x, z, 2.5)) return;
      const scale = 0.7 + rand() * 0.65;
      this._add(new Tree(this.scene, this.physics,
        { trunkH: 3.0 * scale, trunkR: 0.22 * scale, leavesR: 2.0 * scale },
        this.vehiclePhysics,
      ).placeAt(x, 0, z));
      // Zarejestruj drzewo w _circles — następne drzewa i lampy go ominą
      this._regCircle(x, z, 1.8, 1.8, 0.8);  // efektywny promień ≈ 3.3j
    });
  }

  // ─── Latarnie ────────────────────────────────────────────────────────────────

  _addStreetLamps() {
    const SWH = 0.10;
    // Format: [x, z, rotY]
    // Latarnie stoją NA TRAWIE, za zewnętrzną krawędzią chodnika (±4.5j od osi).
    // N-S: x = ±5.0 (krawędź chodnika ±4.5), E-W: z = ±55.5 / ±44.5
    const lamps = [
      // ── Główny krzyż (N-S x=0, E-W z=0) — za chodnikiem (x=±5, z=±5)
      // N-S road: x>0 → arm -X → FS; x<0 → arm +X → FN ✓
      [  5,-16, FS], [ -5,-16, FN], [  5, 16, FS], [ -5, 16, FN],
      // E-W road: z>0 (south) → arm -Z → FW; z<0 (north) → arm +Z → FE ✓
      [-16,  5, FW], [-16, -5, FE], [ 16,  5, FW], [ 16, -5, FE],
      // ── N-S main (x=0), północ i południe
      [  5,-28,FS],[-5,-28,FN],[  5,-40,FS],[-5,-40,FN],
      [  5,-62,FS],[-5,-62,FN],[  5,-76,FS],[-5,-76,FN],[  5,-90,FS],[-5,-90,FN],
      [  5, 28,FS],[-5, 28,FN],[  5, 40,FS],[-5, 40,FN],
      [  5, 62,FS],[-5, 62,FN],[  5, 76,FS],[-5, 76,FN],
      // ── E-W północna (z=-50) — z=-44.5 to strona S (z>-50) → arm -Z → FW; z=-55.5 strona N → FE
      [-55,-44.5,FW],[-35,-44.5,FW],[-18,-44.5,FW],[18,-44.5,FW],[35,-44.5,FW],[55,-44.5,FW],
      [-55,-55.5,FE],[-35,-55.5,FE],[-18,-55.5,FE],[18,-55.5,FE],[35,-55.5,FE],[55,-55.5,FE],
      // ── E-W południowa (z=50)
      [-55, 44.5,FE],[-35, 44.5,FE],[-18, 44.5,FE],[18, 44.5,FE],[35, 44.5,FE],[55, 44.5,FE],
      [-55, 55.5,FW],[-35, 55.5,FW],[-18, 55.5,FW],[18, 55.5,FW],[35, 55.5,FW],[55, 55.5,FW],
      // ── N-S wschodnia (x=65) — x=60 (str. W, x<65) → arm +X → FN; x=70 (str. E) → arm -X → FS
      [60,-20,FN],[70,-20,FS],[60,-40,FN],[70,-40,FS],[60,-62,FN],[70,-62,FS],[60,-80,FN],[70,-80,FS],
      [60, 20,FN],[70, 20,FS],[60, 40,FN],[70, 40,FS],[60, 62,FN],[70, 62,FS],[60, 80,FN],[70, 80,FS],
      // ── N-S zachodnia (x=-65) — x=-60 (str. E, x>-65) → arm -X → FS; x=-70 (str. W) → arm +X → FN
      [-60,-20,FS],[-70,-20,FN],[-60,-40,FS],[-70,-40,FN],[-60,-62,FS],[-70,-62,FN],[-60,-80,FS],[-70,-80,FN],
      [-60, 20,FS],[-70, 20,FN],[-60, 40,FS],[-70, 40,FN],[-60, 62,FS],[-70, 62,FN],[-60, 80,FS],[-70, 80,FN],

      // ── E-W daleka N (z=-100) — z=-94.5 str. S → FW; z=-105.5 str. N → FE
      [-120,-94.5,FW],[-90,-94.5,FW],[-52,-94.5,FW],[-18,-94.5,FW],[18,-94.5,FW],[52,-94.5,FW],[90,-94.5,FW],[120,-94.5,FW],
      [-120,-105.5,FE],[-90,-105.5,FE],[-52,-105.5,FE],[-18,-105.5,FE],[18,-105.5,FE],[52,-105.5,FE],[90,-105.5,FE],[120,-105.5,FE],
      // ── E-W daleka S (z=100) — z=94.5 str. N → FE; z=105.5 str. S → FW
      [-120,94.5,FE],[-90,94.5,FE],[-52,94.5,FE],[-18,94.5,FE],[18,94.5,FE],[52,94.5,FE],[90,94.5,FE],[120,94.5,FE],
      [-120,105.5,FW],[-90,105.5,FW],[-52,105.5,FW],[-18,105.5,FW],[18,105.5,FW],[52,105.5,FW],[90,105.5,FW],[120,105.5,FW],

      // ── N-S dalsza E (x=130) — x=124.5 str. W → FN; x=135.5 str. E → FS
      [124.5,-80,FN],[135.5,-80,FS],[124.5,-60,FN],[135.5,-60,FS],
      [124.5,-26,FN],[135.5,-26,FS],[124.5, 26,FN],[135.5, 26,FS],
      [124.5, 60,FN],[135.5, 60,FS],[124.5, 80,FN],[135.5, 80,FS],
      // ── N-S dalsza W (x=-130) — x=-124.5 str. E → FS; x=-135.5 str. W → FN
      [-124.5,-80,FS],[-135.5,-80,FN],[-124.5,-60,FS],[-135.5,-60,FN],
      [-124.5,-26,FS],[-135.5,-26,FN],[-124.5, 26,FS],[-135.5, 26,FN],
      [-124.5, 60,FS],[-135.5, 60,FN],[-124.5, 80,FS],[-135.5, 80,FN],

      // ── Wzdłuż N-S main (x=0), daleka północ i południe
      [5,-95,FS],[-5,-95,FN],[5,-110,FS],[-5,-110,FN],[5,-130,FS],[-5,-130,FN],
      [5, 95,FS],[-5, 95,FN],[5, 110,FS],[-5, 110,FN],[5, 130,FS],[-5, 130,FN],
      // daleka-daleka: z=±150 do z=±180
      [5,-148,FS],[-5,-148,FN],[5,-162,FS],[-5,-162,FN],[5,-178,FS],[-5,-178,FN],
      [5, 148,FS],[-5, 148,FN],[5, 162,FS],[-5, 162,FN],[5, 178,FS],[-5, 178,FN],

      // ── E-W z=0 — pełne pokrycie (było tylko ±16, droga sięga ±200) ──────────
      [-35, 5,FW],[-35,-5,FE],[35, 5,FW],[35,-5,FE],
      [-55, 5,FW],[-55,-5,FE],[55, 5,FW],[55,-5,FE],
      [-90, 5,FW],[-90,-5,FE],[90, 5,FW],[90,-5,FE],
      [-110, 5,FW],[-110,-5,FE],[110, 5,FW],[110,-5,FE],

      // ── N-S x=±65 — przedłużenie od z=±80 do z=±145 ─────────────────────────
      [60,-100,FN],[70,-100,FS],[60,-120,FN],[70,-120,FS],[60,-140,FN],[70,-140,FS],
      [60, 100,FN],[70, 100,FS],[60, 120,FN],[70, 120,FS],[60, 140,FN],[70, 140,FS],
      [-60,-100,FS],[-70,-100,FN],[-60,-120,FS],[-70,-120,FN],[-60,-140,FS],[-70,-140,FN],
      [-60, 100,FS],[-70, 100,FN],[-60, 120,FS],[-70, 120,FN],[-60, 140,FS],[-70, 140,FN],

      // ── N-S x=±130 — przedłużenie od z=±80 do z=±145 ────────────────────────
      [124.5,-100,FN],[135.5,-100,FS],[124.5,-120,FN],[135.5,-120,FS],[124.5,-140,FN],[135.5,-140,FS],
      [124.5, 100,FN],[135.5, 100,FS],[124.5, 120,FN],[135.5, 120,FS],[124.5, 140,FN],[135.5, 140,FS],
      [-124.5,-100,FS],[-135.5,-100,FN],[-124.5,-120,FS],[-135.5,-120,FN],[-124.5,-140,FS],[-135.5,-140,FN],
      [-124.5, 100,FS],[-135.5, 100,FN],[-124.5, 120,FS],[-135.5, 120,FN],[-124.5, 140,FS],[-135.5, 140,FN],

      // ── E-W z=±150 — nowe drogi ───────────────────────────────────────────────
      [-120,-144.5,FW],[-90,-144.5,FW],[-52,-144.5,FW],[-18,-144.5,FW],
      [18,-144.5,FW],[52,-144.5,FW],[90,-144.5,FW],[120,-144.5,FW],
      [-120,-155.5,FE],[-90,-155.5,FE],[-52,-155.5,FE],[-18,-155.5,FE],
      [18,-155.5,FE],[52,-155.5,FE],[90,-155.5,FE],[120,-155.5,FE],
      [-120,144.5,FE],[-90,144.5,FE],[-52,144.5,FE],[-18,144.5,FE],
      [18,144.5,FE],[52,144.5,FE],[90,144.5,FE],[120,144.5,FE],
      [-120,155.5,FW],[-90,155.5,FW],[-52,155.5,FW],[-18,155.5,FW],
      [18,155.5,FW],[52,155.5,FW],[90,155.5,FW],[120,155.5,FW],
    ];

    lamps.forEach(([x, z, rotY]) => {
      // Sprawdź czy nie koliduje z drzewem, budynkiem lub inną lampą
      if (!this._isFreeForTree(x, z, 1.5)) return;
      const lamp = new StreetLamp(this.scene, this.physics, this.vehiclePhysics).placeAt(x, SWH, z, rotY);
      this._add(lamp);
      this.knockableLamps.push(lamp);
      // Zarejestruj lampę — kolejne obiekty jej ominą
      this._regCircle(x, z, 0.5, 0.5, 1.0);  // efektywny promień ≈ 1.7j
    });
  }

  // ─── Samochody ───────────────────────────────────────────────────────────────

  _addCars() {
    const defs = [
      // Centrum
      { x:  -2, z:  26, facing:  0,            color: 0xFF4444 },
      { x:   2, z:  18, facing:  Math.PI,      color: 0x4488FF },
      { x:  18, z:  -2, facing: -Math.PI / 2,  color: 0x44CC44 },
      { x: -18, z:   2, facing:  Math.PI / 2,  color: 0xFFAA00 },
      // Przedmieścia N / S
      { x:   2, z: -70, facing:  0,            color: 0xCC44AA },
      { x:  -2, z:  70, facing:  Math.PI,      color: 0x44CCCC },
      // CBD E / W
      { x:  80, z:   2, facing: -Math.PI / 2,  color: 0xFFDD44 },
      { x: -80, z:  -2, facing:  Math.PI / 2,  color: 0x884422 },
      // Pas środkowy
      { x:  80, z: -70, facing:  0,            color: 0x22AA66 },
      { x: -80, z:  70, facing:  Math.PI,      color: 0xAA6622 },
      // Daleki wschód / zachód
      { x: 148, z:   2, facing: -Math.PI / 2,  color: 0x5544BB },
      { x:-148, z:  -2, facing:  Math.PI / 2,  color: 0xBB4455 },
    ];
    defs.forEach(({ x, z, facing, color }) => {
      const car = new Car(this.scene, color);
      car.facing = facing;
      car.root.rotation.y = facing;
      car.initPhysics(this.vehiclePhysics, this.physics, x, 0, z);
      this.cars.push(car);
    });
  }

  // ─── Granice ─────────────────────────────────────────────────────────────────

  _addBoundaries() {
    // Wzgórza sięgają do ~210+30=240. Granice przy ±310.
    const E = 312, H = 5, W = 320;
    [
      [   0, H, -E,  W, H,  1],
      [   0, H,  E,  W, H,  1],
      [ -E,  H,  0,  1, H,  W],
      [  E,  H,  0,  1, H,  W],
    ].forEach(([x, y, z, hw, hh, hd]) => {
      this.physics.addStaticBox(x, y, z, hw, hh, hd);
      this.vehiclePhysics.addStaticBox(x, y, z, hw, hh, hd);
    });
  }
}

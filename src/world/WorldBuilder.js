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
    this._swCanvas      = makeSidewalkCanvas(); // jeden canvas dla wszystkich chodników
  }

  build() {
    this._addGround();
    this._addRoads();
    this._addCentreBlocks();
    this._addNorthSuburbs();
    this._addSouthSuburbs();
    this._addCBD();
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

  // Skrótowy helper — dom z paletą
  _house(pal, x, z, facing, opts = {}) {
    const w = opts.w ?? 6, d = opts.d ?? 8;
    this._regCircle(x, z, w / 2, d / 2);
    return this._add(new House(this.scene, this.physics, {
      wallColor: pal.wall,
      roofColor: pal.roof,
      doorColor: pal.door,
      trimColor:  pal.trim,
      facing,
      ...opts,
    }, this.vehiclePhysics).placeAt(x, 0, z));
  }

  // ─── Podłoże ────────────────────────────────────────────────────────────────

  _addGround() {
    // Ground jest zawsze widoczny — nie trafia do listy cullingowej
    new Ground(this.scene, this.physics, this.vehiclePhysics, 320);
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
          const sw = new THREE.Mesh(new THREE.BoxGeometry(len, SWH, SWW),
            makeSidewalkMat(this._swCanvas, len, SWW));
          sw.position.set(cx, SWH / 2, swZ);
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
          const sw = new THREE.Mesh(new THREE.BoxGeometry(SWW, SWH, len),
            makeSidewalkMat(this._swCanvas, SWW, len));
          sw.position.set(swX, SWH / 2, cz);
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
    // Główny krzyż (x=0, z=0) jest w Ground.js — tu dodajemy pozostałe 4 drogi.
    this._road({ axis: 'z', center: -50 });
    this._road({ axis: 'z', center:  50 });
    this._road({ axis: 'x', center:  65 });
    this._road({ axis: 'x', center: -65 });
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
              new THREE.BoxGeometry(SWW, SWH, SWW),
              makeSidewalkMat(this._swCanvas, SWW, SWW),
            );
            corner.position.set(cx, SWH / 2, cz);
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

  _addCentreBlocks() {
    const P = HOUSE_PALETTES;

    // ── Blok NE — sklepy + domy (x∈[8,58], z∈[-8,-44]) ─────────────────────
    // Sklepy wzdłuż N-S main (fasada na zachód, FW)
    this._regCircle(10, -12, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FW }, this.vehiclePhysics).placeAt(10, 0, -12));
    this._regCircle(10, -26, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FW,
      wallColor: 0xFAD7A0, roofColor: 0xE67E22, signColor: 0x8E44AD,
    }, this.vehiclePhysics).placeAt(10, 0, -26));
    // Domy w głębi
    this._house(P[0],  22, -14, FW, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[1],  35, -14, FW, { roofStyle: 'flat', floors: 2 });
    this._house(P[2],  48, -14, FW, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[3],  54, -28, FE, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[4],  54, -40, FE, { roofStyle: 'flat' });
    this._house(P[5],  38, -40, FS, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[6],  24, -40, FS, { roofStyle: 'pitched' });
    this._house(P[7],  12, -40, FS, { roofStyle: 'flat', floors: 2 });

    // ── Blok NW — szkoła + domy (x∈[-8,-58], z∈[-8,-44]) ───────────────────
    // Szkoła: fasada FE (wschód, w stronę centrum)
    this._regCircle(-34, -28, 18/2, 10/2);
    this._add(new School(this.scene, this.physics, { facing: FE }, this.vehiclePhysics).placeAt(-34, 0, -28));
    // Sklep przy N-S main
    this._regCircle(-10, -12, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FE }, this.vehiclePhysics).placeAt(-10, 0, -12));
    // Domy
    this._house(P[8], -22, -14, FE, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[9], -54, -28, FW, { roofStyle: 'flat', floors: 2 });
    this._house(P[0], -54, -40, FW, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[1], -38, -40, FS, { roofStyle: 'pitched' });
    this._house(P[2], -24, -40, FS, { roofStyle: 'flat' });
    this._house(P[3], -12, -40, FS, { roofStyle: 'dome' });

    // ── Blok SE — domy (x∈[8,58], z∈[8,44]) ────────────────────────────────
    this._regCircle(10, 12, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FW,
      wallColor: 0x98D8C8, roofColor: 0x27AE60, doorColor: 0xF39C12,
    }, this.vehiclePhysics).placeAt(10, 0, 12));
    this._house(P[4],  22,  14, FW, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[5],  35,  14, FW, { roofStyle: 'dome' });
    this._house(P[6],  48,  14, FW, { roofStyle: 'flat', floors: 2 });
    this._house(P[7],  54,  28, FE, { roofStyle: 'pitched' });
    this._house(P[8],  54,  40, FE, { roofStyle: 'flat' });
    this._house(P[9],  38,  40, FN, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[0],  24,  40, FN, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[1],  12,  40, FN, { roofStyle: 'flat' });

    // ── Blok SW — domy (x∈[-8,-58], z∈[8,44]) ──────────────────────────────
    this._regCircle(-10, 12, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FE,
      wallColor: 0xD5DBDB, roofColor: 0x2C3E50, signColor: 0xE74C3C,
    }, this.vehiclePhysics).placeAt(-10, 0, 12));
    this._house(P[2], -22,  14, FE, { roofStyle: 'pitched' });
    this._house(P[3], -35,  14, FE, { roofStyle: 'dome', w: 4.5, d: 4.5 });
    this._house(P[4], -48,  14, FE, { roofStyle: 'flat', floors: 2 });
    this._house(P[5], -54,  28, FW, { roofStyle: 'pitched', hasChimney: true });
    this._house(P[6], -54,  40, FW, { roofStyle: 'dome' });
    this._house(P[7], -38,  40, FN, { roofStyle: 'pitched' });
    this._house(P[8], -24,  40, FN, { roofStyle: 'flat' });
    this._house(P[9], -12,  40, FN, { roofStyle: 'dome', w: 4.5, d: 4.5 });
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

    this._regCircle( 82,  26, 5, 5);
    this._add(new Skyscraper(this.scene, this.physics, {
      facing: FW, wallColor: 0xC8C8C8, glassColor: 0x5588AA, accentColor: 0xFF4444,
    }, this.vehiclePhysics).placeAt(82, 0,  26));

    this._regCircle(100, -14, 5, 5);
    this._add(new Skyscraper(this.scene, this.physics, {
      facing: FW, wallColor: 0xD4C8A8, glassColor: 0x4A8844, accentColor: 0xFFAA00,
    }, this.vehiclePhysics).placeAt(100, 0, -14));

    this._regCircle(100,  14, 5, 5);
    this._add(new Skyscraper(this.scene, this.physics, {
      facing: FW, wallColor: 0xE8E0D0, glassColor: 0x2255AA, accentColor: 0xFFDD00,
    }, this.vehiclePhysics).placeAt(100, 0,  14));

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

    this._regCircle(-82,  26, 5, 5);
    this._add(new Skyscraper(this.scene, this.physics, {
      facing: FE, wallColor: 0xB8B8D8, glassColor: 0x446688, accentColor: 0x44FFAA,
    }, this.vehiclePhysics).placeAt(-82, 0,  26));

    this._regCircle(-100, -14, 5, 5);
    this._add(new Skyscraper(this.scene, this.physics, {
      facing: FE, wallColor: 0xD0C0B8, glassColor: 0x884422, accentColor: 0x44DDFF,
    }, this.vehiclePhysics).placeAt(-100, 0, -14));

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

  // ─── Wzgórza — tylko 2, w odległych narożnikach ──────────────────────────────

  _addHills() {
    // Narożnik NW — sprawdzone: |cx|, |cx+65|, |cx-65|, |cz|, |cz+50|, |cz-50| ≫ r+4.5
    this._add(new Hill(this.scene, this.physics,
      { radius: 30, height: 16, color: 0x3a8a15, shape: 'round' },
      this.vehiclePhysics,
    ).placeAt(-145, 0, -145));

    // Narożnik SE
    this._add(new Hill(this.scene, this.physics,
      { radius: 24, height: 11, color: 0x4a9a25, shape: 'mesa' },
      this.vehiclePhysics,
    ).placeAt(148, 0, 148));
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
    ];

    positions.forEach(([x, z]) => {
      if (!this._isFreeForTree(x, z)) {
        console.warn(`WorldBuilder: drzewo (${x},${z}) koliduje z drogą lub budynkiem — pominięte`);
        return;
      }
      const scale = 0.7 + rand() * 0.65;
      this._add(new Tree(this.scene, this.physics,
        { trunkH: 1.5 * scale, leavesR: scale },
        this.vehiclePhysics,
      ).placeAt(x, 0, z));
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
      [  5,-16, FS], [ -5,-16, FN], [  5, 16, FS], [ -5, 16, FN],
      [-16,  5, FE], [-16, -5, FW], [ 16,  5, FE], [ 16, -5, FW],
      // ── N-S main (x=0), północ i południe
      [  5,-28,FS],[-5,-28,FN],[  5,-40,FS],[-5,-40,FN],
      [  5,-62,FS],[-5,-62,FN],[  5,-76,FS],[-5,-76,FN],[  5,-90,FS],[-5,-90,FN],
      [  5, 28,FS],[-5, 28,FN],[  5, 40,FS],[-5, 40,FN],
      [  5, 62,FS],[-5, 62,FN],[  5, 76,FS],[-5, 76,FN],
      // ── E-W północna (z=-50) — za chodnikiem z=-44.5 (str. S) i z=-55.5 (str. N)
      [-55,-44.5,FE],[-35,-44.5,FE],[-18,-44.5,FE],[18,-44.5,FE],[35,-44.5,FE],[55,-44.5,FE],
      [-55,-55.5,FW],[-35,-55.5,FW],[-18,-55.5,FW],[18,-55.5,FW],[35,-55.5,FW],[55,-55.5,FW],
      // ── E-W południowa (z=50)
      [-55, 44.5,FE],[-35, 44.5,FE],[-18, 44.5,FE],[18, 44.5,FE],[35, 44.5,FE],[55, 44.5,FE],
      [-55, 55.5,FW],[-35, 55.5,FW],[-18, 55.5,FW],[18, 55.5,FW],[35, 55.5,FW],[55, 55.5,FW],
      // ── N-S wschodnia (x=65) — za chodnikiem x=60 (str. W) i x=70 (str. E)
      [60,-20,FW],[70,-20,FE],[60,-40,FW],[70,-40,FE],[60,-62,FW],[70,-62,FE],[60,-80,FW],[70,-80,FE],
      [60, 20,FW],[70, 20,FE],[60, 40,FW],[70, 40,FE],[60, 62,FW],[70, 62,FE],[60, 80,FW],[70, 80,FE],
      // ── N-S zachodnia (x=-65)
      [-60,-20,FW],[-70,-20,FE],[-60,-40,FW],[-70,-40,FE],[-60,-62,FW],[-70,-62,FE],[-60,-80,FW],[-70,-80,FE],
      [-60, 20,FW],[-70, 20,FE],[-60, 40,FW],[-70, 40,FE],[-60, 62,FW],[-70, 62,FE],[-60, 80,FW],[-70, 80,FE],
    ];

    lamps.forEach(([x, z, rotY]) => {
      this._add(new StreetLamp(this.scene, this.physics, this.vehiclePhysics).placeAt(x, SWH, z, rotY));
    });
  }

  // ─── Samochody ───────────────────────────────────────────────────────────────

  _addCars() {
    const defs = [
      { x:  -2, z:  26, facing:  0,            color: 0xFF4444 },
      { x:   2, z:  18, facing:  Math.PI,      color: 0x4488FF },
      { x:  18, z:  -2, facing: -Math.PI / 2,  color: 0x44CC44 },
      { x: -18, z:   2, facing:  Math.PI / 2,  color: 0xFFAA00 },
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
    // Wzgórza sięgają do ~148+30=178. Granice przy ±185.
    const E = 186, H = 5, W = 192;
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

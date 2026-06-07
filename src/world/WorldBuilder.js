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
import { Ground, makeSidewalkCanvas, makeSidewalkMat, SIDEWALK_H } from '../objects/Ground.js';
import { House, HOUSE_PALETTES }  from '../objects/House.js';
import { Shop }                   from '../objects/Shop.js';
import { School }                 from '../objects/School.js';
import { Skyscraper }             from '../objects/Skyscraper.js';
import { BrickBuilding }          from '../objects/BrickBuilding.js';
import { TowerBlock }             from '../objects/TowerBlock.js';
import { TriOffice }             from '../objects/TriOffice.js';
import { Church }                 from '../objects/Church.js';
import { Warehouse }              from '../objects/Warehouse.js';
import { PoppyFactory }           from '../objects/PoppyFactory.js';
import { Ladder }                 from '../entities/Ladder.js';
import { Hill }                   from '../objects/Hill.js';
import { Tree }                   from '../objects/Tree.js';
import { StreetLamp }             from '../objects/StreetLamp.js';
import { Motorcycle }             from '../objects/Motorcycle.js';
import { Helipad }               from '../objects/Helipad.js';
import { Car }                    from '../entities/Car.js';
import { NPC }                    from '../entities/NPC.js';
import { Dog, Cat }               from '../entities/Animal.js';
import { UFO }                    from '../entities/UFO.js';
import { Airplane }               from '../entities/Airplane.js';
import { Helicopter }             from '../entities/Helicopter.js';
import { FighterJet }             from '../entities/FighterJet.js';
import { Bomber }                 from '../entities/Bomber.js';
import { Airport }                from '../objects/Airport.js';
import { Soldier }               from '../entities/Soldier.js';
import { PanelBlock }             from '../objects/PanelBlock.js';
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
    this.buildings      = [];  // domy z hasInterior=true — do interakcji E
    this.ladders        = [];  // drabinki na dachy
    this.npcs           = [];  // NPC + animals — aktualizowane co klatkę przez Game.js
    this.ufos           = [];  // autonomiczne pojazdy latające
    this.airplanes      = [];  // samoloty — do wsiadania
    this.helicopters    = [];  // helikoptery — do wsiadania
    this.jets           = [];  // myśliwce — do wsiadania
    this.bombers        = [];  // bombowce — do wsiadania
    this._circles       = []; // exclusion circles (z marginem) — budynki, drzewa omijają je
    this._npcObstacles  = []; // fizyczne kontury budynków/drzew bez marginu — dla NPCów
    this.soldiers       = [];  // żołnierze pilnujący lotniska
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
    this._addNewNorthEstate();
    this._addNewSouthEstate();
    this._addPanelEstate();
    this._addPoppyFactory();
    this._addRoofLadders();
    this._addHills();
    this._addTrees();
    this._addStreetLamps();
    this._addCars();
    this._addMotorcycles();
    this._addUFOs();
    this._addAirplanes();
    this._addAirport();
    this._addNPCs();
    this._addAnimals();
    this._addBoundaries();
    return this;
  }

  _add(obj) { this.objects.push(obj); return obj; }

  /**
   * Postaw drabinkę przemysłową i zarejestruj ją do interakcji E.
   * @param {number} x, y, z   pozycja podstawy drabinki w świecie
   * @param {number} height    wysokość drabinki
   * @param {number} facingY   kierunek "na zewnątrz" (skąd gracz podchodzi)
   */
  _addLadder(x, y, z, height, facingY = 0) {
    const lad = new Ladder(this.scene, x, y, z, height, facingY);
    this.ladders.push(lad);
    return lad;
  }

  /** Zarejestruj okrąg wykluczenia (hw, hd = półwymiary prostokąta). */
  _regCircle(cx, cz, hw, hd, margin = 1.5) {
    const physR = Math.hypot(hw, hd);
    this._circles.push({ cx, cz, r: physR + margin });
    // Fizyczny kontur (bez marginu) — NPCy mogą przechodzić między budynkami
    this._npcObstacles.push({ cx, cz, r: physR });
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
    const h = new House(this.scene, this.physics, {
      wallColor: pal.wall,
      roofColor: pal.roof,
      doorColor: pal.door,
      trimColor:  pal.trim,
      facing,
      ...opts,
    }, this.vehiclePhysics).placeAt(x, 0, z);
    this.buildings.push(h);
    return this._add(h);
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

  // Rozmiar boku terenu [j.ś.] — JEDYNE miejsce gdzie zmienia się wielkość świata.
  // _addBoundaries() automatycznie skaluje ściany graniczne do tego rozmiaru.
  static get WORLD_SIZE() { return 1280; }

  _addGround() {
    // Ground jest zawsze widoczny — nie trafia do listy cullingowej
    new Ground(this.scene, this.physics, this.vehiclePhysics, WorldBuilder.WORLD_SIZE);
  }

  // ─── Drogi ──────────────────────────────────────────────────────────────────
  // Buduje wizualną jezdnię + linie + chodniki + fizykę chodnika.

  _road({ axis, center, halfLen = 130 }) {
    const RW  = 3.0;
    const SWW = 1.5;
    const SWH = SIDEWALK_H;
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
    // E-W (halfLen=210 → sięgają do x=±195+margin)
    this._road({ axis: 'z', center:  -50, halfLen: 210 });
    this._road({ axis: 'z', center:   50, halfLen: 210 });
    this._road({ axis: 'z', center: -100, halfLen: 210 });
    this._road({ axis: 'z', center:  100, halfLen: 210 });
    this._road({ axis: 'z', center: -150, halfLen: 210 });
    this._road({ axis: 'z', center:  150, halfLen: 210 });
    // ── Nowe drogi E-W (z=±200 — granica osiedla, z=±250 — zewnętrzna) ────
    this._road({ axis: 'z', center: -200, halfLen: 210 });
    this._road({ axis: 'z', center:  200, halfLen: 210 });
    this._road({ axis: 'z', center: -250, halfLen: 210 });
    this._road({ axis: 'z', center:  250, halfLen: 210 });
    // N-S (halfLen=260 → sięgają do z=±250+margin)
    this._road({ axis: 'x', center:   65, halfLen: 260 });
    this._road({ axis: 'x', center:  -65, halfLen: 260 });
    this._road({ axis: 'x', center:  130, halfLen: 260 });
    this._road({ axis: 'x', center: -130, halfLen: 260 });
    // ── Nowe drogi N-S (x=±195 — obwodnica osiedla) ────────────────────────
    this._road({ axis: 'x', center:  195, halfLen: 260 });
    this._road({ axis: 'x', center: -195, halfLen: 260 });
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
    const SWH = SIDEWALK_H;

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

    // Sklep przy E-W północnej (z=-50), strona północna — z=-62 (4j od clear zone drogi)
    this._regCircle( 30, -62, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FS,
      wallColor: 0xF5CBA7, roofColor: 0xCA6F1E,
    }, this.vehiclePhysics).placeAt( 30, 0, -62));
    this._regCircle(-30, -62, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FS,
      wallColor: 0xA9CCE3, roofColor: 0x1A5276,
    }, this.vehiclePhysics).placeAt(-30, 0, -62));

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

    // Sklep przy E-W południowej (z=50), strona południowa — z=60 (2j od clear zone drogi)
    this._regCircle( 28, 60, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FN,
      wallColor: 0xD5F5E3, roofColor: 0x1E8449,
    }, this.vehiclePhysics).placeAt( 28, 0, 60));
    this._regCircle(-28, 60, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, { facing: FN,
      wallColor: 0xFCF3CF, roofColor: 0xD4AC0D, signColor: 0xCB4335,
    }, this.vehiclePhysics).placeAt(-28, 0, 60));

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
    // x=252: czubek x=202 (od drogi x=195: 6.5j > ROAD_CLEAR ✓; od drogi x=130: 72j ✓)
    this._triOffice(252, -25, FE, { wallColor: 0xECF0EC, glassColor: 0x0A1520 });

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
    // x=-252: czubek x=-202 (od drogi x=-195: 6.5j > ROAD_CLEAR ✓; od drogi x=-130: 72j ✓)
    this._triOffice(-252, 25, FW, { wallColor: 0xF0ECE8, glassColor: 0x1A0D05 });

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

  // ─── Nowe Osiedle Północne (z ∈ [-250, -200]) ────────────────────────────────
  //
  // Dwa rzędy domów między drogą E-W z=-200 a z=-250.
  // Rząd A (z=-213): fasada FS (+Z) ku drodze z=-200 (13j > 12.1j ✓)
  // Rząd B (z=-237): fasada FN (-Z) ku drodze z=-250 (13j > 12.1j ✓)
  // x bezpieczne (od N-S x=0,±65,±130,±195): |x-xDrogi| > 9j
  //   → użyte: ±22, ±50, ±90, ±118, ±148, ±175

  _addNewNorthEstate() {
    const P = HOUSE_PALETTES;

    // Rząd A — z=-213, fasada FS (ku drodze z=-200)
    const rowA = [
      [-175, P[0], 'pitched',  true ],
      [-148, P[1], 'flat',     false],
      [-118, P[2], 'dome',     false],
      [ -90, P[3], 'pitched',  true ],
      [ -50, P[4], 'flat',     false],
      [ -22, P[5], 'dome',     false],
      [  22, P[6], 'pitched',  true ],
      [  50, P[7], 'flat',     false],
      [  90, P[8], 'dome',     false],
      [ 118, P[9], 'pitched',  true ],
      [ 148, P[0], 'flat',     false],
      [ 175, P[1], 'pitched',  true ],
    ];
    rowA.forEach(([x, pal, roofStyle, hasChimney]) => {
      this._house(pal, x, -213, FS, { roofStyle, hasChimney });
    });

    // Rząd B — z=-237, fasada FN (ku drodze z=-250)
    const rowB = [
      [-175, P[2], 'flat',    false],
      [-148, P[3], 'dome',    false],
      [-118, P[4], 'pitched', true ],
      [ -90, P[5], 'flat',    false],
      [ -50, P[6], 'dome',    false],
      [ -22, P[7], 'pitched', true ],
      [  22, P[8], 'flat',    false],
      [  50, P[9], 'dome',    false],
      [  90, P[0], 'pitched', true ],
      [ 118, P[1], 'flat',    false],
      [ 148, P[2], 'dome',    false],
      [ 175, P[3], 'pitched', true ],
    ];
    rowB.forEach(([x, pal, roofStyle, hasChimney]) => {
      this._house(pal, x, -237, FN, { roofStyle, hasChimney });
    });

    // Sklepy przy wjazdach (narożniki z=-200 przy x=±195)
    this._regCircle( 184, -210, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, {
      facing: FW, wallColor: 0xFFF0C0, roofColor: 0xC0860B,
    }, this.vehiclePhysics).placeAt(184, 0, -210));
    this._regCircle(-184, -210, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, {
      facing: FE, wallColor: 0xC8E8FF, roofColor: 0x1A4A8A,
    }, this.vehiclePhysics).placeAt(-184, 0, -210));
  }

  // ─── Nowe Osiedle Południowe (z ∈ [200, 250]) ─────────────────────────────────
  //
  // Symetryczne do północnego względem z=0.

  _addNewSouthEstate() {
    const P = HOUSE_PALETTES;

    // Rząd A — z=213, fasada FN (ku drodze z=200)
    const rowA = [
      [-175, P[4], 'dome',    false],
      [-148, P[5], 'pitched', true ],
      [-118, P[6], 'flat',    false],
      [ -90, P[7], 'dome',    false],
      [ -50, P[8], 'pitched', true ],
      [ -22, P[9], 'flat',    false],
      [  22, P[0], 'dome',    false],
      [  50, P[1], 'pitched', true ],
      [  90, P[2], 'flat',    false],
      [ 118, P[3], 'dome',    false],
      [ 148, P[4], 'pitched', true ],
      [ 175, P[5], 'flat',    false],
    ];
    rowA.forEach(([x, pal, roofStyle, hasChimney]) => {
      this._house(pal, x, 213, FN, { roofStyle, hasChimney });
    });

    // Rząd B — z=237, fasada FS (ku drodze z=250)
    const rowB = [
      [-175, P[6], 'pitched', true ],
      [-148, P[7], 'flat',    false],
      [-118, P[8], 'dome',    false],
      [ -90, P[9], 'pitched', true ],
      [ -50, P[0], 'flat',    false],
      [ -22, P[1], 'dome',    false],
      [  22, P[2], 'pitched', true ],
      [  50, P[3], 'flat',    false],
      [  90, P[4], 'dome',    false],
      [ 118, P[5], 'pitched', true ],
      [ 148, P[6], 'flat',    false],
      [ 175, P[7], 'dome',    false],
    ];
    rowB.forEach(([x, pal, roofStyle, hasChimney]) => {
      this._house(pal, x, 237, FS, { roofStyle, hasChimney });
    });

    // Sklepy przy wjazdach
    this._regCircle( 184, 210, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, {
      facing: FW, wallColor: 0xE8FFE0, roofColor: 0x2A7A1A,
    }, this.vehiclePhysics).placeAt(184, 0, 210));
    this._regCircle(-184, 210, 9/2, 7/2);
    this._add(new Shop(this.scene, this.physics, {
      facing: FE, wallColor: 0xFFE8F0, roofColor: 0xAA2244,
    }, this.vehiclePhysics).placeAt(-184, 0, 210));
  }

  /** Blok z wielkiej płyty — rejestruje koło wykluczenia, stawia budynek. */
  _panel(x, z, facing, opts = {}) {
    const w = opts.w ?? 50, d = opts.d ?? 14;
    this._regCircle(x, z, w / 2, d / 2, 2.5);
    return this._add(
      new PanelBlock(this.scene, this.physics, { facing, ...opts }, this.vehiclePhysics)
        .placeAt(x, 0, z),
    );
  }

  // ─── Osiedle z wielkiej płyty ────────────────────────────────────────────────
  //
  // Estate bounds: x ∈ [203, 447], z ∈ [-358, -558]
  // Internal E-W roads:
  //   Road A: z=-392   south sidewalk outer: z=-387.5  north: z=-396.5
  //   Road B: z=-472   south sidewalk outer: z=-467.5  north: z=-476.5
  //
  // Clearance rule: entry face ≥ sidewalk_outer + 2 units gap
  //   → FN block south of road A: center_z ≥ -384.5 + d/2  (use z=-368 for d≤32)
  //   → FS block north of road A: center_z ≤ -399.5 - d/2  (use z=-413 for d≤27)
  //   → FN block south of road B: center_z ≥ -464.5 + d/2  (use z=-447 for d≤34)
  //   → FS block north of road B: center_z ≤ -479.5 - d/2  (use z=-496 for d≤33)

  /** Internal estate road segment — raw geometry, offset from world origin. */
  _estateRoad(axis, center, from, to) {
    const RW = 3.0, SWW = 1.5;
    const len = to - from;
    const mid = (from + to) / 2;
    const roadMat = new THREE.MeshToonMaterial({ color: 0x888888 });

    if (axis === 'z') {
      // E-W road at z=center, x from `from` to `to`
      const road = new THREE.Mesh(new THREE.PlaneGeometry(len, RW * 2), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(mid, 0.011, center);
      road.receiveShadow = true;
      this.scene.add(road);

      // Dashed centre line
      const lineMat = new THREE.MeshToonMaterial({ color: 0xFFFFCC });
      const nDashes = Math.max(1, Math.floor(len / 10));
      const step = len / nDashes;
      for (let i = 0; i < nDashes; i++) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.25), lineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(from + (i + 0.5) * step, 0.013, center);
        this.scene.add(dash);
      }

      // Sidewalks on both sides
      [-1, 1].forEach(side => {
        const swZ = center + side * (RW + SWW / 2);
        const sw = new THREE.Mesh(
          new THREE.PlaneGeometry(len, SWW),
          makeSidewalkMat(this._swCanvas, len, SWW),
        );
        sw.rotation.x = -Math.PI / 2;
        sw.position.set(mid, SIDEWALK_H, swZ);
        sw.receiveShadow = true;
        this.scene.add(sw);
        this.physics.addStaticBox(mid, SIDEWALK_H / 2, swZ, len / 2, SIDEWALK_H / 2, SWW / 2);
        if (this.vehiclePhysics)
          this.vehiclePhysics.addStaticBox(mid, SIDEWALK_H / 2, swZ, len / 2, SIDEWALK_H / 2, SWW / 2, 'ground');
      });
    } else {
      // N-S road at x=center, z from `from` to `to`
      const road = new THREE.Mesh(new THREE.PlaneGeometry(RW * 2, len), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(center, 0.011, mid);
      road.receiveShadow = true;
      this.scene.add(road);

      [-1, 1].forEach(side => {
        const swX = center + side * (RW + SWW / 2);
        const sw = new THREE.Mesh(
          new THREE.PlaneGeometry(SWW, len),
          makeSidewalkMat(this._swCanvas, SWW, len),
        );
        sw.rotation.x = -Math.PI / 2;
        sw.position.set(swX, SIDEWALK_H, mid);
        sw.receiveShadow = true;
        this.scene.add(sw);
        this.physics.addStaticBox(swX, SIDEWALK_H / 2, mid, SWW / 2, SIDEWALK_H / 2, len / 2);
        if (this.vehiclePhysics)
          this.vehiclePhysics.addStaticBox(swX, SIDEWALK_H / 2, mid, SWW / 2, SIDEWALK_H / 2, len / 2, 'ground');
      });
    }
  }

  _addPanelEstate() {
    // ── Internal streets ──────────────────────────────────────────────────────
    this._estateRoad('z', -392, 203, 447);   // Road A — south internal
    this._estateRoad('z', -472, 203, 447);   // Road B — north internal

    // ── Row S: south of road A (z=-392), FN — entries face north ─────────────
    // Clearance: entry = center_z − d/2  ≥  -387.5 + 3 = -384.5
    // z=-368 → entry offset: d=26→-381 (gap 3.5), d=18→-377 (gap 7.5) ✓
    this._panel(252, -368, FN, { w: 64, d: 26, floors: 4, variant: 0 });  // x: 220..284
    this._panel(374, -368, FN, { w: 51, d: 18, floors: 4, variant: 3 });  // x: 348..400

    // Service block close to road A south side
    // z=-381: entry=-385, gap 2.5 from south sidewalk outer ✓
    this._panel(438, -381, FN, { w: 16, d: 8,  floors: 1, variant: 2 });  // x: 430..446

    // ── Row MS: north of road A (z=-392), FS — entries face south ─────────────
    // Clearance: entry = center_z + d/2  ≤  -396.5 − 3 = -399.5
    // z=-413: entry offset: d=22→-402 (gap 2.5), d=25→-400.5 (gap 1) ✓ use z=-415 for d=25
    this._panel(245, -415, FS, { w: 27, d: 25, floors: 4, variant: 1 });  // x: 231..259; entry=-402.5 gap 3 ✓
    this._panel(328, -413, FS, { w: 53, d: 22, floors: 4, variant: 1 });  // x: 301..355; entry=-402 gap 2.5 ✓
    this._panel(415, -413, FS, { w: 41, d: 18, floors: 4, variant: 2 });  // x: 394..436; entry=-404 gap 4.5 ✓

    // ── Row MN: south of road B (z=-472), FN — entries face north ─────────────
    // z=-447: entry offset: d=15→-454.5 (gap 10), d=20→-457 (gap 7.5), d=30→-462 (gap 2.5) ✓
    this._panel(255, -447, FN, { w: 25, d: 15, floors: 4, variant: 2 });  // x: 242..268
    this._panel(308, -447, FN, { w: 19, d: 20, floors: 4, variant: 0 });  // x: 298..318
    this._panel(363, -447, FN, { w: 41, d: 18, floors: 4, variant: 3 });  // x: 342..384
    this._panel(421, -447, FN, { w: 26, d: 30, floors: 4, variant: 2 });  // x: 408..434; entry=-462 ✓

    // ── Row N: north of road B (z=-472), FS — entries face south ─────────────
    // z=-496: entry offset: d=26→-483 (gap 3.5), d=18→-487 (gap 7.5) ✓
    // z=-506 for big block d=47: entry=-506+23.5=-482.5 (gap 3) ✓
    this._panel(224, -496, FS, { w: 27, d: 29, floors: 4, variant: 0 });  // x: 210..238; entry=-481.5 gap 2 ✓
    this._panel(278, -506, FS, { w: 46, d: 47, floors: 5, variant: 3 });  // x: 255..301; entry=-482.5 gap 3 ✓
    this._panel(351, -496, FS, { w: 16, d: 26, floors: 4, variant: 3 });  // x: 343..359; tower
    this._panel(391, -496, FS, { w: 16, d: 26, floors: 4, variant: 0 });  // x: 383..399; tower
    this._panel(431, -496, FS, { w: 16, d: 26, floors: 4, variant: 1 });  // x: 423..439; tower

    // ── Trees — between buildings and alongside roads ──────────────────────────
    const estateTrees = [
      // Between road A and row MS / row MN
      [293, -432], [340, -432], [385, -432], [430, -432],
      // Between road A and road B (open median space)
      [215, -430], [215, -460],
      // Row MN gaps
      [285, -448], [335, -448],
      // Between road B and row N
      [215, -484], [310, -484], [370, -484], [410, -484],
      // North cluster surroundings
      [215, -520], [340, -520], [420, -520],
    ];
    estateTrees.forEach(([tx, tz]) => {
      if (!this._isFreeForTree(tx, tz, 2.5)) return;
      const s = 0.8 + rand() * 0.5;
      this._add(new Tree(this.scene, this.physics,
        { trunkH: 3.2 * s, trunkR: 0.22 * s, leavesR: 2.0 * s },
        this.vehiclePhysics,
      ).placeAt(tx, 0, tz));
      this._regCircle(tx, tz, 1.8, 1.8, 0.8);
    });
  }

  // ─── Fabryka Playtime Co. (Poppy Playtime) — NE outskirts ───────────────────
  //
  // Position: x=162, z=-125, facing FW (facade points west toward road x=130).
  // World footprint with FW rotation: x ∈ [150,174], z ∈ [-144,-106].
  // Road clearances: x=130 → 20j ✓, x=195 → 21j ✓, z=-100 → 6j ✓, z=-150 → 6j ✓
  // No existing buildings within 40j of this centre.

  _addPoppyFactory() {
    const FW = -Math.PI / 2;
    this._regCircle(162, -125, 19, 12, 3.0);
    const factory = new PoppyFactory(this.scene, this.physics, {
      facing: FW,
    }, this.vehiclePhysics).placeAt(162, 0, -125);
    this._add(factory);
    this.buildings.push(factory);   // hasInterior=true → E wejście

    // Drabinka na dach fabryki — po prawej stronie (local +X → world z=-106)
    // Fabryka: x=162, z=-125, facing=FW=-π/2 → right wall at world z=-106
    // facingY=0 → drabinka wskazuje na +Z (gracz podchodzi z zewnątrz z z>-106)
    this._addLadder(162, 0, -106, 14, 0);

    // Drabinka na dach z lewej strony fabryki (local -X → world z=-144)
    // facingY=Math.PI → gracz podchodzi z z<-144 (od południa)
    this._addLadder(162, 0, -144, 14, Math.PI);
  }

  // ─── Wzgórza — w odległych narożnikach świata ────────────────────────────────

  _addHills() {
    // ── Wzgórza w narożnikach świata ─────────────────────────────────────────
    // Zasada: dist(cx, każda_droga) > radius + ROAD_CLEAR(4.5)
    // Drogi N-S: x=0,±65,±130,±195 | Drogi E-W: z=0,±50,±100,±150,±200,±250
    //
    // NW (-250,-300, r=30): x=-195→55≥34.5✓  z=-250→50≥34.5✓
    this._add(new Hill(this.scene, this.physics,
      { radius: 30, height: 16, color: 0x3a8a15, shape: 'round' },
      this.vehiclePhysics,
    ).placeAt(-250, 0, -300));

    // SE (250,300, r=24): x=195→55≥28.5✓  z=250→50≥28.5✓
    this._add(new Hill(this.scene, this.physics,
      { radius: 24, height: 11, color: 0x4a9a25, shape: 'mesa' },
      this.vehiclePhysics,
    ).placeAt(250, 0, 300));

    // NE (250,-300, r=28): x=195→55≥32.5✓  z=-250→50≥32.5✓
    this._add(new Hill(this.scene, this.physics,
      { radius: 28, height: 14, color: 0x3d9020, shape: 'round' },
      this.vehiclePhysics,
    ).placeAt(250, 0, -300));

    // SW (-250,300, r=26): x=-195→55≥30.5✓  z=250→50≥30.5✓
    this._add(new Hill(this.scene, this.physics,
      { radius: 26, height: 12, color: 0x509525, shape: 'mesa' },
      this.vehiclePhysics,
    ).placeAt(-250, 0, 300));

    // Dodatkowe — głęboko w narożnikach, daleko od wszystkich dróg
    // (-285,-330, r=22): x=-195→90≥26.5✓  z=-250→80≥26.5✓
    this._add(new Hill(this.scene, this.physics,
      { radius: 22, height: 10, color: 0x4a8a1a, shape: 'round' },
      this.vehiclePhysics,
    ).placeAt(-285, 0, -330));

    // (285,330, r=20): x=195→90≥24.5✓  z=250→80≥24.5✓
    this._add(new Hill(this.scene, this.physics,
      { radius: 20, height: 9, color: 0x558a2a, shape: 'mesa' },
      this.vehiclePhysics,
    ).placeAt(285, 0, 330));
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

      // ── Wzdłuż nowych dróg E-W z=±200 ────────────────────────────────
      [-180,-194],[-150,-194],[-110,-194],[-70,-194],[-35,-194],[-8,-194],
      [  8,-194],[  35,-194],[ 70,-194],[110,-194],[150,-194],[180,-194],
      [-180,-206],[-150,-206],[-110,-206],[-70,-206],[-35,-206],[-8,-206],
      [  8,-206],[  35,-206],[ 70,-206],[110,-206],[150,-206],[180,-206],
      [-180, 194],[-150, 194],[-110, 194],[-70, 194],[-35, 194],[-8, 194],
      [  8, 194],[  35, 194],[ 70, 194],[110, 194],[150, 194],[180, 194],
      [-180, 206],[-150, 206],[-110, 206],[-70, 206],[-35, 206],[-8, 206],
      [  8, 206],[  35, 206],[ 70, 206],[110, 206],[150, 206],[180, 206],

      // ── Wzdłuż nowych dróg E-W z=±250 ────────────────────────────────
      [-180,-244],[-150,-244],[-110,-244],[-70,-244],[-35,-244],[-8,-244],
      [  8,-244],[  35,-244],[ 70,-244],[110,-244],[150,-244],[180,-244],
      [-180,-256],[-150,-256],[-110,-256],[-70,-256],[-35,-256],[-8,-256],
      [  8,-256],[  35,-256],[ 70,-256],[110,-256],[150,-256],[180,-256],
      [-180, 244],[-150, 244],[-110, 244],[-70, 244],[-35, 244],[-8, 244],
      [  8, 244],[  35, 244],[ 70, 244],[110, 244],[150, 244],[180, 244],
      [-180, 256],[-150, 256],[-110, 256],[-70, 256],[-35, 256],[-8, 256],
      [  8, 256],[  35, 256],[ 70, 256],[110, 256],[150, 256],[180, 256],

      // ── Wzdłuż nowych dróg N-S x=±195 ────────────────────────────────
      [189,-240],[201,-240],[189,-215],[201,-215],[189,-185],[201,-185],
      [189,-160],[201,-160],[189,-130],[201,-130],[189,-100],[201,-100],
      [189,-70], [201,-70], [189,-40], [201,-40], [189,-10], [201,-10],
      [189,  10],[201,  10],[189,  40],[201,  40],[189,  70],[201,  70],
      [189, 100],[201, 100],[189, 130],[201, 130],[189, 160],[201, 160],
      [189, 185],[201, 185],[189, 215],[201, 215],[189, 240],[201, 240],
      [-189,-240],[-201,-240],[-189,-215],[-201,-215],[-189,-185],[-201,-185],
      [-189,-160],[-201,-160],[-189,-130],[-201,-130],[-189,-100],[-201,-100],
      [-189,-70], [-201,-70], [-189,-40], [-201,-40], [-189,-10], [-201,-10],
      [-189,  10],[-201,  10],[-189,  40],[-201,  40],[-189,  70],[-201,  70],
      [-189, 100],[-201, 100],[-189, 130],[-201, 130],[-189, 160],[-201, 160],
      [-189, 185],[-201, 185],[-189, 215],[-201, 215],[-189, 240],[-201, 240],

      // ── Wewnątrz osiedla (między rzędami domów) ───────────────────────
      [-162,-225],[-130,-225],[-100,-225],[-65,-225],[-35,-225],[-8,-225],
      [  8,-225],[  35,-225],[  65,-225],[ 100,-225],[130,-225],[162,-225],
      [-162, 225],[-130, 225],[-100, 225],[-65, 225],[-35, 225],[-8, 225],
      [  8, 225],[  35, 225],[  65, 225],[ 100, 225],[130, 225],[162, 225],
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

      // ── E-W z=±200 — droga graniczna osiedla ─────────────────────────────────
      [-175,-194.5,FW],[-140,-194.5,FW],[-100,-194.5,FW],[-55,-194.5,FW],[-18,-194.5,FW],
      [18,-194.5,FW],[55,-194.5,FW],[100,-194.5,FW],[140,-194.5,FW],[175,-194.5,FW],
      [-175,-205.5,FE],[-140,-205.5,FE],[-100,-205.5,FE],[-55,-205.5,FE],[-18,-205.5,FE],
      [18,-205.5,FE],[55,-205.5,FE],[100,-205.5,FE],[140,-205.5,FE],[175,-205.5,FE],
      [-175,194.5,FE],[-140,194.5,FE],[-100,194.5,FE],[-55,194.5,FE],[-18,194.5,FE],
      [18,194.5,FE],[55,194.5,FE],[100,194.5,FE],[140,194.5,FE],[175,194.5,FE],
      [-175,205.5,FW],[-140,205.5,FW],[-100,205.5,FW],[-55,205.5,FW],[-18,205.5,FW],
      [18,205.5,FW],[55,205.5,FW],[100,205.5,FW],[140,205.5,FW],[175,205.5,FW],

      // ── E-W z=±250 — zewnętrzna droga osiedla ────────────────────────────────
      [-175,-244.5,FW],[-140,-244.5,FW],[-100,-244.5,FW],[-55,-244.5,FW],[-18,-244.5,FW],
      [18,-244.5,FW],[55,-244.5,FW],[100,-244.5,FW],[140,-244.5,FW],[175,-244.5,FW],
      [-175,-255.5,FE],[-140,-255.5,FE],[-100,-255.5,FE],[-55,-255.5,FE],[-18,-255.5,FE],
      [18,-255.5,FE],[55,-255.5,FE],[100,-255.5,FE],[140,-255.5,FE],[175,-255.5,FE],
      [-175,244.5,FE],[-140,244.5,FE],[-100,244.5,FE],[-55,244.5,FE],[-18,244.5,FE],
      [18,244.5,FE],[55,244.5,FE],[100,244.5,FE],[140,244.5,FE],[175,244.5,FE],
      [-175,255.5,FW],[-140,255.5,FW],[-100,255.5,FW],[-55,255.5,FW],[-18,255.5,FW],
      [18,255.5,FW],[55,255.5,FW],[100,255.5,FW],[140,255.5,FW],[175,255.5,FW],

      // ── N-S x=±195 — nowe drogi obwodowe ─────────────────────────────────────
      [189.5,-240,FN],[200.5,-240,FS],[189.5,-215,FN],[200.5,-215,FS],
      [189.5,-180,FN],[200.5,-180,FS],[189.5,-150,FN],[200.5,-150,FS],
      [189.5,-120,FN],[200.5,-120,FS],[189.5,-90,FN],[200.5,-90,FS],
      [189.5,-60,FN],[200.5,-60,FS],[189.5,-26,FN],[200.5,-26,FS],
      [189.5, 26,FN],[200.5, 26,FS],[189.5, 60,FN],[200.5, 60,FS],
      [189.5, 90,FN],[200.5, 90,FS],[189.5,120,FN],[200.5,120,FS],
      [189.5,150,FN],[200.5,150,FS],[189.5,180,FN],[200.5,180,FS],
      [189.5,215,FN],[200.5,215,FS],[189.5,240,FN],[200.5,240,FS],
      [-189.5,-240,FS],[-200.5,-240,FN],[-189.5,-215,FS],[-200.5,-215,FN],
      [-189.5,-180,FS],[-200.5,-180,FN],[-189.5,-150,FS],[-200.5,-150,FN],
      [-189.5,-120,FS],[-200.5,-120,FN],[-189.5,-90,FS],[-200.5,-90,FN],
      [-189.5,-60,FS],[-200.5,-60,FN],[-189.5,-26,FS],[-200.5,-26,FN],
      [-189.5, 26,FS],[-200.5, 26,FN],[-189.5, 60,FS],[-200.5, 60,FN],
      [-189.5, 90,FS],[-200.5, 90,FN],[-189.5,120,FS],[-200.5,120,FN],
      [-189.5,150,FS],[-200.5,150,FN],[-189.5,180,FS],[-200.5,180,FN],
      [-189.5,215,FS],[-200.5,215,FN],[-189.5,240,FS],[-200.5,240,FN],

      // ── N-S x=0 — przedłużenie do z=±240 ────────────────────────────────────
      [5,-195,FS],[-5,-195,FN],[5,-210,FS],[-5,-210,FN],
      [5,-228,FS],[-5,-228,FN],[5,-242,FS],[-5,-242,FN],
      [5, 195,FS],[-5, 195,FN],[5, 210,FS],[-5, 210,FN],
      [5, 228,FS],[-5, 228,FN],[5, 242,FS],[-5, 242,FN],
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
      // Nowe osiedla N / S
      { x:   2, z:-225, facing:  0,            color: 0xFF6688 },
      { x:  -2, z: 225, facing:  Math.PI,      color: 0x44BBFF },
    ];
    defs.forEach(({ x, z, facing, color }) => {
      const car = new Car(this.scene, color);
      car.facing = facing;
      car.root.rotation.y = facing;
      car.initPhysics(this.vehiclePhysics, this.physics, x, 0, z);
      this.cars.push(car);
    });

    // ── Radiowozy policyjne ───────────────────────────────────────────────────
    const policeDefs = [
      // Stawiaj radiowozy bezpośrednio na pasach ruchu.
      // Poprzednie pozycje trafiały w pobliże skrzyżowań albo poza jezdnię,
      // przez co niektóre auta startowały w kolizji z otoczeniem i "źle jechały".
      { x:   2, z: -18, facing:  0 },
      { x:  -2, z: -26, facing:  Math.PI },
      { x:  34, z:   2, facing: -Math.PI / 2 },
      { x: -34, z:  -2, facing:  Math.PI / 2 },
    ];
    for (const { x, z, facing } of policeDefs) {
      const car = new Car(this.scene, 0xF5F5F5);  // biały lakier
      car.facing = facing;
      car.root.rotation.y = facing;
      car.initPhysics(this.vehiclePhysics, this.physics, x, 0, z);
      this._addPoliceDecals(car);
      car._isPolice = true;
      this.cars.push(car);
    }
  }

  // ─── Motocykle (zaparkowane, statyczne) ─────────────────────────────────────

  _addMotorcycles() {
    // Format: [x, z, rotY, kolor]
    // Rozmieszczone na chodnikach (±4.5j od osi drogi) i przy domach.
    // rotY: 0 = przód na +Z (S), Math.PI = na -Z (N), ±PI/2 = na E/W
    const SWH = 0.10;  // wysokość chodnika
    const moto = [
      // ── Centrum, przy chodnikach przy głównym skrzyżowaniu ───────────────
      [  4.5, -10,  0,        0xFF2244 ],  // czerwony
      [ -4.5,  12,  Math.PI,  0x22BBFF ],  // turkusowy
      [ -10,  -4.5, Math.PI / 2, 0xFFCC00 ],  // żółty
      [  14,   4.5, -Math.PI / 2, 0x66DD22 ],  // limonkowy
      // ── Przedmieścia N (z=-50..-90) ─────────────────────────────────────
      [  4.5, -36,  0,        0xFF6622 ],  // pomarańczowy
      [ -4.5, -54,  Math.PI,  0xCC22FF ],  // fioletowy
      [  4.5, -78,  0,        0x00DDDD ],  // cyjan
      [ -60,  -4.5, Math.PI / 2, 0xFF44AA ],  // róż
      [  60,   4.5, -Math.PI / 2, 0x4477FF ],  // niebieski
      // ── Przedmieścia S (z=+50..+90) ─────────────────────────────────────
      [ -4.5,  36,  Math.PI,  0xFFAA00 ],  // bursztynowy
      [  4.5,  54,  0,        0xEE2255 ],  // malinowy
      [ -4.5,  78,  Math.PI,  0x88FF22 ],  // żółtozielony
      // ── CBD E/W ─────────────────────────────────────────────────────────
      [  72,  -4.5, -Math.PI / 2, 0xFF3366 ],
      [ -72,   4.5,  Math.PI / 2, 0x33FFAA ],
      // ── Daleki E/W ──────────────────────────────────────────────────────
      [ 140,   4.5, -Math.PI / 2, 0xDD44FF ],
      [-140,  -4.5,  Math.PI / 2, 0xFFEE22 ],
      // ── Osiedla N/S — daleko ────────────────────────────────────────────
      [  4.5,-130,  0,        0xFF77BB ],
      [ -4.5, 130,  Math.PI,  0x22EEFF ],
      [  4.5,-200,  0,        0xFF5544 ],
      [ -4.5, 200,  Math.PI,  0x55AAFF ],
      // ── Pas środkowy (kąty losowe — postojowa parking) ──────────────────
      [  64, -60,   0.35,     0xCC6633 ],
      [ -64,  60,   -0.40,    0x6633CC ],
    ];

    moto.forEach(([x, z, rotY, color]) => {
      if (!this._isFreeForTree(x, z, 0.8)) return;
      const m = new Motorcycle(this.scene, this.physics, color, this.vehiclePhysics)
        .placeAt(x, SWH, z, rotY);
      this._add(m);
    });
  }

  /** Dodaje oznaczenia policyjne i lampę na dach samochodu. */
  _addPoliceDecals(car) {
    const root = car._bodyPivot ?? car.root;

    // Czarne pasy boczne
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    [-1.09, 1.09].forEach(sx => {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.55, 3.6), stripeMat,
      );
      stripe.position.set(sx, 0.85, 0);
      root.add(stripe);
    });

    // Napis POLICE na boku (płaszczyzna)
    const txtMat = new THREE.MeshBasicMaterial({ color: 0x1144AA });
    [-1.10, 1.10].forEach(sx => {
      const badge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 1.0), txtMat);
      badge.position.set(sx, 0.85, 0);
      root.add(badge);
    });

    // Lampa na DACHU — belka policji POPRZECZNIE (w poprzek auta, wzdłuż osi X)
    const ROOF_Y = 2.05;   // top of car roof + small gap
    const barBase = new THREE.Mesh(
      new THREE.BoxGeometry(1.20, 0.14, 0.55),   // szeroka w X (poprzecznie), krótka w Z
      new THREE.MeshBasicMaterial({ color: 0x111111 }),
    );
    barBase.position.set(0, ROOF_Y, 0.1);
    root.add(barBase);

    const redMat  = new THREE.MeshBasicMaterial({ color: 0xFF1111 });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x1144FF });

    car._policeRedLights  = [];
    car._policeBlueLights = [];

    // 4 panele migające ułożone wzdłuż X (lewo/prawo): czerwony-niebieski / niebieski-czerwony
    [[-0.40, 0], [-0.13, 0], [0.13, 0], [0.40, 0]].forEach(([lx, lz], i) => {
      const mat   = i % 2 === 0 ? redMat : blueMat;
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.34), mat.clone());
      light.position.set(lx, ROOF_Y + 0.09, lz + 0.1);
      root.add(light);
      if (i % 2 === 0) car._policeRedLights.push(light);
      else              car._policeBlueLights.push(light);
    });
  }

  // ─── NPC ─────────────────────────────────────────────────────────────────────

  _addNPCs() {
    const obstacles = this._npcObstacles;   // fizyczne kontury — nie blokują przejść między budynkami
    // Centrum i okolice — chodniki, place, park
    const spots = [
      // centrum — główny plac
       [ 18,  8], [-18,  8], [ 28, -10], [-28, -10],
       [  8, 22], [ -8, 22], [  5, -20], [-10, -24],
      // przedmieścia północne
       [ 30, 68], [-30, 68], [ 20, 82], [-20, 82],
       [ 44, 55], [-44, 55],
      // przedmieścia południowe
       [ 28, -68], [-28, -68], [ 18, -82], [-18, -82],
      // CBD wschód
       [ 78,  12], [ 92, -10], [ 78, -30],
      // CBD zachód
       [-78,  12], [-92, -10], [-78, -30],
    ];
    for (const [x, z] of spots) {
      this.npcs.push(new NPC(this.scene, x, z, 14, obstacles));
    }
  }

  // ─── Zwierzęta ────────────────────────────────────────────────────────────────

  _addAnimals() {
    const obstacles = this._npcObstacles;   // fizyczne kontury — j.w.
    // Pieski — przy domach w przedmieściach
    const dogSpots = [
      [ 22, 60], [-22, 60], [ 38, 78], [-40, 75],
      [ 25, -58], [-25, -58], [ 42, -78],
      [ 14,  30], [-18,  28],
    ];
    for (const [x, z] of dogSpots) {
      this.npcs.push(new Dog(this.scene, x, z, 10, obstacles));
    }

    // Kotki — bardziej ukryte, blisko budynków
    const catSpots = [
      [  8,  14], [ -8,  18], [ 32,  -4], [-32,  -4],
      [ 20,  44], [-20,  44], [ 30, -44], [-28, -44],
      [ 72,   0], [-72,   0],
    ];
    for (const [x, z] of catSpots) {
      this.npcs.push(new Cat(this.scene, x, z, 8, obstacles));
    }
  }

  _addAirplanes() {
    // ── Samoloty (do wsiadania) ─────────────────────────────────────────────
    // Lotnisko na północy — otwarta przestrzeń między drogami
    const plane1 = new Airplane(this.scene, 30, 2, -130);
    plane1.facing = 0;
    plane1.root.rotation.y = 0;
    this.airplanes.push(plane1);

    const plane2 = new Airplane(this.scene, -45, 2, 135);
    plane2.facing = Math.PI;
    plane2.root.rotation.y = Math.PI;
    this.airplanes.push(plane2);

    // ── Lądowisko + helikopter policyjny ────────────────────────────────────
    new Helipad(this.scene, this.physics, this.vehiclePhysics).placeAt(24, 0, -8);
    const heli = new Helicopter(this.scene, 24, 1, -8);
    heli.facing = -Math.PI / 2;
    heli.root.rotation.y = heli.facing;
    this.helicopters.push(heli);
  }

  _addAirport() {
    // ── Military airport (far east, x=290, z=0) ────────────────────────────
    new Airport(this.scene, 290, 0);

    // ── Żołnierze — patrol po obwodzie lotniska ────────────────────────────
    // 8 żołnierzy, każdy startuje od innego punktu patrolu
    const soldierSpawns = [
      [258, -140, 0], [290, -140, 1], [322, -140, 2],
      [322,    0, 3], [322,  140, 4],
      [290,  140, 5], [258,  140, 6], [258,    0, 7],
    ];
    for (const [sx, sz, pi] of soldierSpawns) {
      this.soldiers.push(new Soldier(this.scene, sx, sz, pi));
    }

    // 2 F-16 fighter jets on runway
    const jet1 = new FighterJet(this.scene, 290, 1.2, -60);
    jet1.facing = 0;
    jet1.root.rotation.y = 0;
    this.jets.push(jet1);

    const jet2 = new FighterJet(this.scene, 290, 1.2, -40);
    jet2.facing = 0;
    jet2.root.rotation.y = 0;
    this.jets.push(jet2);

    // B-29 Enola Gay bomber
    const enola = new Bomber(this.scene, 290, 1.5, 90);
    enola.facing = Math.PI;
    enola.root.rotation.y = Math.PI;
    this.bombers.push(enola);
  }

  _addUFOs() {
    // Single UFO orbiting the entire city at medium altitude
    this.ufos.push(new UFO(this.scene, {
      centerX: 0,
      centerZ: 8,
      radiusX: 124,
      radiusZ: 82,
      baseY: 36,
      speed: 0.15,
      phase: Math.PI * 0.15,
    }));
  }

  // ─── Drabinki na dachy ───────────────────────────────────────────────────────
  //
  // Drabinki przy wieżowcach-blokach (TowerBlock, default d=14, back wall = d/2=7 od centrum).
  //
  // Konwencja facingY: kierunek "na zewnątrz" od ściany (skąd gracz podchodzi).
  //   FW(-π/2) budynek → back ściany world +X → facingY = +π/2
  //   FE(+π/2) budynek → back ściany world -X → facingY = -π/2

  _addRoofLadders() {
    const HPI = Math.PI / 2;

    // ── Daleki wschód (x∈[135,185]) ──────────────────────────────────────────
    // TowerBlock (150, 28, FW, h=38): back = x=150+7=157, z=28
    this._addLadder(157, 0,  28, 38,  HPI);
    // TowerBlock (168, 0, FW, h=44): back = x=168+7=175, z=0
    this._addLadder(175, 0,   0, 44,  HPI);

    // ── Daleki zachód (x∈[-185,-135]) ────────────────────────────────────────
    // TowerBlock (-150, 28, FE, h=36): back = x=-150-7=-157, z=28
    this._addLadder(-157, 0, 28, 36, -HPI);
    // TowerBlock (-168, 0, FE, h=42): back = x=-168-7=-175, z=0
    this._addLadder(-175, 0,  0, 42, -HPI);

    // ── CBD (x=±82) ───────────────────────────────────────────────────────────
    // TowerBlock (82, 26, FW, h=30): back = x=89, z=26
    this._addLadder( 89, 0, 26, 30,  HPI);
    // TowerBlock (-82, 26, FE, h=28): back = x=-89, z=26
    this._addLadder(-89, 0, 26, 28, -HPI);
  }

  // ─── Granice świata ───────────────────────────────────────────────────────────
  //
  // Niewidoczne pionowe ściany 5m od krawędzi terenu — nieprzekraczalne dla
  // każdego obiektu (samochód, gracz, NPC). Wymiary obliczane z WORLD_SIZE,
  // więc automatycznie skalują się przy rozbudowie mapy.

  _addBoundaries() {
    const HALF      = WorldBuilder.WORLD_SIZE / 2;  // 640 przy WORLD_SIZE=1280
    const EDGE      = HALF - 5;                     // 635 — 5m od krawędzi terenu
    const WALL_HH   = 20;                           // halfHeight = 20m (ściana od y=-5 do y=35)
    const WALL_CY   = WALL_HH - 5;                  // środek Y ściany = 15 (dolna krawędź y=-5)
    const WALL_HW   = HALF + 10;                    // szerokość z 10m zakładką, by uszczelnić narożniki

    // 4 ściany: N, S, W, E
    [
      [    0, WALL_CY, -EDGE, WALL_HW, WALL_HH, 0.5],  // N
      [    0, WALL_CY,  EDGE, WALL_HW, WALL_HH, 0.5],  // S
      [-EDGE, WALL_CY,     0,     0.5, WALL_HH, WALL_HW],  // W
      [ EDGE, WALL_CY,     0,     0.5, WALL_HH, WALL_HW],  // E
    ].forEach(([x, y, z, hw, hh, hd]) => {
      this.physics.addStaticBox(x, y, z, hw, hh, hd);
    });
  }
}

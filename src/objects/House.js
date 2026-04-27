import * as THREE from 'three';
import { Building } from './Building.js';
import { toonMat, toonGrad, addOutline, C } from '../core/Materials.js';

/** 10 kolorowych palet domów — używane przez WorldBuilder */
export const HOUSE_PALETTES = [
  { wall: 0xFF6B6B, roof: 0xC0392B, door: 0xFFD700, trim: 0xFFFFFF },
  { wall: 0xFFE55C, roof: 0xE6A817, door: 0xFF6B9D, trim: 0xFFFFFF },
  { wall: 0x4ECDC4, roof: 0x1AA99F, door: 0xFF9F43, trim: 0xFFFFFF },
  { wall: 0x54A0FF, roof: 0x2872D9, door: 0xFFE55C, trim: 0xFFFFFF },
  { wall: 0xA29BFE, roof: 0x6C5CE7, door: 0xFF6B6B, trim: 0xFFFFFF },
  { wall: 0xFD79A8, roof: 0xD63068, door: 0xA29BFE, trim: 0xFFFFFF },
  { wall: 0x55EFC4, roof: 0x00B894, door: 0xFF9F43, trim: 0xFFFFFF },
  { wall: 0xFF9F43, roof: 0xD4670A, door: 0x4ECDC4, trim: 0xFFFFFF },
  { wall: 0xE17055, roof: 0xB33A22, door: 0xFFE55C, trim: 0xFFFFFF },
  { wall: 0x74B9FF, roof: 0x2196C8, door: 0xFD79A8, trim: 0xFFFFFF },
];

/**
 * Dom mieszkalny z bogatą geometrią:
 *   - 3 style dachu: 'pitched' (ostrosłup 4-bok) | 'flat' | 'dome'
 *   - komin, ganek, boczny garaż
 *   - okna ze szkłem + donicami z kwiatkami
 *   - 1 lub 2 piętra z gzymsem
 *
 * Konfiguracja (wszystkie opcjonalne):
 *   w, h, d          — szerokość, wys. piętra, głębokość
 *   wallColor, roofColor, doorColor, winColor, trimColor
 *   roofStyle        — 'pitched' | 'flat' | 'dome'
 *   roofH            — wysokość dachu (tylko pitched/dome)
 *   floors           — 1 | 2
 *   hasChimney       — bool
 *   hasPorch         — bool
 *   garageW          — szerokość garażu (0 = brak)
 *   facing           — obrót Y całego domu (radiany)
 */
export class House extends Building {
  constructor(scene, physics, cfg = {}, vehiclePhysics = null) {
    super(scene, physics, {
      w:          4.2,
      h:          3.2,
      d:          4.0,
      wallColor:  C.wall,
      roofColor:  C.roof,
      doorColor:  C.door,
      winColor:   C.window,
      trimColor:  0xFFFFFF,
      roofStyle:  'pitched',
      roofH:      2.2,
      floors:     1,
      hasChimney: false,
      hasPorch:   false,
      garageW:    0,
      facing:     0,
      ...cfg,
    }, vehiclePhysics);
    this.hasInterior = true;
  }

  _buildGeometry() {
    const {
      w, h, d,
      wallColor, roofColor, doorColor, trimColor,
      roofStyle, roofH, floors, hasChimney, hasPorch, garageW, facing,
    } = this.cfg;

    const wallMat = toonMat(wallColor);
    const roofMat = toonMat(roofColor);
    const doorMat = toonMat(doorColor);
    const trimMat = toonMat(trimColor);

    const H = h * floors; // pełna wysokość ścian

    this.root.rotation.y = facing;

    // ── ŚCIANY ────────────────────────────────────────────────────────────────
    this._box(0, H / 2, 0, w, H, d, wallMat);

    // Dach tworzony jest w _buildRoofMesh() (po scalaniu) — tutaj pominięty.

    // ── KOMIN ─────────────────────────────────────────────────────────────────
    if (hasChimney) {
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.6, 0.55), toonMat(0x8B5E3C));
      ch.position.set(w * 0.28, H + roofH * 0.4, -d * 0.2);
      ch.castShadow = true;
      addOutline(ch, 0.04);
      this.root.add(ch);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.32, 0.2, 8), toonMat(0x6B4226));
      cap.position.set(w * 0.28, H + roofH * 0.4 + 0.9, -d * 0.2);
      this.root.add(cap);
    }

    // ── RAMA DRZWI (scalana z budynkiem) ─────────────────────────────────────
    // Sama rama jest statycznym elementem budynku — scalia się z resztą geometrii.
    // Panel drzwi i klamka są tworzone w _buildRoofMesh() (po scalaniu) jako animowany mesh.
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.95, 0.12), trimMat);
    doorFrame.position.set(0, 0.975, d / 2 + 0.06);
    this.root.add(doorFrame);

    // ── OKNA ─────────────────────────────────────────────────────────────────
    const makeWindow = (lx, ly, lz, rot = 0) => {
      // Rama
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.95, 0.12), trimMat);
      frame.position.set(lx, ly, lz);
      frame.rotation.y = rot;
      addOutline(frame, 0.03);
      this.root.add(frame);

      // Szkło
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(0.72, 0.68),
        new THREE.MeshToonMaterial({
          color: 0x87CEEB,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      glass.position.set(lx, ly, lz + (rot === 0 ? 0.07 : 0));
      glass.rotation.y = rot;
      this.root.add(glass);

      // Krzyż — pozioma listwa
      const hb = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.07, 0.13), trimMat);
      hb.position.set(lx, ly, lz + (rot === 0 ? 0.02 : 0));
      hb.rotation.y = rot;
      this.root.add(hb);
      // Krzyż — pionowa listwa
      const vb = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.70, 0.13), trimMat);
      vb.position.set(lx, ly, lz + (rot === 0 ? 0.02 : 0));
      vb.rotation.y = rot;
      this.root.add(vb);
    };

    // Okna frontowe (parter) — h*0.62 = środek 1. piętra niezależnie od liczby kondygnacji
    makeWindow(-1.25, h * 0.62, d / 2 + 0.07);
    makeWindow( 1.25, h * 0.62, d / 2 + 0.07);

    // Drugie piętro
    if (floors > 1) {
      // okna frontowe 2F na poziomie h*1.62 (środek 2. kondygnacji, w obrębie ściany)
      makeWindow(-1.25, h * 1.62, d / 2 + 0.07);
      makeWindow( 1.25, h * 1.62, d / 2 + 0.07);
      makeWindow(-1.25, h * 0.62, -d / 2 - 0.07);
      makeWindow( 1.25, h * 0.62, -d / 2 - 0.07);
      // Gzyms między piętrami
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.15, d + 0.1), trimMat);
      ledge.position.y = h;
      this.root.add(ledge);
    }

    // ── GANEK ─────────────────────────────────────────────────────────────────
    if (hasPorch) {
      const pFloor = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.18, 1.6), toonMat(0xF5DEB3));
      pFloor.position.set(0, 0.09, d / 2 + 0.8);
      pFloor.castShadow = true;
      this.root.add(pFloor);

      [-1, 1].forEach(s => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, H * 0.7, 6), trimMat);
        post.position.set(s * w * 0.33, H * 0.35, d / 2 + 1.4);
        this.root.add(post);
      });

      const pRoof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.18, 1.7), roofMat);
      pRoof.position.set(0, H * 0.72, d / 2 + 0.8);
      pRoof.castShadow = true;
      this.root.add(pRoof);
    }

    // ── GARAŻ BOCZNY ──────────────────────────────────────────────────────────
    if (garageW > 0) {
      const gW = garageW, gH = h * 0.8, gD = d * 0.85;

      const gBody = new THREE.Mesh(new THREE.BoxGeometry(gW, gH, gD), wallMat);
      gBody.position.set(-(w / 2 + gW / 2), gH / 2, -d * 0.075);
      gBody.castShadow = gBody.receiveShadow = true;
      addOutline(gBody, 0.04);
      this.root.add(gBody);

      const gRoof = new THREE.Mesh(new THREE.BoxGeometry(gW + 0.2, 0.3, gD + 0.2), roofMat);
      gRoof.position.set(-(w / 2 + gW / 2), gH + 0.15, -d * 0.075);
      gRoof.castShadow = true;
      this.root.add(gRoof);

      const gDoor = new THREE.Mesh(new THREE.BoxGeometry(gW * 0.85, gH * 0.72, 0.12), doorMat);
      gDoor.position.set(-(w / 2 + gW / 2), gH * 0.36, gD / 2 - d * 0.075 + 0.07);
      addOutline(gDoor, 0.03);
      this.root.add(gDoor);

      // Poziome paski bramy garażowej
      for (let i = 1; i < 4; i++) {
        const line = new THREE.Mesh(
          new THREE.BoxGeometry(gW * 0.85, 0.06, 0.06),
          toonMat(0x888888),
        );
        line.position.set(-(w / 2 + gW / 2), gH * 0.72 * (i / 4), gD / 2 - d * 0.075 + 0.14);
        this.root.add(line);
      }
    }

    // ── ŚCIEŻKA PRZED DRZWIAMI ────────────────────────────────────────────────
    const path = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 2.8), toonMat(0xD4C9A8));
    path.position.set(0, 0.025, d / 2 + 1.4);
    path.receiveShadow = true;
    this.root.add(path);

    // ── DONICE Z KWIATKAMI ────────────────────────────────────────────────────
    const flowerColors = [0xFF6B6B, 0xFFE55C, 0xFF6B9D, 0xFF9F43];
    [-1.25, 1.25].forEach(wx => {
      const pot = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.22, 0.22), toonMat(0x8B4513));
      pot.position.set(wx, h * 0.62 - 0.56, d / 2 + 0.12);
      this.root.add(pot);

      const fc = flowerColors[Math.floor(Math.random() * flowerColors.length)];
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 4), toonMat(0x3CB558));
      stem.position.set(wx, h * 0.62 - 0.35, d / 2 + 0.12);
      this.root.add(stem);

      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), toonMat(fc));
      petal.position.set(wx, h * 0.62 - 0.24, d / 2 + 0.12);
      petal.scale.y = 0.6;
      this.root.add(petal);
    });
  }

  // ─── Dach (osobny mesh — ukrywany gdy gracz jest w środku) ──────────────────

  _buildRoofMesh() {
    const { w, h, d, roofColor, trimColor, doorColor, roofStyle, roofH, floors, hasChimney } = this.cfg;
    const roofMat = toonMat(roofColor);
    const trimMat = toonMat(trimColor);
    const H = h * floors;

    const roofGroup = new THREE.Group();

    if (roofStyle === 'pitched') {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(w, d) * 0.76, roofH, 4),
        roofMat,
      );
      cone.position.set(0, H + roofH / 2, 0);
      cone.rotation.y = Math.PI / 4;
      cone.castShadow = true;
      addOutline(cone, 0.04);
      roofGroup.add(cone);
    } else if (roofStyle === 'flat') {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.35, d + 0.4), roofMat);
      slab.position.set(0, H + 0.175, 0);
      roofGroup.add(slab);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.3, d + 0.5), trimMat);
      edge.position.set(0, H + 0.5, 0);
      roofGroup.add(edge);
    } else if (roofStyle === 'dome') {
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(w, d) * 0.6, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
        roofMat,
      );
      dome.position.set(0, H, 0);
      dome.castShadow = true;
      addOutline(dome, 0.04);
      roofGroup.add(dome);
    }

    if (hasChimney) {
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.6, 0.55), toonMat(0x8B5E3C));
      ch.position.set(w * 0.28, H + roofH * 0.4, -d * 0.2);
      ch.castShadow = true;
      addOutline(ch, 0.04);
      roofGroup.add(ch);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.32, 0.2, 8), toonMat(0x6B4226));
      cap.position.set(w * 0.28, H + roofH * 0.4 + 0.9, -d * 0.2);
      roofGroup.add(cap);
    }

    this.root.add(roofGroup);
    this._roofMesh = roofGroup;

    // ── Animowane drzwi (post-merge — osobny mesh z pivotem przy zawiasie) ─────────
    // Drzwi tworzone PO scalaniu geometrii żeby móc je animować niezależnie.
    // Pivot = lewy zawias drzwi (obrót w Y otwiera/zamyka).
    this._doorPivot = new THREE.Group();
    this._doorPivot.position.set(-0.425, 0, d / 2 + 0.06);
    this.root.add(this._doorPivot);

    const doorAnimMat = new THREE.MeshToonMaterial({ color: doorColor, gradientMap: toonGrad });
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.75, 0.14), doorAnimMat);
    doorMesh.position.set(0.425, 0.875, 0);  // środek drzwi względem pivota
    doorMesh.castShadow = true;
    addOutline(doorMesh, 0.035);
    this._doorPivot.add(doorMesh);

    // Klamka
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xFFD700 }),
    );
    knob.position.set(0.73, 0.875, 0.10);
    this._doorPivot.add(knob);
  }

  // ─── Wnętrze (podłoga + meble) ────────────────────────────────────────────

  _buildInterior() {
    const { w, h, d, floors, wallColor } = this.cfg;
    const H = h * floors;

    const g = new THREE.Group();

    // ── Ściany wewnętrzne (widoczne tylko po wejściu do środka) ──────────────
    // Zewnętrzny box budynku ma FrontSide — wnętrze niewidoczne.
    // BackSide box tej samej geometrii renderuje twarze wewnętrzne (sufit + 4 ściany).
    const wallMatInside = new THREE.MeshToonMaterial({
      color: wallColor,
      side: THREE.BackSide,
      gradientMap: toonGrad,
    });
    // Lekko mniejszy box żeby uniknąć z-fightingu z exterior
    const wallBox = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, H, d - 0.02), wallMatInside);
    wallBox.position.set(0, H / 2, 0);
    g.add(wallBox);

    // Sufit — jaśniejszy kolor (odróżnia od ścian)
    const ceilMat = new THREE.MeshToonMaterial({ color: 0xFAF0E6, gradientMap: toonGrad });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, d - 0.1), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, H - 0.01, 0);
    g.add(ceil);

    // Podłoga — jaśniejszy drewniany kolor
    const floorMat = toonMat(0xC8954A);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w - 0.46, 0.06, d - 0.46), floorMat);
    floor.position.set(0, 0.03, 0);
    g.add(floor);

    // Dywan — ciemno-czerwony, pośrodku pokoju
    const rugMat = toonMat(0xA02020);
    const rug = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.04, d * 0.55), rugMat);
    rug.position.set(0, 0.05, 0);
    g.add(rug);

    // Stół — brązowy blat + 4 nogi
    const tableMat = toonMat(0x8B5E3C);
    const tabTop = new THREE.Mesh(new THREE.BoxGeometry(1.30, 0.07, 0.75), tableMat);
    tabTop.position.set(0, 0.75, 0.2);
    g.add(tabTop);
    [[-0.56, -0.30], [0.56, -0.30], [-0.56, 0.70], [0.56, 0.70]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), tableMat);
      leg.position.set(lx, 0.375, lz);
      g.add(leg);
    });

    // Krzesła — 2 po obu stronach stołu
    const chairMat = toonMat(0x6D4C2A);
    [[-0.9, 0.2], [0.9, 0.2]].forEach(([lx, lz]) => {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.46), chairMat);
      seat.position.set(lx, 0.46, lz);
      g.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.48, 0.06), chairMat);
      back.position.set(lx, 0.70, lz + (lx < 0 ? 0.20 : -0.20));
      g.add(back);
      [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(([cx, cz]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 0.06), chairMat);
        leg.position.set(lx + cx, 0.23, lz + cz);
        g.add(leg);
      });
    });

    // Kanapa — przy tylnej ścianie
    const sofaMat = toonMat(0x4A7A8A);
    const sofaSeat = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.36, 0.55), sofaMat);
    sofaSeat.position.set(0, 0.28, -(d / 2 - 0.62));
    g.add(sofaSeat);
    const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.50, 0.18), sofaMat);
    sofaBack.position.set(0, 0.61, -(d / 2 - 0.34));
    g.add(sofaBack);
    [-0.84, 0.84].forEach(lx => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.52, 0.55), sofaMat);
      arm.position.set(lx, 0.36, -(d / 2 - 0.62));
      g.add(arm);
    });

    // Telewizor — na stoliku przy ścianie bocznej
    const tvStandMat = toonMat(0x333333);
    const tvStand = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.35, 0.38), tvStandMat);
    tvStand.position.set(w / 2 - 0.44, 0.175, -(d / 2 - 0.70));
    g.add(tvStand);
    const tvMat = toonMat(0x111111);
    const tv = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.78), tvMat);
    tv.position.set(w / 2 - 0.38, 0.70, -(d / 2 - 0.70));
    g.add(tv);
    // Ekran (lekko jaśniejszy)
    const screenMat = toonMat(0x1A2A3A);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.66), screenMat);
    screen.position.set(w / 2 - 0.34, 0.70, -(d / 2 - 0.70));
    g.add(screen);

    g.visible = false;
    this.root.add(g);
    this._interiorGroup = g;
  }

  // ─── Pozycje dla interakcji z graczem ─────────────────────────────────────

  /** Punkt przed drzwiami (do wykrywania gracz ← → budynek). */
  getDoorApproachPos()  { return this._localToWorld(0, 0, this.cfg.d / 2 + 1.8); }
  /** Pozycja spawnu gracza wewnątrz (tuż za progiem). */
  getInteriorSpawnPos() { return this._localToWorld(0, 1.0, this.cfg.d / 2 - 1.0); }
  /** Pozycja wysiadania — przed drzwiami. */
  getExitPos()          { return this._localToWorld(0, 1.0, this.cfg.d / 2 + 2.2); }

  // ─── Kolizje ──────────────────────────────────────────────────────────────

  /**
   * Dom z wnętrzem: 1 solid box (exterior) + 5 hollow wall bodies.
   * Solid włączony domyślnie; hollow włączane przez setInsideView(true).
   * Solid obejmuje cały budynek łącznie z dachem.
   * Hollow to 4 ściany z otworem drzwiowym + cap dachu (zawsze solid).
   */
  _buildColliders(wx, wy, wz) {
    const { w, h, d, floors, roofStyle, roofH, facing = 0 } = this.cfg;
    const H = h * floors;

    let capH;
    if (roofStyle === 'flat') {
      capH = 0.50;
    } else if (roofStyle === 'dome') {
      capH = Math.max(w, d) * 0.62;
    } else {
      capH = roofH; // pitched
    }

    const totalH = H + capH;

    // ── Solid box (exterior) — wyłączany gdy gracz wewnątrz ─────────────────
    this._solidBody = this._addPhysicsBoxRotated(wx, wy + totalH / 2, wz, w / 2, totalH / 2, d / 2, facing);

    // ── Hollow walls — włączane gdy gracz wewnątrz ───────────────────────────
    const WT   = 0.22;   // grubość ściany
    const DW   = 0.95;   // szerokość otworu drzwiowego
    const DH   = 1.92;   // wysokość otworu drzwiowego
    const cosF = Math.cos(facing), sinF = Math.sin(facing);

    // Przelicz lokalną pozycję ściany na world space
    const wp = (lx, ly, lz) => ({
      x: wx + lx * cosF + lz * sinF,
      y: wy + ly,
      z: wz - lx * sinF + lz * cosF,
    });

    const addWall = (lx, ly, lz, hw, hh, hd) => {
      const p = wp(lx, ly, lz);
      const b = this._addPhysicsBoxRotated(p.x, p.y, p.z, hw, hh, hd, facing);
      b.setEnabled(false);
      this._hollowBodies.push(b);
    };

    // Ściana przednia (z otworem na drzwi) — 2 panele boczne + opcjonalny nadproże
    const sideW = (w - DW) / 2;
    if (sideW > 0.05) {
      addWall(-(DW / 2 + sideW / 2), H / 2, d / 2 - WT / 2, sideW / 2, H / 2, WT / 2);
      addWall( (DW / 2 + sideW / 2), H / 2, d / 2 - WT / 2, sideW / 2, H / 2, WT / 2);
    }
    if (H > DH) {
      const nadH = H - DH;
      addWall(0, DH + nadH / 2, d / 2 - WT / 2, w / 2, nadH / 2, WT / 2);
    }
    // Ściana tylna
    addWall(0, H / 2, -(d / 2 - WT / 2), w / 2, H / 2, WT / 2);
    // Ściany boczne
    addWall(-(w / 2 - WT / 2), H / 2, 0, WT / 2, H / 2, d / 2);
    addWall( (w / 2 - WT / 2), H / 2, 0, WT / 2, H / 2, d / 2);

    // Cap dachu (zawsze solid — uniemożliwia wejście przez dach z zewnątrz)
    this._addPhysicsBox(wx, wy + H + capH / 2, wz, w / 2, capH / 2, d / 2);

    // ── Kolumny ganku ─────────────────────────────────────────────────────────
    const { hasPorch } = this.cfg;
    if (hasPorch) {
      const postHH = H * 0.35;          // połowa wysokości kolumny
      [-1, 1].forEach(s => {
        const lx = s * w * 0.33;        // pozycja lokalna X
        const lz = d / 2 + 1.4;        // pozycja lokalna Z (przed wejściem)
        // Transformacja przez obrót Y (facing)
        const wx2 = wx + lx * cosF + lz * sinF;
        const wz2 = wz - lx * sinF + lz * cosF;
        this._addPhysicsBox(wx2, wy + postHH, wz2, 0.12, postHH, 0.12);
      });
    }
  }

  // ─── Animacja drzwi + wejście/wyjście ─────────────────────────────────────

  /** Nadpisuje bazową metodę — dodaje animację drzwi. */
  setInsideView(inside) {
    super.setInsideView(inside);
    if (this._doorPivot) {
      // Otwórz (obrót -90°) przy wejściu, zamknij przy wyjściu
      this._doorPivot.rotation.y = inside ? -Math.PI * 0.5 : 0;
    }
  }
}

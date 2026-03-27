import * as THREE from 'three';
import { Building } from './Building.js';
import { toonMat, addOutline } from '../core/Materials.js';

/**
 * TriOffice — trójkątny biurowiec (5 pięter, rzut trójkąt równoramienny).
 *
 * Rzut poziomy = trójkąt: front (W=11) — płaska fasada,
 * tył — ostry czubek w odległości D=9 od frontu.
 * Każde piętro ma ciągłe szyby na wszystkich 3 ścianach.
 * Gzymsy trójkątne między piętrami.
 *
 * Oś głębokości (czubek) leży w kierunku -Z lokalnego układu root.
 * root.rotation.y = facing obraca cały budynek.
 */
export class TriOffice extends Building {
  constructor(scene, physics, cfg = {}, vehiclePhysics = null) {
    super(scene, physics, {
      wallColor:  0xF2F4F2,   // niemal biały
      glassColor: 0x0D1F2D,   // bardzo ciemny granat
      trimColor:  0xDADADA,   // jasnoszary gzyms
      facing:     0,
      ...cfg,
    }, vehiclePhysics);
  }

  _buildGeometry() {
    const { wallColor, glassColor, trimColor, facing } = this.cfg;

    const FLOORS   = 5;
    const FLOOR_H  = 3.2;
    const H        = FLOORS * FLOOR_H;   // 16.0
    const W        = 11;                  // szerokość frontu (oś X lokalna)
    const D        = 9;                   // głębokość (czubek w -Z lokalnym)
    const GLASS_H  = FLOOR_H * 0.64;     // 2.05 — ciągłe okno niemal pełne piętro
    const TRIM_H   = 0.26;

    const wallMat  = toonMat(wallColor);
    const trimMat  = toonMat(trimColor);
    const glassMat = new THREE.MeshToonMaterial({
      color: glassColor, transparent: true, opacity: 0.92,
      side: THREE.DoubleSide,
    });

    this.root.rotation.y = facing;

    // ── Kształt trójkąta dla ExtrudeGeometry ─────────────────────────────────
    // Shape w płaszczyźnie XY: X = oś szerokości, Y = oś głębokości
    // Extrude w Z = oś wysokości (Y world po obróceniu rotation.x = -π/2)
    // Transformacja: shape(x, y) → world(x, 0, -y) po rotation.x=-π/2
    //   → front (y=0) przy z=0, czubek (y=D) przy z=-D
    const makeTriShape = (hw, depth) => {
      const s = new THREE.Shape();
      s.moveTo(-hw, 0);
      s.lineTo( hw, 0);
      s.lineTo( 0,  depth);
      s.closePath();
      return s;
    };

    // ── Body budynku ──────────────────────────────────────────────────────────
    const bodyGeo = new THREE.ExtrudeGeometry(makeTriShape(W / 2, D), {
      depth: H, bevelEnabled: false,
    });
    const body = new THREE.Mesh(bodyGeo, wallMat);
    body.rotation.x = -Math.PI / 2;
    addOutline(body, 0.06);
    this.root.add(body);

    // ── Gzymsy trójkątne między piętrami ─────────────────────────────────────
    for (let f = 1; f < FLOORS; f++) {
      const trimGeo = new THREE.ExtrudeGeometry(
        makeTriShape(W / 2 + 0.22, D + 0.22),
        { depth: TRIM_H, bevelEnabled: false },
      );
      const trim = new THREE.Mesh(trimGeo, trimMat);
      trim.rotation.x = -Math.PI / 2;
      trim.position.y  = f * FLOOR_H;
      this.root.add(trim);
    }

    // ── Dach — grubszy płaski gzyms wieńczący ─────────────────────────────────
    const roofGeo = new THREE.ExtrudeGeometry(
      makeTriShape(W / 2 + 0.32, D + 0.32),
      { depth: 0.45, bevelEnabled: false },
    );
    const roof = new THREE.Mesh(roofGeo, trimMat);
    roof.rotation.x = -Math.PI / 2;
    roof.position.y  = H;
    this.root.add(roof);

    // ── Szyby: 3 ściany × 5 pięter ───────────────────────────────────────────
    // Po rotation.x = -π/2: wierzchołki trójkąta w lokalnym XZ:
    //   A = (-W/2,  0)  B = (+W/2,  0)  C = (0, -D)
    // Normalne zewnętrzne (CCW widziane z góry, trójkąt A→B→C):
    //   Front (A→B): normal = (0, 0, +1)  — płaszczyzna Z = 0, wychodząca w +Z
    //   Lewy  (A→C): normal = normalize(D, +W/2) w XZ
    //   Prawy (B→C): normal = normalize(D, -W/2) w XZ (symetria)
    const lenSide = Math.sqrt((W / 2) ** 2 + D ** 2);  // dł. boku
    const nSX =  D / lenSide;  // X normalnej bocznej (wspólna dla obu)
    const nSZ = (W / 2) / lenSide;  // |Z| normalnej bocznej

    const wallDefs = [
      // Fasada frontowa (A–B): z_local=0, normal +Z, pełna szerokość W
      {
        midX: 0,
        midZ: 0.04,
        len:  W,
        rotY: 0,
      },
      // Lewy bok (A→C): środek = (-W/4, -D/2), normal skierowana w (+X,+Z)
      {
        midX: -W / 4 + nSX * 0.04,
        midZ: -D / 2 + nSZ * 0.04,
        len:  lenSide,
        rotY: Math.atan2(nSX, nSZ),       // ≈ +60°
      },
      // Prawy bok (B→C): symetryczny, normal (+X,−Z)
      {
        midX:  W / 4 + nSX * 0.04,
        midZ: -D / 2 - nSZ * 0.04,
        len:  lenSide,
        rotY: Math.atan2(nSX, -nSZ),      // ≈ +120°
      },
    ];

    wallDefs.forEach(({ midX, midZ, len, rotY }) => {
      for (let f = 0; f < FLOORS; f++) {
        const gy = f * FLOOR_H + (FLOOR_H - GLASS_H) / 2;
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(len - 0.35, GLASS_H),
          glassMat,
        );
        panel.position.set(midX, gy + GLASS_H / 2, midZ);
        panel.rotation.y = rotY;
        this.root.add(panel);
      }
    });

    // ── Cienkie poziome ramy okienne (białe linie) ────────────────────────────
    // Górna i dolna krawędź każdego okna — dodają strukturę fasadzie
    wallDefs.forEach(({ midX, midZ, len, rotY }) => {
      for (let f = 0; f < FLOORS; f++) {
        const gy = f * FLOOR_H + (FLOOR_H - GLASS_H) / 2;
        [gy + 0.05, gy + GLASS_H - 0.05].forEach(barY => {
          const bar = new THREE.Mesh(
            new THREE.PlaneGeometry(len - 0.35, 0.08),
            toonMat(0xF8F8F8),
          );
          bar.position.set(midX, barY, midZ);
          bar.rotation.y = rotY;
          this.root.add(bar);
        });
      }
    });
  }

  _buildColliders(wx, wy, wz) {
    const W = 11, D = 9, H = 16;
    const f = this.cfg.facing ?? 0;
    // Środek kolizji przesuniemy o D/2 wzdłuż osi głębokości
    const cx = wx - Math.sin(f) * (D / 2);
    const cz = wz - Math.cos(f) * (D / 2);
    // Box kwadratowy (W/2) — nadmiarowy ale symetryczny, niezależny od orientacji
    this._addPhysicsBox(cx, wy + H / 2, cz, W / 2, H / 2, W / 2);
  }
}

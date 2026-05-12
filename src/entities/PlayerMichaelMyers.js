import * as THREE from 'three';
import { Player } from './Player.js';
import { toonMat, addOutline } from '../core/Materials.js';

// ─── Kolory ────────────────────────────────────────────────────────────────
const YELLOW  = 0xFFE040;   // żółte ciało
const YELLOW_D = 0xC8A800;  // ciemniejszy akcent / stawy
const VISOR   = 0x0D1A30;   // ciemna przyłbica (beztwarzowy manekin)
const BOOT    = 0x1A1A2E;   // ciemne buty
const PACK    = 0x1C1C2A;   // GrabPack korpus
const HAND_L  = 0xFF3311;   // lewa łapka  — czerwona
const HAND_R  = 0x2266FF;   // prawa łapka — niebieska

/**
 * PlayerMichaelMyers — szczupły, wysoki, żółty manekin z przyłbicą.
 * Okrągły tułów, beztwarzowa głowa, GrabPack z dłońmi i palcami DO PRZODU.
 *
 * inner.rotation.x = +π/2 → oś Y kapsuły → +Z w świecie (do przodu) ✓
 * Układ inner:  inner-X = świat-X,  inner-Y → świat+Z,  inner-Z → świat-Y
 * Palce w inner: rotation.x = -π/2 → wskazują inner-Z → świat+Y (góra) ✓
 */
export class PlayerMichaelMyers extends Player {

  // ─── Ciało ────────────────────────────────────────────────────────────────
  _buildBody() {
    // Tułów — okrągła sfera (smukła: mały promień)
    this.bodyGeo  = new THREE.SphereGeometry(0.28, 20, 14);
    this.bodyOrig = this.bodyGeo.attributes.position.array.slice();
    this.bodyMesh = new THREE.Mesh(this.bodyGeo, toonMat(YELLOW));
    this.bodyMesh.scale.set(1, 1.45, 0.85);   // rozciągnięta w górę, spłaszczona w głąb
    this.bodyMesh.position.y = 0.54;
    this.bodyMesh.castShadow = true;
    addOutline(this.bodyMesh, 0.04);
    this.root.add(this.bodyMesh);

    // Plakietka pracownika
    const badge = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.08, 0.05), toonMat(0xFFFFAA),
    );
    badge.position.set(-0.10, 0.60, 0.155);
    this.root.add(badge);

    // Szyja
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 0.13, 10), toonMat(YELLOW_D),
    );
    neck.position.y = 0.97;
    this.root.add(neck);

    // Głowa — duża okrągła sfera
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 20, 16), toonMat(YELLOW),
    );
    head.position.y = 1.20;
    head.castShadow = true;
    addOutline(head, 0.04);
    this.root.add(head);

    // Przyłbica — beztwarzowa (jak w oryginale)
    const visorGeo = new THREE.SphereGeometry(
      0.258, 18, 10, 0, Math.PI * 2, 0.45, Math.PI * 0.60,
    );
    const visor = new THREE.Mesh(
      visorGeo, new THREE.MeshBasicMaterial({ color: VISOR }),
    );
    visor.rotation.x = 0.20;
    visor.position.set(0, 1.21, 0.09);
    this.root.add(visor);

    // ── GrabPack na plecach ───────────────────────────────────────────────
    const packBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.40, 0.35, 0.16), toonMat(PACK),
    );
    packBox.position.set(0, 0.58, -0.23);
    addOutline(packBox, 0.025);
    this.root.add(packBox);

    // Wyloty kabli (lewa=czerwona, prawa=niebieska)
    [[-0.10, HAND_L], [0.10, HAND_R]].forEach(([ox, col]) => {
      const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.042, 0.042, 0.08, 8), toonMat(col),
      );
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(ox, 0.64, -0.16);
      this.root.add(nozzle);
    });
  }

  // Brak twarzy — zastąpiona przyłbicą w _buildBody
  _buildEyes() {}

  // ─── Kończyny ─────────────────────────────────────────────────────────────
  _buildLimbs() {
    this.lArm = this._makeGrabArm(-1, HAND_L);   // lewa  — czerwona
    this.rArm = this._makeGrabArm( 1, HAND_R);   // prawa — niebieska
    this.lLeg = this._makePlayerLeg(-1);
    this.rLeg = this._makePlayerLeg( 1);
  }

  /**
   * Mechaniczne ramię GrabPacka z dłonią i palcami.
   *
   * Układ współrzędnych inner (po obrocie +π/2 wokół X):
   *   inner +X  →  świat +X  (lewo/prawo)
   *   inner +Y  →  świat +Z  (do przodu)       ← kabel wzdłuż tej osi
   *   inner +Z  →  świat −Y  (w dół)
   *   inner −Z  →  świat +Y  (w górę)
   *
   * Palce: rotation.x = −π/2  →  oś Y palca → inner −Z → świat +Y (do góry) ✓
   * Kciuk: rotation.z = −side·π/2  →  oś Y kciuka → side·inner+X → świat side·X (na bok) ✓
   */
  _makeGrabArm(side, handColor) {
    const outer = new THREE.Group();
    const inner = new THREE.Group();
    const mat   = toonMat(handColor);

    // ── Kabel ────────────────────────────────────────────────────────────
    const cable = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.034, 0.44, 4, 8), toonMat(PACK),
    );
    cable.castShadow = true;
    inner.add(cable);

    // Złącze kabel→dłoń
    const wrist = new THREE.Mesh(
      new THREE.SphereGeometry(0.058, 8, 6), toonMat(PACK),
    );
    wrist.position.y = 0.27;
    inner.add(wrist);

    // ── Dłoń ─────────────────────────────────────────────────────────────
    const hand = new THREE.Group();
    hand.position.y = 0.34;   // = 0.34 jednostki DO PRZODU (inner-Y → świat+Z)
    inner.add(hand);

    // Śródręcze
    const palm = new THREE.Mesh(
      new THREE.BoxGeometry(0.20, 0.052, 0.13), mat,
    );
    addOutline(palm, 0.014);
    hand.add(palm);

    // 4 palce (wskazujące DO GÓRY w świecie):
    //   rotation.x = −π/2 → Y palca → inner −Z → świat +Y ✓
    //   position.z  < 0   → przesunięcie w górę (inner −Z = świat +Y)
    const fDefs = [
      { x: -0.072, len: 0.092 },   // wskazujący
      { x: -0.024, len: 0.110 },   // środkowy (najdłuższy)
      { x:  0.024, len: 0.100 },   // serdeczny
      { x:  0.072, len: 0.076 },   // mały
    ];
    fDefs.forEach(({ x, len }) => {
      const seg = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.020, len, 3, 6), mat,
      );
      seg.rotation.x   = -Math.PI / 2;           // wskazuje w górę
      seg.position.set(x, 0.03, -(0.065 + len / 2)); // ponad dłonią
      hand.add(seg);

      // Staw — mała sfera przy nasadzie palca
      const knuckle = new THREE.Mesh(
        new THREE.SphereGeometry(0.024, 6, 5), toonMat(YELLOW_D),
      );
      knuckle.position.set(x, 0.03, -0.068);
      hand.add(knuckle);
    });

    // Kciuk (wskazuje na bok):
    //   rotation.z = −side·π/2 → Y kciuka → side·inner+X → świat side·X ✓
    const thumb = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.024, 0.072, 3, 6), mat,
    );
    thumb.rotation.z = -side * Math.PI / 2;
    thumb.position.set(-side * 0.11, 0.01, -0.022);
    hand.add(thumb);

    // ── Obrót inner: kabel/dłoń wskazują DO PRZODU (+Z w świecie) ─────────
    inner.rotation.x = Math.PI / 2;
    outer.add(inner);

    outer.position.set(side * 0.26, 0.70, 0.05);
    outer.rotation.z = side * 0.06;
    this.root.add(outer);
    return outer;
  }

  // ─── Nogi ─────────────────────────────────────────────────────────────────
  _makePlayerLeg(side) {
    const g = new THREE.Group();

    const leg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.088, 0.28, 4, 8), toonMat(YELLOW),
    );
    leg.position.y = -0.12;
    leg.castShadow = true;
    addOutline(leg, 0.025);
    g.add(leg);

    // Staw kolanowy
    const knee = new THREE.Mesh(
      new THREE.SphereGeometry(0.096, 8, 6), toonMat(YELLOW_D),
    );
    knee.position.y = -0.22;
    g.add(knee);

    const boot = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.13, 0.26), toonMat(BOOT),
    );
    boot.position.set(side * 0.01, -0.30, 0.04);
    addOutline(boot, 0.018);
    g.add(boot);

    g.position.set(side * 0.17, 0.18, 0);
    this.root.add(g);
    return g;
  }
}

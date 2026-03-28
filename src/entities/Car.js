import * as THREE from 'three';
import { Entity } from './Entity.js';
import { toonMat, addOutline } from '../core/Materials.js';
import { CANNON_CHASSIS_OFFSET } from '../core/VehiclePhysics.js';
import { isOnRoad, isOnHardSurface } from '../world/zones.js';

// ─── Rozmiar Rapier collidera (kinematic box, dla kolizji gracza z autem) ─────
export const CAR_BOX_HH = 0.70;   // half-height
export const CAR_BOX_HW = 1.07;   // half-width
export const CAR_BOX_HD = 2.20;   // half-depth

// ─── Stałe geometrii kół ──────────────────────────────────────────────────────
const WHEEL_R  = 0.40;   // promień opony
const WHEEL_W  = 0.26;   // szerokość opony
const WHEEL_X  = 1.12;   // half-track
const AXLE_ZF  =  1.52;  // Z osi przedniej
const AXLE_ZR  = -1.52;  // Z osi tylnej

// ─── Stałe jazdy (cannon-es RaycastVehicle) ───────────────────────────────────
const MAX_ENGINE_FORCE   = 10800; // N na koło tylne (+20% vs 9000, wheelspin przy ruszaniu)
const MAX_BRAKE_FORCE    = 175;   // Nm hamowania — grywalne, płynne hamowanie (GTA-feel)
const BRAKE_GRASS_MULT   = 0.46;  // trawa: 46% siły hamowania (+20% grip)
const HAND_BRAKE_FORCE   = 700;   // Nm hamulca ręcznego (tylne koła, drift)
const IDLE_BRAKE         = 8;     // tarcie spoczynkowe (parking na stoku)
const MAX_STEER_ANGLE  = 0.78;   // rad (≈45°)
const STEER_SPEED      = 3.2;    // szybkość rampy kierownicy (1/s)
const MAX_SPEED_KMH    = 260;    // limit prędkości do przodu (+30%)
const MAX_REV_KMH      = 35;     // limit cofania

export class Car extends Entity {
  constructor(scene, color = 0xFF4444) {
    super(scene);
    this._scene     = scene;
    this.color      = color;
    this.facing     = 0;
    this.isOccupied = false;
    this._wheels    = [];
    // cannon-es
    this._vehicle   = null;   // CANNON.RaycastVehicle
    this._chassis   = null;   // CANNON.Body
    this._steer     = 0;      // wygładzona wartość kierownicy [-1..1]
    this._throttle  = 0;      // wygładzony gaz [0..1]
    this._brake     = 0;      // wygładzone hamowanie [0..1]
    // Rapier kinematic body (kolizja gracza z autem)
    this._body      = null;
    // Ślady hamowania
    this._skidState     = null;   // inicjalizowany w initPhysics()
    // Dźwięki
    this._audio         = null;   // ustawiany przez Game przy wsiadaniu/wysiadaniu
    this._prevHandbrake = false;
    // Zniszczenia — progresywna deformacja zderzaków i maski
    this._damageFront = 0;   // 0–1: 0 = brak, 1 = max
    this._damageRear  = 0;
    // Referencje do deformowalnych siatek (ustawiane w _build)
    this._fBumper  = null;   // zderzak przedni (chrome bar)
    this._rBumper  = null;   // zderzak tylny
    this._hoodMesh = null;   // maska
    this._trunkMesh = null;  // bagażnik
    // Wydech
    this._exhaust       = null;   // inicjalizowany w initPhysics()
    this._rpmFactor     = 0;      // 0=jałowy, 1=pełne obroty (ustawiany w update)
    // Materiały świateł (do dynamicznej zmiany koloru)
    this._tailMat       = null;   // stop + pozycyjne tylne
    this._revMat        = null;   // cofania
    this._build();
  }

  /** Przyciemnia kolor o współczynnik f (0–1). */
  _shade(hex, f) {
    return (Math.round(((hex >> 16) & 0xff) * f) << 16)
         | (Math.round(((hex >>  8) & 0xff) * f) <<  8)
         |  Math.round(( hex        & 0xff) * f);
  }

  // ─── Budowanie siatki 3D ───────────────────────────────────────────────────

  _build() {
    const col      = this.color;
    const bodyMat  = toonMat(col);
    const darkMat  = toonMat(this._shade(col, 0.68));
    const glassMat = new THREE.MeshToonMaterial({ color: 0x6EC6E0, transparent: true, opacity: 0.70 });
    const tireMat  = toonMat(0x1A1A1A);
    const rimMat   = toonMat(0xC8C8C8);
    const chromeMat= toonMat(0xDEDEDE);
    const blackMat = toonMat(0x111111);
    const sillMat  = toonMat(0x222222);
    const headMat  = new THREE.MeshBasicMaterial({ color: 0xFFFDE0 }); // reflektory — zawsze jasne
    const drlMat   = new THREE.MeshBasicMaterial({ color: 0xFFFFFF }); // DRL strip
    this._tailMat  = new THREE.MeshBasicMaterial({ color: 0x330000 }); // stop — przyciemnione (off)
    this._revMat   = new THREE.MeshBasicMaterial({ color: 0x0A0800 }); // cofania — wyłączone
    const tailMat  = this._tailMat;
    const indMat   = toonMat(0xFF8800);   // kierunkowskazy
    const revMat   = this._revMat;
    const fogMat   = toonMat(0xFFFACC);   // lampy przeciwmgielne

    // Pomocnik: dodaj box do this.root
    const B = (x, y, z, w, h, d, mat, ol = 0, shadow = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      if (shadow) m.castShadow = true;
      if (ol > 0) addOutline(m, ol);
      this.root.add(m);
      return m;
    };

    // ─── Y-landmarks (od y=0 = powierzchnia drogi) ──────────────────────────
    const SUSP_BOT  = WHEEL_R + 0.10;             // 0.50  dół podwozia
    const CHASS_H   = 0.18;
    const CHASS_Y   = SUSP_BOT + CHASS_H / 2;     // 0.59
    const BODY_BOT  = SUSP_BOT + CHASS_H;         // 0.68
    const BODY_H    = 0.54;
    const BODY_Y    = BODY_BOT + BODY_H / 2;      // 0.95
    const CAB_BOT   = BODY_BOT + BODY_H;          // 1.22
    const CAB_H     = 0.68;
    const CAB_Y     = CAB_BOT + CAB_H / 2;        // 1.56
    const CAB_ZOff  = 0.10;                        // kabina lekko ku przodowi
    const CAB_HL    = 1.25;                        // half-length kabiny
    const CAB_ZF    = CAB_ZOff + CAB_HL;          // 1.35  przednia ściana kabiny
    const CAB_ZR    = CAB_ZOff - CAB_HL;          // -1.15 tylna ściana kabiny
    const ROOF_BOT  = CAB_BOT + CAB_H;            // 1.90

    // Stałe Z dla całego nadwozia
    const BODY_HLZ  = 2.20;   // half-length dolnego nadwozia
    const BODY_ZF   = BODY_HLZ;                  //  2.20  przód nadwozia
    const BODY_ZR   = -BODY_HLZ;                 // -2.20  tył nadwozia

    // ── 1. KOŁA ─────────────────────────────────────────────────────────────
    const wheelDefs = [
      { x: -WHEEL_X, z: AXLE_ZF, isFront: true  },
      { x:  WHEEL_X, z: AXLE_ZF, isFront: true  },
      { x: -WHEEL_X, z: AXLE_ZR, isFront: false },
      { x:  WHEEL_X, z: AXLE_ZR, isFront: false },
    ];
    wheelDefs.forEach(({ x, z, isFront }) => {
      const outer = new THREE.Group();
      const inner = new THREE.Group();

      // Opona (czarny cylinder)
      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, WHEEL_W, 16), tireMat,
      );
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      addOutline(tire, 0.04);
      inner.add(tire);

      // Obręcz (jasny cylinder wewnątrz opony)
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(WHEEL_R * 0.62, WHEEL_R * 0.62, WHEEL_W + 0.04, 12), rimMat,
      );
      rim.rotation.z = Math.PI / 2;
      inner.add(rim);

      // 3 szprychy felgi — 6-ramienny wzór (każda przez centrum ×2 strony)
      for (let s = 0; s < 3; s++) {
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(WHEEL_W + 0.06, WHEEL_R * 1.48, 0.09), rimMat,
        );
        spoke.rotation.x = (s / 3) * Math.PI;
        inner.add(spoke);
      }

      // Piasta (czarny środek)
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(WHEEL_R * 0.16, WHEEL_R * 0.16, WHEEL_W + 0.08, 8), blackMat,
      );
      hub.rotation.z = Math.PI / 2;
      inner.add(hub);

      outer.add(inner);
      outer.position.set(x, WHEEL_R, z);
      this.root.add(outer);
      this._wheels.push({ outer, inner, isFront });
    });

    // ── 2. OSIE (cylindry łączące L↔R koła) ─────────────────────────────────
    [AXLE_ZF, AXLE_ZR].forEach(az => {
      const axle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, WHEEL_X * 2 + WHEEL_W + 0.10, 8), blackMat,
      );
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0, WHEEL_R, az);
      this.root.add(axle);
    });

    // ── 3. PODWOZIE (floating — nie dotyka drogi) ────────────────────────────
    B(0, CHASS_Y, 0, 1.82, CHASS_H, 3.60, bodyMat, 0.03);

    // Boczne progi ramy podwozia
    [-0.76, 0.76].forEach(x =>
      B(x, CHASS_Y, 0, 0.14, CHASS_H + 0.04, 3.70, darkMat, 0, false),
    );

    // ── 4. NADWOZIE DOLNE (drzwi, boki) ─────────────────────────────────────
    B(0, BODY_Y, 0, 2.14, BODY_H, 4.40, bodyMat, 0.04);

    // Progi boczne (sill) — czarna listwa pod drzwiami
    [-1.08, 1.08].forEach(x =>
      B(x, BODY_BOT + 0.07, 0, 0.10, 0.14, 3.80, sillMat, 0, false),
    );

    // ── 5. MASKA SILNIKA ─────────────────────────────────────────────────────
    const HOOD_Z  = (CAB_ZF + BODY_ZF) / 2;   // centrum maski
    const HOOD_L  = BODY_ZF - CAB_ZF;          // długość maski = 0.85
    this._hoodMesh = B(0, CAB_BOT - 0.03, HOOD_Z, 2.10, 0.14, HOOD_L, bodyMat, 0.03);

    // Linia przetłoczenia na masce (ozdoba)
    B(0, CAB_BOT + 0.04, HOOD_Z, 0.60, 0.06, HOOD_L - 0.10, darkMat, 0, false);

    // ── 6. POKRYWA BAGAŻNIKA ─────────────────────────────────────────────────
    const TRUNK_Z = (CAB_ZR + BODY_ZR) / 2;
    const TRUNK_L = Math.abs(BODY_ZR - CAB_ZR);
    this._trunkMesh = B(0, CAB_BOT - 0.03, TRUNK_Z, 2.10, 0.14, TRUNK_L, bodyMat, 0.03);

    // ── 7. ZDERZAK PRZEDNI ───────────────────────────────────────────────────
    // Górna belka (chrom) — poniżej reflektorów (bottom reflektora = BODY_BOT + BODY_H*0.73 - 0.15 ≈ 0.924)
    this._fBumper = B(0, BODY_BOT + 0.10, BODY_ZF + 0.10, 2.12, 0.22, 0.18, chromeMat, 0.025);
    // Dolna warga (czarna)
    B(0, BODY_BOT + 0.03, BODY_ZF + 0.09, 1.88, 0.14, 0.14, blackMat, 0, false);
    // Kratka wlotowa
    B(0, BODY_BOT + 0.22, BODY_ZF + 0.08, 1.38, 0.16, 0.08, blackMat, 0, false);
    [-0.46, 0, 0.46].forEach(x =>
      B(x, BODY_BOT + 0.22, BODY_ZF + 0.09, 0.07, 0.20, 0.10, chromeMat, 0, false),
    );
    // Lampy przeciwmgielne (przednie, w zderzaku)
    [-0.74, 0.74].forEach(x =>
      B(x, BODY_BOT + 0.14, BODY_ZF + 0.10, 0.24, 0.14, 0.08, fogMat, 0, false),
    );

    // ── 8. ZDERZAK TYLNY ─────────────────────────────────────────────────────
    this._rBumper = B(0, BODY_BOT + 0.08, BODY_ZR - 0.09, 2.12, 0.22, 0.16, chromeMat, 0.025);
    B(0, BODY_BOT + 0.03, BODY_ZR - 0.08, 1.88, 0.14, 0.12, blackMat, 0, false);

    // ── 9. REFLEKTORY PRZEDNIE ───────────────────────────────────────────────
    [-0.73, 0.73].forEach(x => {
      // Obudowa
      B(x, BODY_BOT + BODY_H * 0.73, BODY_ZF + 0.05, 0.56, 0.30, 0.10, darkMat, 0.025);
      // Soczewka główna
      B(x, BODY_BOT + BODY_H * 0.73, BODY_ZF + 0.10, 0.42, 0.22, 0.06, headMat, 0, false);
      // Pasek DRL (nad reflektorem)
      B(x, BODY_BOT + BODY_H * 0.92, BODY_ZF + 0.09, 0.54, 0.07, 0.07, drlMat, 0, false);
      // Kierunkowskaz przedni (pod reflektorem)
      B(x, BODY_BOT + BODY_H * 0.42, BODY_ZF + 0.09, 0.34, 0.12, 0.07, indMat, 0, false);
    });

    // ── 10. TYLNE ŚWIATŁA ────────────────────────────────────────────────────
    [-0.73, 0.73].forEach(x => {
      // Obudowa
      B(x, BODY_BOT + BODY_H * 0.68, BODY_ZR - 0.05, 0.56, 0.38, 0.10, darkMat, 0.025);
      // Światło stop
      B(x, BODY_BOT + BODY_H * 0.82, BODY_ZR - 0.10, 0.42, 0.16, 0.06, tailMat, 0, false);
      // Kierunkowskaz tylny
      B(x, BODY_BOT + BODY_H * 0.60, BODY_ZR - 0.10, 0.42, 0.12, 0.06, indMat, 0, false);
      // Cofania
      B(x, BODY_BOT + BODY_H * 0.40, BODY_ZR - 0.10, 0.22, 0.12, 0.06, revMat, 0, false);
    });

    // Środkowa naklejka rejestracyjna (wizual)
    B(0, BODY_BOT + 0.22, BODY_ZR - 0.10, 0.70, 0.16, 0.04, chromeMat, 0, false);

    // ── 11. KABINA ───────────────────────────────────────────────────────────
    B(0, CAB_Y, CAB_ZOff, 1.92, CAB_H, CAB_HL * 2, bodyMat, 0.04);

    // ── 12. DACH ─────────────────────────────────────────────────────────────
    B(0, ROOF_BOT + 0.05, CAB_ZOff, 1.98, 0.10, CAB_HL * 2 + 0.08, bodyMat, 0.025);

    // Reling dachowy (ozdoba)
    [-0.70, 0.70].forEach(x =>
      B(x, ROOF_BOT + 0.09, CAB_ZOff, 0.06, 0.06, CAB_HL * 1.70, darkMat, 0, false),
    );

    // ── 13. SZYBA PRZEDNIA ───────────────────────────────────────────────────
    // Ramka (czarna, nieco większa)
    B(0, CAB_Y + 0.02, CAB_ZF + 0.02, 1.84, CAB_H * 0.84, 0.06, blackMat, 0, false);
    // Szkło
    B(0, CAB_Y + 0.02, CAB_ZF + 0.05, 1.68, CAB_H * 0.76, 0.05, glassMat, 0, false);
    // Wycieraczki
    [-0.40, 0.40].forEach(x =>
      B(x, CAB_BOT + 0.10, CAB_ZF + 0.07, 0.06, 0.38, 0.04, blackMat, 0, false),
    );

    // ── 14. SZYBA TYLNA ──────────────────────────────────────────────────────
    B(0, CAB_Y,       CAB_ZR - 0.02, 1.72, CAB_H * 0.78, 0.06, blackMat, 0, false);
    B(0, CAB_Y,       CAB_ZR - 0.05, 1.58, CAB_H * 0.70, 0.05, glassMat, 0, false);

    // ── 15. SZYBY BOCZNE ─────────────────────────────────────────────────────
    const CAB_HW = 1.92 / 2;  // half-width kabiny
    [-CAB_HW - 0.01, CAB_HW + 0.01].forEach(x => {
      // Szyba drzwi przednich
      B(x, CAB_Y + 0.03, CAB_ZOff + 0.58, 0.05, CAB_H * 0.74, 0.94, glassMat, 0, false);
      // Słupek B (czarny pasek między szybami)
      B(x, CAB_Y, CAB_ZOff + 0.06, 0.05, CAB_H * 0.84, 0.10, blackMat, 0, false);
      // Szyba drzwi tylnych
      B(x, CAB_Y + 0.03, CAB_ZOff - 0.52, 0.05, CAB_H * 0.68, 0.76, glassMat, 0, false);
    });

    // ── 16. LUSTERKA BOCZNE ──────────────────────────────────────────────────
    [-1, 1].forEach(side => {
      const mx = side * (CAB_HW + 0.08);
      // Ramię
      B(mx + side * 0.05, CAB_BOT + 0.30, CAB_ZF - 0.18,
        0.16, 0.06, 0.10, bodyMat, 0, false);
      // Obudowa lusterka
      B(mx + side * 0.12, CAB_BOT + 0.30, CAB_ZF - 0.18,
        0.10, 0.18, 0.24, darkMat, 0.020);
    });

    // ── 17. LINIA PODZIAŁU DRZWI ─────────────────────────────────────────────
    [-1.08, 1.08].forEach(x => {
      // Pionowy podział przód/tył
      B(x, BODY_Y + 0.05, CAB_ZOff + 0.08, 0.04, BODY_H * 0.80, 0.05, blackMat, 0, false);
      // Dolna klamka (mała prostokątna wypukłość)
      B(x + (x > 0 ? -0.02 : 0.02), BODY_BOT + BODY_H * 0.52,
        CAB_ZOff + 0.38, 0.06, 0.08, 0.22, chromeMat, 0, false);
    });

    // ── 18. WLEW PALIWA ──────────────────────────────────────────────────────
    const fuelCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10), chromeMat,
    );
    fuelCap.rotation.z = Math.PI / 2;
    fuelCap.position.set(1.09, BODY_BOT + BODY_H * 0.55, -0.85);
    this.root.add(fuelCap);
    // Wgłębienie wlewu
    B(1.09, BODY_BOT + BODY_H * 0.55, -0.85, 0.04, 0.22, 0.22, darkMat, 0, false);

    // ── 19. RURA WYDECHOWA ───────────────────────────────────────────────────
    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.065, 0.20, 10), chromeMat,
    );
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(0.65, BODY_BOT + 0.09, BODY_ZR - 0.11);
    this.root.add(exhaust);
    // Czarna dziura rury
    const exhaustInner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.046, 0.046, 0.22, 8), blackMat,
    );
    exhaustInner.rotation.x = Math.PI / 2;
    exhaustInner.position.set(0.65, BODY_BOT + 0.09, BODY_ZR - 0.12);
    this.root.add(exhaustInner);

    // ── 20. ANTENA ───────────────────────────────────────────────────────────
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.40, 5), blackMat,
    );
    antenna.position.set(0.52, ROOF_BOT + 0.20, CAB_ZOff - 0.55);
    this.root.add(antenna);

  }

  // ─── Fizyka ───────────────────────────────────────────────────────────────

  /**
   * Inicjalizuje fizykę pojazdu.
   * @param {VehiclePhysics} vehiclePhysics  cannon-es świat pojazdów
   * @param {PhysicsWorld}   rapierPhysics   Rapier świat (dla kolizji gracza z autem)
   */
  initPhysics(vehiclePhysics, rapierPhysics, x, y, z) {
    const { vehicle, chassis } = vehiclePhysics.createVehicle(x, y, z, this.facing);
    this._vehicle = vehicle;
    this._chassis = chassis;

    // Rapier kinematic body — tylko dla kolizji gracza z autem
    const { body } = rapierPhysics.addVehicleBox(
      x, CANNON_CHASSIS_OFFSET, z,
      CAR_BOX_HW, CAR_BOX_HH, CAR_BOX_HD,
    );
    this._body = body;

    // Zaparkowane auto stoi w miejscu (hamulec)
    for (let i = 0; i < 4; i++) this._vehicle.setBrake(MAX_BRAKE_FORCE, i);

    // Listener kolizji — dźwięk zależny od materiału przeszkody
    this._chassis.addEventListener('collide', (event) => {
      const vel = Math.abs(event.contact.getImpactVelocityAlongNormal?.() ?? 0);

      // Przewracanie lampy
      if (event.body?._type === 'lamp' && vel > 3) {
        const ni = event.contact.ni ?? { x: 0, z: 1 };
        event.body._lampRef?.knockDown(vel, -ni.x, -ni.z);
      }

      // Dźwięk zderzenia
      const mat = event.body?._material;
      if (mat && mat !== 'ground') {
        this._audio?.playCollision(mat, vel);
      }

      // Zniszczenia wizualne
      if (vel >= 4) this._handleImpact(vel, event.contact);
    });

    this.root.position.set(x, y, z);
    this.root.rotation.y = this.facing;

    this._initSkidMarks();
    this._initExhaust();
  }

  // ─── Gettery ──────────────────────────────────────────────────────────────

  get speedKmh() {
    return this._vehicle ? this._vehicle.currentVehicleSpeedKmHour : 0;
  }

  /** Aktualny kąt skrętu kół (wygładzony, radiany, wartość bezwzględna). */
  get steerAngle() { return Math.abs(this._steer ?? 0); }

  /** True gdy auto aktywnie hamuje (S / L2). */
  get isBraking() { return !!this._isBraking; }

  get isSkidding() {
    return this._skidState ? this._skidState.some(s => s.active) : false;
  }

  /** Maksymalny slip ratio kół [0..1]: 0 = swobodne toczenie, 1 = zablokowane. */
  get wheelSlip() { return this._maxWheelSlip ?? 0; }

  /** Inicjalizuje system śladów — 4 koła (FL, FR, RL, RR). */
  _initSkidMarks() {
    this._skidState = [0, 1, 2, 3].map(() => ({
      active:         false,
      ribbonPts:      [],   // flat: [x0,y0,z0, x1,y1,z1, ...]
      mesh:           null,
      quadCount:      0,
      pool:           [],   // maks 10 starych śladów per koło
      surface:        null,        // 'hard' | 'grass' — bieżąca nawierzchnia segmentu
      transitionLeft: 0,           // punkty przejścia brąz→czarny (trawa→asfalt)
    }));
  }

  /** Tworzy nowy aktywny ślad jako wstążkę (szerokość = bieżnik opony). */
  _startSkidLine(state, color) {
    const MAX_QUADS = 400;
    // Pre-allokacja bufora werteksów i indeksów
    const positions = new Float32Array(MAX_QUADS * 4 * 3);
    const indices   = new Uint32Array(MAX_QUADS * 6);
    for (let q = 0; q < MAX_QUADS; q++) {
      const i = q * 6, b = q * 4;
      indices[i]   = b;   indices[i+1] = b+2; indices[i+2] = b+1;
      indices[i+3] = b+1; indices[i+4] = b+2; indices[i+5] = b+3;
    }
    const posAttr = new THREE.BufferAttribute(positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', posAttr);
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.setDrawRange(0, 0);

    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.60, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    this._scene.add(mesh);

    state.mesh      = mesh;
    state.ribbonPts = [];
    state.quadCount = 0;
    state.active    = true;
  }

  /** Zamyka aktywny ślad (finalizuje geometrię). */
  _endSkidLine(state) {
    if (state.mesh && state.quadCount >= 1) {
      state.pool.push(state.mesh);
      if (state.pool.length > 10) {
        const old = state.pool.shift();
        this._scene.remove(old);
        old.geometry.dispose();
        old.material.dispose();
      }
    } else if (state.mesh) {
      this._scene.remove(state.mesh);
      state.mesh.geometry.dispose();
      state.mesh.material.dispose();
    }
    state.mesh      = null;
    state.ribbonPts = [];
    state.quadCount = 0;
    state.active    = false;
  }

  /** Dopisuje segment wstążki (quad prostopadły do kierunku jazdy). */
  _appendSkidPoint(state, x, y, z) {
    state.ribbonPts.push(x, y, z);
    const n = state.ribbonPts.length / 3;   // liczba punktów
    if (n < 2 || state.quadCount >= 400) return;

    const HW  = WHEEL_W / 2;                // pół szerokości bieżnika ≈ 0.13 m
    const pts = state.ribbonPts;
    const i0  = (n - 2) * 3, i1 = (n - 1) * 3;
    const p0x = pts[i0], p0z = pts[i0+2];
    const p1x = pts[i1], p1z = pts[i1+2];

    // Kierunek jazdy → prostopadły w XZ
    let tdx = p1x - p0x, tdz = p1z - p0z;
    const len = Math.sqrt(tdx * tdx + tdz * tdz);
    if (len < 0.001) return;
    tdx /= len; tdz /= len;
    const px = -tdz, pz = tdx;   // perpendicular

    const posArr = state.mesh.geometry.attributes.position.array;
    const q = state.quadCount;
    const v = q * 4 * 3;
    posArr[v]    = p0x - px*HW; posArr[v+1]  = y; posArr[v+2]  = p0z - pz*HW;
    posArr[v+3]  = p0x + px*HW; posArr[v+4]  = y; posArr[v+5]  = p0z + pz*HW;
    posArr[v+6]  = p1x - px*HW; posArr[v+7]  = y; posArr[v+8]  = p1z - pz*HW;
    posArr[v+9]  = p1x + px*HW; posArr[v+10] = y; posArr[v+11] = p1z + pz*HW;

    state.mesh.geometry.attributes.position.needsUpdate = true;
    state.quadCount = q + 1;
    state.mesh.geometry.setDrawRange(0, state.quadCount * 6);
  }

  // ─── Dym wydechu ──────────────────────────────────────────────────────────

  /** Inicjalizuje system cząsteczek dymu. Wywołaj po initPhysics(). */
  _initExhaust() {
    this._exhaust = { particles: [], timer: 0 };
  }

  _updateExhaust(dt) {
    const ex = this._exhaust;
    if (!ex) return;

    const rpm = this._rpmFactor ?? 0.05;

    // Spawn: interwał maleje przy wyższych obrotach (0.50s jałowy → 0.22s pełny gaz)
    const interval = 0.50 - rpm * 0.28;
    ex.timer += dt;
    if (this.isOccupied && ex.timer > interval) {
      ex.timer = 0;
      this._spawnExhaustParticle(rpm);
    }

    // Aktualizuj istniejące cząsteczki
    const maxLife = 1.3 - rpm * 0.5;   // 0.8..1.3 s
    for (let i = ex.particles.length - 1; i >= 0; i--) {
      const p = ex.particles[i];
      p.life += dt;
      const t = p.life / maxLife;
      if (t >= 1) {
        this._scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        ex.particles.splice(i, 1);
        continue;
      }
      // Drobna turbulencja horyzontalna — naturalny dryf dymu
      p.vx += (Math.random() - 0.5) * 0.08;
      p.vz += (Math.random() - 0.5) * 0.08;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.scale.setScalar(0.5 + t * (1.1 + rpm * 0.7));
      // Szybkie zanikanie — potęgowa krzywa (naturalny dym)
      p.mesh.material.opacity = p.maxOpacity * Math.pow(1 - t, 1.4);
    }
  }

  _spawnExhaustParticle(rpm = 0.05) {
    const f  = this.facing;
    const lx = 0.65, ly = 0.77, lz = -2.31;
    const wx = this.root.position.x + lx * Math.cos(f) + lz * Math.sin(f);
    const wy = this.root.position.y + ly;
    const wz = this.root.position.z - lx * Math.sin(f) + lz * Math.cos(f);

    // Rozmiar i kolor cząsteczki skalowane przez obroty
    // Jałowy: drobna, prawie biała; pełny gaz: większa, szara
    const radius  = 0.12 + rpm * 0.14;                      // 0.12..0.26
    const opacity = 0.10 + rpm * 0.24;                      // 0.10..0.34
    const grey    = Math.round(210 - rpm * 70);              // 210..140 (delikatnie ciemnieje)
    const color   = (grey << 16) | (grey << 8) | grey;

    const geo = new THREE.SphereGeometry(radius, 5, 4);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(wx, wy, wz);
    mesh.renderOrder = 1;
    this._scene.add(mesh);

    // Prędkość: ku górze + delikatny dryf boczny + przy gas wystrzelony ku tyłowi
    const backSpeed = rpm * 1.8;
    this._exhaust.particles.push({
      mesh,
      life: 0,
      maxOpacity: opacity,
      vx: (Math.random() - 0.5) * 0.50 - Math.sin(f) * backSpeed,
      vy: 0.9 + rpm * 1.0 + Math.random() * 0.5,
      vz: (Math.random() - 0.5) * 0.50 - Math.cos(f) * backSpeed,
    });
  }

  // ─── Zniszczenia ──────────────────────────────────────────────────────────

  /**
   * Wywołuje się z listenera kolizji.
   * @param {number} vel        prędkość uderzenia [m/s]
   * @param {object} contact    cannon-es ContactEquation
   */
  _handleImpact(vel, contact) {
    if (vel < 4) return;   // min. 4 m/s by powstało uszkodzenie

    // Wyznacz strefę uderzenia (przód/tył) na podstawie punktu kontaktu.
    // contact.ri = wektor od środka chassis do punktu kontaktu (world space).
    // Zrzutuj na oś przód-tył pojazdu (oś Z rotacji chassis).
    const ri = contact.ri;   // {x, y, z}
    const q  = this._chassis.quaternion;
    // Kolumna Z macierzy rotacji z kwaterniona
    const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
    const isfront = (ri.x * (2 * (q.x * q.z + q.w * q.y))
                   + ri.y * (2 * (q.y * q.z - q.w * q.x))
                   + ri.z * fz) > 0;

    const dmg = Math.min(1, (vel - 4) / 20) * 0.35;   // max ~35% uszkodzenia per uderzenie

    if (isfront) {
      this._damageFront = Math.min(1, this._damageFront + dmg);
    } else {
      this._damageRear  = Math.min(1, this._damageRear  + dmg);
    }
    this._refreshDamageVisual();
  }

  /** Aktualizuje wygląd mesh'y deformowalnych na podstawie aktualnych uszkodzeń. */
  _refreshDamageVisual() {
    // Zderzak przedni — ściśnięty w Z, cofnięty (pozycja bazowa zapamiętana przy pierwszym wywołaniu)
    if (this._fBumper) {
      const f = this._damageFront;
      if (this._fBumperBaseZ === undefined) this._fBumperBaseZ = this._fBumper.position.z;
      this._fBumper.scale.z    = Math.max(0.15, 1 - f * 0.85);
      this._fBumper.position.z = this._fBumperBaseZ - f * 0.25;   // bezwzględne przesunięcie
      // Lekkie ugięcie góry/dołu przy dużym uszkodzeniu
      this._fBumper.scale.y = 1 + f * 0.20;
    }
    // Zderzak tylny
    if (this._rBumper) {
      const r = this._damageRear;
      if (this._rBumperBaseZ === undefined) this._rBumperBaseZ = this._rBumper.position.z;
      this._rBumper.scale.z    = Math.max(0.15, 1 - r * 0.85);
      this._rBumper.position.z = this._rBumperBaseZ + r * 0.25;
      this._rBumper.scale.y = 1 + r * 0.20;
    }
    // Maska — lekko unosi się i przekrzywia przy dużym uszkodzeniu przodu
    if (this._hoodMesh) {
      const f = this._damageFront;
      if (this._hoodBaseY === undefined) this._hoodBaseY = this._hoodMesh.position.y;
      this._hoodMesh.rotation.x = -f * 0.25;
      this._hoodMesh.position.y = this._hoodBaseY + f * 0.04;
      this._hoodMesh.scale.z = Math.max(0.7, 1 - f * 0.25);
    }
    // Bagażnik
    if (this._trunkMesh) {
      const r = this._damageRear;
      if (this._trunkBaseY === undefined) this._trunkBaseY = this._trunkMesh.position.y;
      this._trunkMesh.rotation.x =  r * 0.25;
      this._trunkMesh.position.y = this._trunkBaseY + r * 0.04;
      this._trunkMesh.scale.z = Math.max(0.7, 1 - r * 0.25);
    }
  }

  // ─── Cykl klatki ──────────────────────────────────────────────────────────

  /**
   * Wywołaj PRZED vehiclePhysics.step().
   * Aplikuje siły wejściowe do cannon-es RaycastVehicle.
   */
  update(dt, input, audio) {
    this._dt = dt;
    // Gaz do przodu: W / ArrowUp / R2
    const fwdK       = (input.isDown('KeyW') || input.isDown('ArrowUp'))   ? 1 : 0;
    // Cofanie / hamulec: S / ArrowDown / L2
    const revK       = (input.isDown('KeyS') || input.isDown('ArrowDown')) ? 1 : 0;
    const rawFwd = Math.max(fwdK, input.pad.r2 ?? 0);  // docelowy gaz/hamo. w przód
    const rawBack= Math.max(revK, input.pad.l2 ?? 0);  // docelowy gaz/hamo. w tył

    // Analogowe wygładzanie — narastanie szybsze niż opadanie (jak fizyczny pedał)
    const tauOn  = 0.08;  // 80 ms narastania  (szybka odpowiedź)
    const tauOff = 0.05;  // 50 ms opadania    (szybkie puszczenie → brak poślizgu po puszczeniu)
    this._throttle += (rawFwd - this._throttle) * Math.min(1, dt / (rawFwd > this._throttle ? tauOn : tauOff));
    this._brake    += (rawBack - this._brake)    * Math.min(1, dt / (rawBack > this._brake  ? tauOn : tauOff));

    const forwAmount = this._throttle;
    const backAmount = this._brake;
    const gasIn = forwAmount - backAmount;

    // Skręt: A/D / ArrowLeft/Right / lewy analog X
    const steerKL = (input.isDown('KeyA') || input.isDown('ArrowLeft'))  ? 1 : 0;
    const steerKR = (input.isDown('KeyD') || input.isDown('ArrowRight')) ? 1 : 0;
    const padSteer = Math.abs(input.pad.leftX) > 0.12 ? -input.pad.leftX : 0;
    const steerIn = padSteer !== 0 ? padSteer : (steerKL - steerKR);

    // ── Skręt — wygładzony lerp, kąt maleje przy dużej prędkości ────────────
    const absSpd0   = Math.abs(this._speedKmh ?? 0);
    const steerMult = Math.max(0.30, 1 - absSpd0 / 160);  // 1.0 przy 0 → 0.3 przy 112+ km/h
    this._steer += (steerIn * MAX_STEER_ANGLE * steerMult - this._steer) * Math.min(1, STEER_SPEED * dt);
    this._vehicle.setSteeringValue(this._steer, 0);  // FL
    this._vehicle.setSteeringValue(this._steer, 1);  // FR

    // ── Hamulec ręczny (B) — blokuje tylne koła, umożliwia drifting ─────────
    const handBrake = input.isDown('Space') || input.isPadButtonDown?.(1);
    if (handBrake && !this._prevHandbrake) {
      audio?.playHandbrake(this._vehicle.currentVehicleSpeedKmHour);
    }
    this._prevHandbrake = handBrake;

    // ── Nawierzchnia — raz dla całego bloku ──────────────────────────────────
    const cx = this._chassis.position.x;
    const cz = this._chassis.position.z;
    const onRoad      = isOnRoad(cx, cz);
    // μ_peak: asfalt≈0.85, beton≈0.75 (×0.88), trawa≈0.35 (×0.41 → grywalnie 0.22)
    const onSidewalk  = !onRoad && isOnHardSurface(cx, cz);
    const brakeSurf   = onRoad ? 1.0 : (onSidewalk ? 0.88 : BRAKE_GRASS_MULT);

    // ── Gaz / hamulec ────────────────────────────────────────────────────────
    const speedKmh = this._vehicle.currentVehicleSpeedKmHour;
    const absSpd   = Math.abs(speedKmh);
    let engineForce = 0;
    let brakeForce  = 0;   // domyślnie 0 — auto toczy się swobodnie (opór = linearDamping)

    if (handBrake) {
      // Hamulec ręczny: tylne koła zablokowane; gaz + handbrake = donut
      if (gasIn > 0 && speedKmh > -1) {
        engineForce = -MAX_ENGINE_FORCE * forwAmount;
      }
      this._vehicle.applyEngineForce(engineForce, 2);  // RL — napęd (donut gdy gaz)
      this._vehicle.applyEngineForce(engineForce, 3);  // RR — napęd (donut gdy gaz)
      this._vehicle.applyEngineForce(0,            0);  // FL — brak napędu
      this._vehicle.applyEngineForce(0,            1);  // FR — brak napędu
      this._vehicle.setBrake(0,                            0);  // FL — wolne
      this._vehicle.setBrake(0,                            1);  // FR — wolne
      this._vehicle.setBrake(HAND_BRAKE_FORCE * brakeSurf, 2);  // RL — zablokowane
      this._vehicle.setBrake(HAND_BRAKE_FORCE * brakeSurf, 3);  // RR — zablokowane
    } else {
      if (gasIn > 0) {
        if (speedKmh < -1) {
          // Hamowanie podczas cofania
          brakeForce = MAX_BRAKE_FORCE * forwAmount * brakeSurf;
        } else if (speedKmh < MAX_SPEED_KMH) {
          engineForce = -MAX_ENGINE_FORCE * gasIn;
          brakeForce  = 0;
        }
      } else if (gasIn < 0) {
        if (speedKmh > 1) {
          // Hamowanie podczas jazdy do przodu — skalowane przez nawierzchnię
          brakeForce = MAX_BRAKE_FORCE * backAmount * brakeSurf;
        } else if (speedKmh > -MAX_REV_KMH) {
          engineForce = MAX_ENGINE_FORCE * (-gasIn);
          brakeForce  = 0;
        }
      } else {
        // Brak gazu i brak hamulca — swobodne toczenie
        // Parking: zatrzymaj gdy prawie stoi (zabezpieczenie na stoku)
        if (absSpd < 1.5) brakeForce = IDLE_BRAKE;
      }

      // Otwarty dyferencjał tylny (RWD)
      this._vehicle.applyEngineForce(0,           0);  // FL — brak napędu
      this._vehicle.applyEngineForce(0,           1);  // FR — brak napędu
      this._vehicle.applyEngineForce(engineForce, 2);  // RL
      this._vehicle.applyEngineForce(engineForce, 3);  // RR
      // Równe hamowanie na 4 koła — brak nurkowania, GTA-feel
      for (let i = 0; i < 4; i++) this._vehicle.setBrake(brakeForce, i);
    }

    // ── Tarcie boczne kół — per koło (przód ≠ tył) × nawierzchnia ────────────
    // Nawierzchnie: asfalt fF=3.2, beton fF=2.8 (×0.88), trawa fF=0.84 (+20% grip)
    const fF = onRoad ? 3.2 : (onSidewalk ? 2.8 : 0.84);

    // Tył: dynamiczne — zależy od trybu jazdy:
    //  • hamowanie:  fR = fF (równe przód/tył → stabilne, brak zarzucania)
    //  • zakręt:     fR maleje ze wzrostem steer×prędkość → GTA-style tail looseness
    //  • ruszanie:   launchT obniża fR → wheelspin + kontrolowany oversteer
    const launching   = speedKmh > -1 && absSpd < 40;
    const launchT     = launching ? forwAmount * Math.max(0, 1 - absSpd / 40) : 0;
    const brakingNow  = backAmount > 0.10;
    // cornerT: 0 przy prosto lub małej prędkości, 1 przy pełnym skręcie + ≥60 km/h
    const cornerT     = Math.abs(this._steer) * Math.min(1, absSpd / 60);
    let fR;
    if (brakingNow) {
      fR = fF;  // przy hamowaniu przód i tył jednakowe → brak zarzucania tyłu
    } else if (onRoad) {
      fR = Math.max(0.55, 2.6 - launchT * 1.60 - cornerT * 0.90);
    } else if (onSidewalk) {
      fR = Math.max(0.55, 2.3 - launchT * 1.40 - cornerT * 0.80);
    } else {
      fR = Math.max(0.60, 0.78 - cornerT * 0.18);  // trawa: minimalny dodatkowy drift (+20% grip)
    }
    const wInfos = this._vehicle.wheelInfos;
    wInfos[0].frictionSlip = fF;  // FL
    wInfos[1].frictionSlip = fF;  // FR
    wInfos[2].frictionSlip = fR;  // RL
    wInfos[3].frictionSlip = fR;  // RR

    // ── Klakson (H / Y-pad) — ciągły gdy trzymasz ────────────────────────────
    const hornDown = input.isDown('KeyH') || input.isPadButtonDown?.(3);
    if (hornDown) audio?.startHorn(); else audio?.stopHorn();

    // ── Dźwięk silnika ───────────────────────────────────────────────────────
    audio?.updateEngine(speedKmh, gasIn, dt);

    // ── Stan hamowania — TYLKO dla świateł stop ───────────────────────────────
    this._isHandbraking = handBrake && absSpd > 3;
    this._isBraking     = !handBrake && brakeForce > IDLE_BRAKE && absSpd > 1;

    // ── RPM factor — używany przez wydech i inne efekty ──────────────────────
    // 0 = jałowy, 1 = pełne obroty; kombinacja prędkości i gazu
    const speedNorm = Math.min(1, Math.abs(speedKmh) / 120);
    this._rpmFactor  = Math.min(1, speedNorm * 0.5 + Math.max(0, gasIn) * 0.8);
    // Zachowaj prędkość i gaz dla lateUpdate (obrót kół)
    this._speedKmh   = speedKmh;
    this._gasIn      = gasIn;

    // ── Auto-flip recovery: koziołkowanie → po 2 s auto wyprostowanie ────────
    // Oś Y chassis po rotacji: Ry = 1 - 2*(qx²+qz²). Ujemne = wywrotka.
    const q = this._chassis.quaternion;
    const worldUpY = 1 - 2 * (q.x * q.x + q.z * q.z);
    const isFlipped = worldUpY < -0.2;

    if (isFlipped) {
      this._flippedTimer = (this._flippedTimer ?? 0) + dt;
      if (this._flippedTimer > 2.0) {
        // Zachowaj kierunek jazdy (kąt Y), ustaw chassis prosto
        const heading = Math.atan2(2 * (q.w * q.y + q.x * q.z),
                                   1 - 2 * (q.y * q.y + q.z * q.z));
        const sinH = Math.sin(heading / 2), cosH = Math.cos(heading / 2);
        const p = this._chassis.position;
        this._chassis.position.set(p.x, Math.max(p.y, 1.2) + 1.5, p.z);
        this._chassis.quaternion.set(0, sinH, 0, cosH);  // tylko rotacja Y
        this._chassis.velocity.set(0, 0, 0);
        this._chassis.angularVelocity.set(0, 0, 0);
        this._flippedTimer = 0;
      }
    } else {
      this._flippedTimer = 0;
    }
  }

  /**
   * Wywołaj PO vehiclePhysics.step() i PRZED rapier.step().
   * Synchronizuje: cannon-es → Three.js mesh + Rapier kinematic body.
   */
  lateUpdate() {
    const pos  = this._chassis.position;
    const quat = this._chassis.quaternion;

    // ── Synchronizacja kół z cannon-es ───────────────────────────────────────
    // updateWheelTransform() przelicza: pozycję koła, obrót (rotation), skręt (steering)
    for (let i = 0; i < 4; i++) this._vehicle.updateWheelTransform(i);
    const wi = this._vehicle.wheelInfos;

    // Root Y: uśredniona pozycja środków kół → brak zapadania przy drganiach zawieszenia
    const avgWheelY = (wi[0].worldTransform.position.y + wi[1].worldTransform.position.y
                     + wi[2].worldTransform.position.y + wi[3].worldTransform.position.y) / 4;
    const targetRootY = avgWheelY - WHEEL_R;
    if (this._rootY === undefined) this._rootY = targetRootY;
    this._rootY += (targetRootY - this._rootY) * 0.2;

    this.root.position.set(pos.x, this._rootY, pos.z);
    this.root.quaternion.set(quat.x, quat.y, quat.z, quat.w);

    // Per-koło: zawieszenie + obrót + skręt
    const avgSuspLen = (wi[0].suspensionLength + wi[1].suspensionLength
                      + wi[2].suspensionLength + wi[3].suspensionLength) / 4;

    // Obrót kół: bezpośrednio z cannon-es deltaRotation — kąt obrotu obliczony
    // przez fizykę na ostatni krok (1/60 s), z uwzględnieniem poślizgu i hamowania.
    // Gwarantuje zgodność bieżnika z nawierzchnią niezależnie od fps.
    const dt = this._dt ?? (1 / 60);  // używane dalej przez _updateExhaust

    // ── Prędkość pojazdu (m/s, ze znakiem: + = do przodu) ───────────────────
    const vehicleSpeedMs = (this._speedKmh ?? 0) / 3.6;
    const absVehicleSpeedMs = Math.abs(vehicleSpeedMs);

    // ── Slip ratio per koło + zapis dla dźwięku / śladów ────────────────────
    // slip = 0: koło toczy się swobodnie; slip = 1: koło zablokowane
    let maxSlip = 0;
    const slips = wi.map(w => {
      if (absVehicleSpeedMs < 0.5) return 0;
      const wheelSpeedMs = Math.abs(w.deltaRotation) * 120 * WHEEL_R;  // 120 Hz physics step
      return Math.max(0, 1 - wheelSpeedMs / absVehicleSpeedMs);
    });
    maxSlip = Math.max(...slips);
    this._maxWheelSlip = maxSlip;

    this._wheels.forEach(({ outer, inner, isFront }, i) => {
      const w = wi[i];
      // Zawieszenie niezależne: koło wyżej gdy ściśnięte bardziej niż średnia
      outer.position.y = WHEEL_R + (avgSuspLen - w.suspensionLength);

      // Obrót wizualny: stały krok fizyki 1/60s (niezależny od FPS renderowania).
      // Przy swobodnym toczeniu / gazie: vehicleSpeedMs / WHEEL_R × (1/60) = kąt obrotu [rad/krok].
      // Przy hamowaniu: blend ze slip ratio → koło wizualnie zwalnia proporcjonalnie do blokady.
      const PHYS_DT = 1 / 60;
      let visualSpeedMs = vehicleSpeedMs;
      if (absVehicleSpeedMs > 0.3 && (this._isBraking || this._isHandbraking)) {
        const wheelSpeedMs = Math.abs(wi[i].deltaRotation) * 120 * WHEEL_R;  // 120 Hz physics step
        const rollingFraction = Math.min(1, wheelSpeedMs / absVehicleSpeedMs);
        visualSpeedMs = vehicleSpeedMs * rollingFraction;
      }
      inner.rotation.x += visualSpeedMs / WHEEL_R * PHYS_DT;

      // Skręt przednich kół (źródło prawdy = cannon-es steering)
      if (isFront) outer.rotation.y = w.steering;
    });

    // Wyciągnij kąt obrotu Y (heading) z kwaterniona — dla kamery i wychodzenia
    this.facing = Math.atan2(
      2 * (quat.w * quat.y + quat.x * quat.z),
      1 - 2 * (quat.y * quat.y + quat.z * quat.z),
    );

    // Synchronizuj Rapier kinematic body (kolizja gracza z autem)
    // Translacja + rotacja → compound collidery (kadłub + kabina) obracają się z autem
    this._body.setNextKinematicTranslation({ x: pos.x, y: pos.y, z: pos.z });
    this._body.setNextKinematicRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });

    // Ślady hamowania (tylne koła)
    if (this._skidState) this._updateSkidMarks();

    // Dym wydechu
    this._updateExhaust(this._dt ?? 1 / 60);

    // Światła (stop + cofania)
    this._updateLights();
  }

  /** Dynamicznie zmienia kolor świateł tylnych. */
  _updateLights() {
    if (!this._tailMat || !this._revMat) return;
    const braking   = this._isBraking || this._isHandbraking;
    const reversing = this.speedKmh < -1;
    this._tailMat.color.setHex(braking   ? 0xFF1100 : 0x330000);  // ON: jaskrawo czerwony
    this._revMat.color.setHex( reversing ? 0xFFFFFF : 0x0A0800);  // ON: biały
  }

  /**
   * Aktualizuje ślady opon — 4 koła.
   *
   * Ślad pojawia się gdy:
   *  - fizyczny poślizg (skidInfo < 0.96) przy prędkości > 5 km/h
   *  - hamowanie na wszystkich kołach (_isBraking)
   *  - hamulec ręczny na tylnych kołach (_isHandbraking)
   */
  _updateSkidMarks() {
    const wi     = this._vehicle.wheelInfos;
    const speedK = Math.abs(this._vehicle.currentVehicleSpeedKmHour);

    const speedMs = speedK / 3.6;

    for (let wIdx = 0; wIdx < 4; wIdx++) {
      const wInfo  = wi[wIdx];
      const state  = this._skidState[wIdx];
      const isRear = wIdx >= 2;

      // Slip ratio: jak bardzo koło jest wolniejsze od pojazdu (blokada hamulcowa)
      let slip = 0;
      if (speedMs > 0.5) {
        const wheelSpeedMs = Math.abs(wInfo.deltaRotation) * 120 * WHEEL_R;  // 120 Hz physics step
        slip = Math.max(0, 1 - wheelSpeedMs / speedMs);
      }

      // Ślad TYLKO gdy: koła prawie zablokowane (slip>0.85) LUB hamulec ręczny na tylnych
      // UWAGA: skidInfo celowo pominięte — triggeruje przy normalnych zakrętach
      const physicsSlip = speedK > 5 && slip > 0.85;
      const handSkid    = this._isHandbraking && isRear && speedK > 3;

      const skidding = physicsSlip || handSkid;

      const wx = wInfo.worldTransform.position.x;
      const wz = wInfo.worldTransform.position.z;

      const onHard = isOnHardSurface(wx, wz);
      const TRANS_PTS = 12;   // ≈12 punktów brązowych po wjeździe na asfalt z trawy

      if (skidding) {
        if (!state.active) {
          // Nowy ślad — kolor wg nawierzchni
          this._startSkidLine(state, onHard ? 0x222222 : 0x6B4423);
          state.surface        = onHard ? 'hard' : 'grass';
          state.transitionLeft = 0;
        } else {
          // Aktywny ślad — obsłuż zmianę nawierzchni
          const wasHard = state.surface === 'hard';

          if (!wasHard && onHard) {
            // Trawa → Asfalt: otwórz segment przejściowy (brązowy) z licznikiem
            this._endSkidLine(state);
            this._startSkidLine(state, 0x6B4423);
            state.surface        = 'hard';
            state.transitionLeft = TRANS_PTS;
          } else if (wasHard && !onHard) {
            // Asfalt → Trawa: natychmiast brązowy
            this._endSkidLine(state);
            this._startSkidLine(state, 0x6B4423);
            state.surface        = 'grass';
            state.transitionLeft = 0;
          }

          // Odliczanie przejścia brąz→czarny
          if (state.transitionLeft > 0) {
            state.transitionLeft--;
            if (state.transitionLeft === 0) {
              this._endSkidLine(state);
              this._startSkidLine(state, 0x222222);
            }
          }
        }
        this._appendSkidPoint(state, wx, 0.025, wz);
      } else {
        if (state.active) {
          this._endSkidLine(state);
          state.transitionLeft = 0;
        }
      }
    }
  }
}

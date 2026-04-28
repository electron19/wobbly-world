import * as THREE from 'three';
import { Entity } from './Entity.js';
import { toonMat, addOutline } from '../core/Materials.js';
import { CHASSIS_OFFSET_Y } from '../core/VehiclePhysics.js';
import { isOnRoad, isOnHardSurface } from '../world/zones.js';

// ─── Stałe geometrii kół ──────────────────────────────────────────────────────
const WHEEL_R  = 0.40;   // promień opony
const WHEEL_W  = 0.26;   // szerokość opony
const WHEEL_X  = 1.12;   // half-track
const AXLE_ZF  =  1.52;  // Z osi przedniej
const AXLE_ZR  = -1.52;  // Z osi tylnej

// ─── Stałe jazdy (Rapier DynamicRayCastVehicleController) ────────────────────
const MAX_ENGINE_FORCE   = 4500;  // N na koło tylne (~0-100 w 7s)
const MAX_BRAKE_FORCE    = 175;   // Nm hamowania — grywalne, płynne hamowanie (GTA-feel)
const BRAKE_GRASS_MULT   = 0.62;  // trawa: 62% siły hamowania
const HAND_BRAKE_FORCE   = 700;   // Nm hamulca ręcznego (tylne koła, drift)
const IDLE_BRAKE         = 2;     // tarcie spoczynkowe (parking na stoku)
const MAX_STEER_ANGLE  = 0.78;   // rad (≈45°)
const STEER_SPEED      = 3.2;    // szybkość rampy kierownicy (1/s)
const MAX_SPEED_KMH    = 400;    // limit prędkości do przodu
const MAX_REV_KMH      = 35;     // limit cofania
const PAD_TRIGGER_DEADZONE = 0.12;

export class Car extends Entity {
  constructor(scene, color = 0xFF4444) {
    super(scene);
    this._scene     = scene;
    this.color      = color;
    this.facing     = 0;
    this.isOccupied = false;
    this._wheels    = [];
    // Rapier DynamicRayCastVehicleController
    this._vehicle   = null;   // Rapier VehicleController
    this._chassis   = null;   // Rapier RigidBody (dynamic)
    this._steer     = 0;      // wygładzona wartość kierownicy [-1..1]
    this._throttle  = 0;      // wygładzony gaz [0..1]
    this._brake     = 0;      // wygładzone hamowanie [0..1]
    this._prevSpeed = 0;      // prędkość poprzedniej klatki [m/s] — do detekcji kolizji
    // Ślady hamowania
    this._skidState     = null;   // inicjalizowany w initPhysics()
    // Dźwięki
    this._audio         = null;   // ustawiany przez Game przy wsiadaniu/wysiadaniu
    this._prevHandbrake  = false;
    this._suppressHandbrakeFrames = 0;
    this._dirState       = 'stopped'; // 'stopped' | 'forward' | 'reverse' — maszyna stanów kierunku jazdy
    this._wheelAngle     = 0;     // akumulowany kąt obrotu kół (bazowany na prędkości)
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
    // Uszkodzenia świateł: [lewy, prawy] — 0=ok, 1=zgaszone, 2=oderwane
    this._headDmg = [0, 0];   // przednie reflektory
    this._tailDmg = [0, 0];   // tylne światła stop
    this._headMeshes = [null, null];  // soczewki przednie [L, R]
    this._tailMeshes = [null, null];  // soczewki tylne [L, R]
    this._frontIndicators = [null, null];
    this._rearIndicators  = [null, null];
    this._turnSignal      = 'off'; // 'off' | 'left' | 'right'
    // Wizualny body roll/pitch — oddzielna grupa (koła zostają w root)
    this._bodyPivot     = null;   // inicjalizowany w _build()
    this._bodyRoll      = 0;      // wygładzone przechylenie boczne [rad]
    this._bodyPitch     = 0;      // wygładzone pochylenie przód/tył [rad]
    // Prędkość uderzenia z bieżącej klatki — dla camera shake
    this._impactVelThisFrame = 0;
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
    const revMat   = this._revMat;
    const fogMat   = toonMat(0xFFFACC);   // lampy przeciwmgielne

    // Pivot dla body roll/pitch — koła zostają w root (żeby nie tańczyły z nadwoziem)
    this._bodyPivot = new THREE.Group();
    this.root.add(this._bodyPivot);

    // Pomocnik: dodaj box do _bodyPivot (nie root — żeby body roll działał tylko na nadwozie)
    const B = (x, y, z, w, h, d, mat, ol = 0, shadow = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      if (shadow) m.castShadow = true;
      if (ol > 0) addOutline(m, ol);
      this._bodyPivot.add(m);
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
    [-0.73, 0.73].forEach((x, i) => {
      // Obudowa
      B(x, BODY_BOT + BODY_H * 0.73, BODY_ZF + 0.05, 0.56, 0.30, 0.10, darkMat, 0.025);
      // Soczewka główna — indywidualny materiał żeby móc ją wyłączyć niezależnie
      const hMat = new THREE.MeshBasicMaterial({ color: 0xFFFDE0 });
      const lens = B(x, BODY_BOT + BODY_H * 0.73, BODY_ZF + 0.10, 0.42, 0.22, 0.06, hMat, 0, false);
      this._headMeshes[i] = lens;
      // Pasek DRL (nad reflektorem)
      B(x, BODY_BOT + BODY_H * 0.92, BODY_ZF + 0.09, 0.54, 0.07, 0.07, drlMat, 0, false);
      // Kierunkowskaz przedni (pod reflektorem)
      const fiMat = toonMat(0x442200);
      const fInd = B(x, BODY_BOT + BODY_H * 0.42, BODY_ZF + 0.09, 0.34, 0.12, 0.07, fiMat, 0, false);
      this._frontIndicators[i] = fInd;
    });

    // ── 10. TYLNE ŚWIATŁA ────────────────────────────────────────────────────
    [-0.73, 0.73].forEach((x, i) => {
      // Obudowa
      B(x, BODY_BOT + BODY_H * 0.68, BODY_ZR - 0.05, 0.56, 0.38, 0.10, darkMat, 0.025);
      // Światło stop — indywidualny materiał
      const tMat = new THREE.MeshBasicMaterial({ color: 0x330000 });
      const tLens = B(x, BODY_BOT + BODY_H * 0.82, BODY_ZR - 0.10, 0.42, 0.16, 0.06, tMat, 0, false);
      this._tailMeshes[i] = tLens;
      // Kierunkowskaz tylny
      const riMat = toonMat(0x442200);
      const rInd = B(x, BODY_BOT + BODY_H * 0.60, BODY_ZR - 0.10, 0.42, 0.12, 0.06, riMat, 0, false);
      this._rearIndicators[i] = rInd;
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
    this._bodyPivot.add(fuelCap);
    // Wgłębienie wlewu
    B(1.09, BODY_BOT + BODY_H * 0.55, -0.85, 0.04, 0.22, 0.22, darkMat, 0, false);

    // ── 19. RURA WYDECHOWA ───────────────────────────────────────────────────
    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.065, 0.20, 10), chromeMat,
    );
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(0.65, BODY_BOT + 0.09, BODY_ZR - 0.11);
    this._bodyPivot.add(exhaust);
    // Czarna dziura rury
    const exhaustInner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.046, 0.046, 0.22, 8), blackMat,
    );
    exhaustInner.rotation.x = Math.PI / 2;
    exhaustInner.position.set(0.65, BODY_BOT + 0.09, BODY_ZR - 0.12);
    this._bodyPivot.add(exhaustInner);

    // ── 20. ANTENA ───────────────────────────────────────────────────────────
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.40, 5), blackMat,
    );
    antenna.position.set(0.52, ROOF_BOT + 0.20, CAB_ZOff - 0.55);
    this._bodyPivot.add(antenna);

  }

  // ─── Fizyka ───────────────────────────────────────────────────────────────

  /**
   * Inicjalizuje fizykę pojazdu.
   * @param {VehiclePhysics} vehiclePhysics  Rapier vehicle controller factory
   * @param {PhysicsWorld}   rapierPhysics   shared Rapier world
   */
  initPhysics(vehiclePhysics, rapierPhysics, x, y, z) {
    const { vehicle, chassis } = vehiclePhysics.createVehicle(
      rapierPhysics.world, x, y, z, this.facing,
    );
    this._vehicle = vehicle;
    this._chassis = chassis;

    // Zaparkowane auto stoi w miejscu (hamulec)
    for (let i = 0; i < 4; i++) this._vehicle.setWheelBrake(i, MAX_BRAKE_FORCE);

    this.root.position.set(x, y, z);
    this.root.rotation.y = this.facing;

    this._initSkidMarks();
    this._initExhaust();
  }

  // ─── Gettery ──────────────────────────────────────────────────────────────

  get speedKmh() {
    return this._vehicle ? this._vehicle.currentVehicleSpeed() * 3.6 : 0;
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

  /** Prędkość uderzenia z bieżącej klatki [m/s] — reset co klatkę w update(). Dla camera shake. */
  get impactVel() { return this._impactVelThisFrame ?? 0; }

  /** Czy auto ma kompletną fizykę i może być prowadzone bez ryzyka crashu pętli gry. */
  get isDrivable() { return !!this._vehicle && !!this._chassis; }

  /** Czyści stan sterowania przy wejściu/wyjściu z auta, żeby nie dziedziczyć hamowania z postoju. */
  resetDriveState({ parked = false } = {}) {
    this._steer = 0;
    this._throttle = 0;
    this._brake = 0;
    this._prevHandbrake = false;
    this._suppressHandbrakeFrames = 0;
    this._dirState = 'stopped';
    this._isBraking = false;
    this._isHandbraking = false;
    this._cornerT = 0;
    this._gasIn = 0;

    if (!this._vehicle) return;

    for (let i = 0; i < 4; i++) {
      this._vehicle.setWheelEngineForce(i, 0);
      this._vehicle.setWheelBrake(i, parked ? MAX_BRAKE_FORCE : 0);
    }
    this._vehicle.setWheelSteering(0, 0);
    this._vehicle.setWheelSteering(1, 0);
  }

  /** Krótko wyłącza hamulec ręczny po wejściu z pada, żeby B nie blokowało ruszania. */
  suppressHandbrake(frames = 8) {
    this._suppressHandbrakeFrames = Math.max(this._suppressHandbrakeFrames, frames);
  }

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
   * Wywołuje się po detekcji spadku prędkości (kolizja).
   * Używa bieżącej prędkości chassis do wyznaczenia strefy uderzenia.
   * @param {number} vel  szacowana siła uderzenia [m/s]
   */
  _handleImpact(vel) {
    if (vel < 4) return;

    // Wyznacz przód/tył z kierunku ruchu chassis w chwili kolizji
    const q  = this._chassis.rotation();
    const lv = this._chassis.linvel();
    // Kolumna Z macierzy rotacji z kwaterniona (oś do przodu lokalnie)
    const fwdX = 2 * (q.x * q.z + q.w * q.y);
    const fwdY = 2 * (q.y * q.z - q.w * q.x);
    const fwdZ = 1 - 2 * (q.x * q.x + q.y * q.y);
    // Auto jechało do przodu (dot > 0) → przód uderzył w przeszkodę
    const isfront = (lv.x * fwdX + lv.y * fwdY + lv.z * fwdZ) > 0;

    const dmg = Math.min(1, (vel - 4) / 20) * 0.35;
    if (isfront) {
      this._damageFront = Math.min(1, this._damageFront + dmg);
    } else {
      this._damageRear  = Math.min(1, this._damageRear  + dmg);
    }

    // Uszkodzenia reflektorów — strona L/R z składowej bocznej velocity
    const rgtX = 1 - 2 * (q.y * q.y + q.z * q.z);
    const rgtY = 2 * (q.x * q.y + q.w * q.z);
    const rgtZ = 2 * (q.x * q.z - q.w * q.y);
    const dotRight = lv.x * rgtX + lv.y * rgtY + lv.z * rgtZ;
    const lightIdx = dotRight < 0 ? 0 : 1;

    if (vel >= 14) {
      if (isfront) this._headDmg[lightIdx] = 2;
      else          this._tailDmg[lightIdx] = 2;
    } else if (vel >= 6) {
      if (isfront && this._headDmg[lightIdx] < 1) this._headDmg[lightIdx] = 1;
      else if (!isfront && this._tailDmg[lightIdx] < 1) this._tailDmg[lightIdx] = 1;
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

    // ── Reflektory przednie ──────────────────────────────────────────────────
    this._headDmg.forEach((dmg, i) => {
      const m = this._headMeshes[i];
      if (!m) return;
      if (dmg >= 2) {
        m.visible = false;   // odpadł
      } else if (dmg >= 1) {
        m.material.color.setHex(0x111108);   // zgaszone (ciemne szkło)
      }
    });

    // ── Tylne światła stop ───────────────────────────────────────────────────
    this._tailDmg.forEach((dmg, i) => {
      const m = this._tailMeshes[i];
      if (!m) return;
      if (dmg >= 2) {
        m.visible = false;
      } else if (dmg >= 1) {
        m.material.color.setHex(0x0A0200);   // zgaszone
      }
    });
  }

  // ─── Cykl klatki ──────────────────────────────────────────────────────────

  /**
   * Wywołaj PRZED physics.step().
   * Aplikuje siły wejściowe do Rapier VehicleController,
   * a na końcu wywołuje updateVehicle() żeby przeliczył siły przed krokiem fizyki.
   */
  update(dt, input, audio) {
    this._dt = dt;
    this._impactVelThisFrame = 0;  // reset — lateUpdate nadpisze po detekcji

    // Gaz do przodu: W / ArrowUp / R2
    const fwdK   = (input.isDown('KeyW') || input.isDown('ArrowUp'))   ? 1 : 0;
    const revK   = (input.isDown('KeyS') || input.isDown('ArrowDown')) ? 1 : 0;
    const padFwd = (input.pad.r2 ?? 0) > PAD_TRIGGER_DEADZONE ? (input.pad.r2 ?? 0) : 0;
    const padBack = (input.pad.l2 ?? 0) > PAD_TRIGGER_DEADZONE ? (input.pad.l2 ?? 0) : 0;
    const rawFwd = Math.max(fwdK, padFwd);
    const rawBack= Math.max(revK, padBack);

    // Frame-rate-independent wygładzanie pedałów (1-exp(-dt/tau))
    const tauOn  = 0.08;
    const tauOff = 0.05;
    this._throttle += (rawFwd - this._throttle) * (1 - Math.exp(-dt / (rawFwd > this._throttle ? tauOn : tauOff)));
    this._brake    += (rawBack - this._brake)    * (1 - Math.exp(-dt / (rawBack > this._brake  ? tauOn : tauOff)));

    const forwAmount = this._throttle;
    const backAmount = this._brake;
    const gasIn = forwAmount - backAmount;

    // Nawierzchnia + prędkość — obliczamy PRZED skrętem (steerMult zależy od bieżącej prędkości)
    const cp         = this._chassis.translation();
    const onRoad     = isOnRoad(cp.x, cp.z);
    const onSidewalk = !onRoad && isOnHardSurface(cp.x, cp.z);
    const brakeSurf  = onRoad ? 1.0 : (onSidewalk ? 0.88 : BRAKE_GRASS_MULT);

    // Prędkość bieżącej klatki (Rapier: m/s → km/h)
    const speedKmh = this._vehicle.currentVehicleSpeed() * 3.6;
    const absSpd   = Math.abs(speedKmh);

    // Skręt: A/D / analog
    const steerKL  = (input.isDown('KeyA') || input.isDown('ArrowLeft'))  ? 1 : 0;
    const steerKR  = (input.isDown('KeyD') || input.isDown('ArrowRight')) ? 1 : 0;
    const padSteer = Math.abs(input.pad.leftX) > 0.12 ? -input.pad.leftX : 0;
    const steerIn  = padSteer !== 0 ? padSteer : (steerKL - steerKR);

    // Wygładzony skręt, kąt maleje przy dużej prędkości (bieżąca klatka, nie poprzednia)
    const steerMult = Math.max(0.30, 1 - absSpd / 160);
    this._steer += (steerIn * MAX_STEER_ANGLE * steerMult - this._steer) * (1 - Math.exp(-STEER_SPEED * dt));
    this._vehicle.setWheelSteering(0, this._steer);  // FL
    this._vehicle.setWheelSteering(1, this._steer);  // FR

    // Hamulec ręczny (SPACJA / pad B)
    const padHandBrake = this._suppressHandbrakeFrames > 0 ? false : input.isPadButtonDown(1);
    const handBrake = input.isDown('Space') || padHandBrake;
    if (handBrake && !this._prevHandbrake) {
      audio?.playHandbrake(this._vehicle.currentVehicleSpeed() * 3.6);
    }
    this._prevHandbrake = handBrake;
    if (this._suppressHandbrakeFrames > 0) this._suppressHandbrakeFrames -= 1;

    if (input.isPadButtonPressed(4)) {
      this._turnSignal = this._turnSignal === 'left' ? 'off' : 'left';
    }
    if (input.isPadButtonPressed(5)) {
      this._turnSignal = this._turnSignal === 'right' ? 'off' : 'right';
    }

    // Prędkość pozioma chassis — potrzebna w obu trybach
    const _lv = this._chassis.linvel();
    const _horizSpeedKmh = Math.sqrt(_lv.x * _lv.x + _lv.z * _lv.z) * 3.6;
    this._horizSpeedKmh = _horizSpeedKmh;

    let brakeForce = 0;

    {
      // ── Maszyna stanów kierunku jazdy ──────────────────────────────────────────
      // Przejście do 'stopped' gdy auto prawie stoi (prędkość pozioma < 0.5 km/h)
      if (_horizSpeedKmh < 0.5) this._dirState = 'stopped';
      if (this._dirState === 'stopped') {
        if (rawFwd > 0.05) this._dirState = 'forward';
        else if (rawBack > 0.05) this._dirState = 'reverse';
      }

      let engineForce = 0;

      if (handBrake) {
        this._vehicle.setWheelEngineForce(0, 0);
        this._vehicle.setWheelEngineForce(1, 0);
        this._vehicle.setWheelEngineForce(2, 0);
        this._vehicle.setWheelEngineForce(3, 0);
        this._vehicle.setWheelBrake(0, 0);
        this._vehicle.setWheelBrake(1, 0);
        this._vehicle.setWheelBrake(2, HAND_BRAKE_FORCE * brakeSurf);
        this._vehicle.setWheelBrake(3, HAND_BRAKE_FORCE * brakeSurf);
      } else {
        if (gasIn > 0) {
          if (this._dirState === 'reverse') {
            brakeForce = MAX_BRAKE_FORCE * forwAmount * brakeSurf;
          } else if (speedKmh < MAX_SPEED_KMH) {
            engineForce = MAX_ENGINE_FORCE * gasIn;
          }
        } else if (gasIn < 0) {
          if (this._dirState === 'forward') {
            brakeForce = MAX_BRAKE_FORCE * backAmount * brakeSurf;
          } else if (_horizSpeedKmh < MAX_REV_KMH) {
            engineForce = MAX_ENGINE_FORCE * gasIn;
          }
        } else {
          if (absSpd < 1.5) brakeForce = IDLE_BRAKE;
        }
        // RWD
        this._vehicle.setWheelEngineForce(0, 0);
        this._vehicle.setWheelEngineForce(1, 0);
        this._vehicle.setWheelEngineForce(2, engineForce);
        this._vehicle.setWheelEngineForce(3, engineForce);
        for (let i = 0; i < 4; i++) this._vehicle.setWheelBrake(i, brakeForce);
      }

      // FrictionSlip: trawa 2.0 (było 1.8) — więcej trakcji poza miastem
      const BASE_F = onRoad ? 2.5 : (onSidewalk ? 2.3 : 2.0);
      const effBase = BASE_F * (1.0 - backAmount * 0.55);
      const cornerT = Math.abs(this._steer) * Math.min(1, absSpd / 70);
      this._cornerT = cornerT;
      // Przy ruszaniu trzymaj wysoki grip tylnej osi. Poprzednie 2.5 zbijało
      // frictionSlip niemal do zera przy pełnym gazie od miejsca.
      const launchGripLoss = forwAmount * Math.max(0, 1 - absSpd / 35) * 0.55;
      const cornerSlip = cornerT * 1.5;
      const rearGripFloor = onRoad ? 1.75 : (onSidewalk ? 1.55 : 1.20);
      const fR = Math.max(rearGripFloor, effBase - launchGripLoss - cornerSlip);

      this._vehicle.setWheelFrictionSlip(0, effBase);
      this._vehicle.setWheelFrictionSlip(1, effBase);
      this._vehicle.setWheelFrictionSlip(2, fR);
      this._vehicle.setWheelFrictionSlip(3, fR);
    }

    // Downforce aerodynamiczny
    if (this._horizSpeedKmh > 20) {
      const vMs = this._horizSpeedKmh / 3.6;
      this._chassis.addForce({ x: 0, y: -0.50 * vMs * vMs, z: 0 }, true);
    }

    // Anti-roll stabilizer — tłumi prędkość kątową roll/pitch/yaw.
    // RESTORE celowo wyłączony (= 0 zawsze): wzory w przestrzeni świata dawały
    // moment korygujący roll w zależności od kierunku jazdy — nie od faktycznego
    // przechyłu chassis → progresywne wychylanie w prawo/lewo poza miastem.
    // Zawieszenie samo utrzymuje chassis poziomo; auto-flip recovery naprawia wywrotki.
    {
      const av = this._chassis.angvel();

      // Wykryj lot: koła poza zakresem kompresji zawieszenia
      const s0 = this._vehicle.wheelSuspensionLength(0);
      const s1 = this._vehicle.wheelSuspensionLength(1);
      const s2 = this._vehicle.wheelSuspensionLength(2);
      const s3 = this._vehicle.wheelSuspensionLength(3);
      const airborneWheels = [s0, s1, s2, s3].filter(v => v > 0.50).length;
      const airborne = airborneWheels >= 3;

      // W powietrzu mocniejsze tłumienie — zapobiega tumbling po skoku/kolizji
      const DAMP_XZ = airborne ? 16000 : 1200;
      const DAMP_Y  = airborne ? 18000 :  600;

      this._chassis.addTorque({
        x: -av.x * DAMP_XZ,
        y: -av.y * DAMP_Y,
        z: -av.z * DAMP_XZ,
      }, true);
    }

    // Klakson (H / Y-pad)
    const hornDown = input.isDown('KeyH') || input.isPadButtonDown(3);
    if (hornDown) audio?.startHorn(); else audio?.stopHorn();

    // Dźwięk silnika + opon
    audio?.updateEngine(speedKmh, gasIn, dt);
    audio?.updateTires(speedKmh, onRoad);

    // Stan hamowania — dla świateł stop
    this._isHandbraking = handBrake && absSpd > 3;
    this._isBraking     = !handBrake && brakeForce > IDLE_BRAKE && absSpd > 1

                          && (backAmount > 0.05 || (this._dirState === 'reverse' && _horizSpeedKmh > 3));

    // RPM factor — używany przez wydech
    const speedNorm  = Math.min(1, absSpd / 120);
    this._rpmFactor  = Math.min(1, speedNorm * 0.5 + Math.max(0, gasIn) * 0.8);
    this._speedKmh   = speedKmh;
    this._gasIn      = gasIn;

    // Auto-flip recovery: po 2 s wywrotka → wyprostowanie
    const q = this._chassis.rotation();
    const worldUpY = 1 - 2 * (q.x * q.x + q.z * q.z);
    if (worldUpY < -0.2) {
      this._flippedTimer = (this._flippedTimer ?? 0) + dt;
      if (this._flippedTimer > 2.0) {
        const heading = Math.atan2(2 * (q.w * q.y + q.x * q.z),
                                   1 - 2 * (q.y * q.y + q.z * q.z));
        const sinH = Math.sin(heading / 2), cosH = Math.cos(heading / 2);
        const p = this._chassis.translation();
        this._chassis.setTranslation({ x: p.x, y: Math.max(p.y, 1.2) + 1.5, z: p.z }, true);
        this._chassis.setRotation({ x: 0, y: sinH, z: 0, w: cosH }, true);
        this._chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this._chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this._flippedTimer = 0;
      }
    } else {
      this._flippedTimer = 0;
    }

    // Krok vehicle controllera — musi być PO ustawieniu sił, PRZED world.step()
    // filterGroups 0x0001FFFD: promienie kół omijają grupę 2 (chassis innych aut).
    // Chassis jest w grupie 2 (setCollisionGroups 0x0002FFFF w VehiclePhysics.js).
    this._vehicle.updateVehicle(dt, 0, 0x0001FFFD, null);
  }

  /**
   * Krok vehicle controllera dla zaparkowanego auta (bez wejścia gracza).
   * Wywołaj PRZED physics.step() dla każdego auta które NIE jest prowadzone.
   */
  idleStep(dt) {
    if (!this._vehicle) return;
    // Re-aplikuj hamulec i przywróć normalne tarcie co klatkę.
    // Bez resetu frictionSlip auto wyjeżdżające z trybu jazdy (np. po wysiadaniu gracza
    // podczas ruchu) mogło zachować zredukowane tarcie z ostatniej klatki update() —
    // koła blokowały, ale brak tarcia dawał efekt lodu.
    for (let i = 0; i < 4; i++) {
      this._vehicle.setWheelEngineForce(i, 0);
      this._vehicle.setWheelBrake(i, MAX_BRAKE_FORCE);
      this._vehicle.setWheelFrictionSlip(i, 2.5);
    }
    this._vehicle.setWheelSteering(0, 0);
    this._vehicle.setWheelSteering(1, 0);
    this._vehicle.updateVehicle(dt, 0, 0x0001FFFD, null);
  }

  /**
   * Wywołaj PO physics.step().
   * Synchronizuje: Rapier chassis → Three.js mesh.
   * Wykrywa kolizje przez delta prędkości.
   */
  lateUpdate() {
    const pos  = this._chassis.translation();  // {x, y, z}
    const quat = this._chassis.rotation();     // {x, y, z, w}
    const dt   = this._dt ?? (1 / 60);

    // ── Detekcja kolizji przez spadek prędkości ───────────────────────────
    const linvel = this._chassis.linvel();
    const speed  = Math.sqrt(linvel.x ** 2 + linvel.y ** 2 + linvel.z ** 2);
    const deltaV = this._prevSpeed - speed;
    if (deltaV > 2 && speed < this._prevSpeed) {
      this._impactVelThisFrame = deltaV;
      this._audio?.playCollision('wall', deltaV);
      if (deltaV >= 4) this._handleImpact(deltaV);
    }
    this._prevSpeed = speed;

    // ── Root Y — wygładzona pozycja kół na zawieszeniu ────────────────────
    const s0 = this._vehicle.wheelSuspensionLength(0);
    const s1 = this._vehicle.wheelSuspensionLength(1);
    const s2 = this._vehicle.wheelSuspensionLength(2);
    const s3 = this._vehicle.wheelSuspensionLength(3);

    // Średnia długość zawieszenia → root na poziomie drogi (chassis center - suspLen - wheelR)
    const avgSuspLen  = (s0 + s1 + s2 + s3) / 4;
    const targetRootY = pos.y - avgSuspLen - WHEEL_R;
    if (this._rootY === undefined) this._rootY = targetRootY;
    this._rootY += (targetRootY - this._rootY) * (1 - Math.exp(-dt * 12));

    this.root.position.set(pos.x, this._rootY, pos.z);
    this.root.quaternion.set(quat.x, quat.y, quat.z, quat.w);

    // ── Body roll/pitch — wizualny przechył nadwozia ──────────────────────
    const speedK = Math.abs(this._speedKmh ?? 0);
    const speedFacRoll  = Math.min(1, speedK / 80);
    const speedFacPitch = Math.min(1, speedK / 60);

    const targetRoll  = -(this._steer ?? 0) * speedFacRoll  * 0.072;
    const targetPitch = ((this._throttle ?? 0) - (this._brake ?? 0)) * speedFacPitch * 0.048;

    this._bodyRoll  += (targetRoll  - this._bodyRoll)  * (1 - Math.exp(-dt * 6));
    this._bodyPitch += (targetPitch - this._bodyPitch) * (1 - Math.exp(-dt * 5));

    if (this._bodyPivot) {
      this._bodyPivot.rotation.z = this._bodyRoll;
      this._bodyPivot.rotation.x = this._bodyPitch;
    }

    // ── Per-koło: zawieszenie + obrót + skręt ────────────────────────────
    // Obrót kół: prędkość z modułu linvel (zawsze ≥0), znak z _dirState.
    // currentVehicleSpeed() zmienia znak podczas skrętów (projekcja na lokalną oś Z)
    // — powodowało cofanie kół podczas jazdy w prawo.
    const wheelSign = this._dirState === 'reverse' ? -1 : 1;
    const speedMs   = wheelSign * (this._horizSpeedKmh ?? 0) / 3.6;
    this._wheelAngle += (speedMs / WHEEL_R) * dt;
    // Wrap modulo 2π — zapobiega utracie precyzji float po długiej jeździe
    if (this._wheelAngle > 1e5 || this._wheelAngle < -1e5) this._wheelAngle %= (Math.PI * 2);

    // Slip ratio — przybliżony z siły hamowania
    const absSpeedMs = Math.abs(speedMs);
    let maxSlip = 0;

    this._wheels.forEach(({ outer, inner, isFront }, i) => {
      // Zawieszenie niezależne
      const suspLen = this._vehicle.wheelSuspensionLength(i);
      outer.position.y = WHEEL_R + (avgSuspLen - suspLen);

      // Obrót kół z akumulowanego kąta
      inner.rotation.x = this._wheelAngle;

      // Skręt przednich kół
      if (isFront) outer.rotation.y = this._vehicle.wheelSteering(i);

      // Slip ratio z siły hamowania (dla śladów / dźwięku)
      const brakeF = this._vehicle.wheelBrake(i);
      const slip   = absSpeedMs > 0.5 ? Math.min(1, brakeF / MAX_BRAKE_FORCE) : 0;
      if (slip > maxSlip) maxSlip = slip;
    });
    this._maxWheelSlip = maxSlip;

    // Kąt obrotu Y (heading) z kwaterniona — kamera i wysiadanie
    this.facing = Math.atan2(
      2 * (quat.w * quat.y + quat.x * quat.z),
      1 - 2 * (quat.y * quat.y + quat.z * quat.z),
    );

    // Ślady opon
    if (this._skidState) this._updateSkidMarks();

    // Dym wydechu
    this._updateExhaust(dt);

    // Światła (stop + cofania)
    this._updateLights();

    // Miganie sygnałów policyjnych
    if (this._isPolice) {
      const flash = Math.floor(performance.now() / 200) % 2 === 0;
      this._policeRedLights?.forEach(l  => { l.material.color.setHex(flash ? 0xFF1111 : 0x330000); });
      this._policeBlueLights?.forEach(l => { l.material.color.setHex(flash ? 0x1144FF : 0x000822); });
    }
  }

  /** Dynamicznie zmienia kolor świateł tylnych. */
  _updateLights() {
    if (!this._revMat) return;
    const braking   = this._isBraking || this._isHandbraking;
    const reversing = this._dirState === 'reverse';
    const blinkOn   = this._turnSignal !== 'off' && (Math.floor(performance.now() / 330) % 2 === 0);
    // Aktualizuj każde tylne światło stop — pomijaj uszkodzone
    this._tailMeshes.forEach((m, i) => {
      if (!m || this._tailDmg[i] > 0) return;  // zgaszone/oderwane — nie zmieniaj
      m.material.color.setHex(braking ? 0xFF1100 : 0x330000);
    });
    this._revMat.color.setHex(reversing ? 0xFFFFFF : 0x0A0800);

    const signalHex = 0xFF9900;
    const signalOffHex = 0x442200;
    const leftOn = blinkOn && this._turnSignal === 'left';
    const rightOn = blinkOn && this._turnSignal === 'right';
    this._frontIndicators.forEach((m, i) => {
      if (!m) return;
      const on = i === 0 ? leftOn : rightOn;
      m.material.color.setHex(on ? signalHex : signalOffHex);
    });
    this._rearIndicators.forEach((m, i) => {
      if (!m) return;
      const on = i === 0 ? leftOn : rightOn;
      m.material.color.setHex(on ? signalHex : signalOffHex);
    });
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
    const speedK  = Math.abs(this._vehicle.currentVehicleSpeed() * 3.6);
    const speedMs = speedK / 3.6;

    for (let wIdx = 0; wIdx < 4; wIdx++) {
      const state  = this._skidState[wIdx];
      const isRear = wIdx >= 2;

      // Slip ratio — przybliżony z siły hamowania
      const brakeF = this._vehicle.wheelBrake(wIdx);
      const slip   = speedMs > 0.5 ? Math.min(1, brakeF / MAX_BRAKE_FORCE) : 0;

      const physicsSlip = speedK > 5 && slip > 0.85 && (this._isBraking || this._isHandbraking);
      const handSkid    = this._isHandbraking && isRear && speedK > 3;
      const lateralSkid = isRear && (this._cornerT ?? 0) > 0.45 && speedK > 35;

      const skidding = physicsSlip || handSkid || lateralSkid;

      // Pozycja koła w world space — punkt kontaktu lub estymacja z pozycji auta
      const contactPt = this._vehicle.wheelContactPoint(wIdx);
      const pos = this._chassis.translation();
      const wx = contactPt ? contactPt.x : pos.x;
      const wz = contactPt ? contactPt.z : pos.z;

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

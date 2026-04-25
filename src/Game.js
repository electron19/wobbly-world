import * as THREE from 'three';
import { initRapier, PhysicsWorld } from './core/Physics.js';
import { VehiclePhysics }           from './core/VehiclePhysics.js';
import { InputManager }             from './core/InputManager.js';
import { ThirdPersonCamera }        from './core/Camera.js';
import { PlayerMichaelMyers }       from './entities/PlayerMichaelMyers.js';
import { WorldBuilder }             from './world/WorldBuilder.js';
import { SEED }                     from './core/RNG.js';
import { AudioManager }             from './core/AudioManager.js';
import { isOnRoad }                 from './world/zones.js';

const PLAYER_SPAWN  = { x: 0, y: 1.5, z: 34 };
const ENTER_DIST    = 3.8;   // max odległość do wejścia do auta
const CAM_DIST_FOOT = 8;     // dystans kamery pieszo
const CAM_DIST_CAR  = 8.4;   // ciaśniejsza kamera w aucie = lepszy feeling prędkości

/**
 * Główna klasa gry — orkiestrator.
 *
 * Cykl klatki:
 *   1. input.flush()
 *   2a. (pieszo)  player.update()         → nextKinematicTranslation
 *   2b. (w aucie) car.update()            → nextKinematicTranslation
 *   3. physics.step()                     → Rapier rozwiązuje kolizje
 *   4a. (pieszo)  player.lateUpdate()     → sync visual
 *   4b. (w aucie) car.lateUpdate()        → sync visual + przenieś gracza z autem
 *   5. camera.update(followPos, mouse)
 *   6. renderer.render()
 *
 * Interakcja (klawisz E):
 *   - Podejdź do auta → pojawi się hint "E — wsiądź"
 *   - Naciśnij E → gracz chowa się, kamera podąża za autem
 *   - Naciśnij E ponownie → gracz pojawia się obok auta
 */
export class Game {
  constructor() {
    this.scene          = null;
    this.renderer       = null;
    this.camera3        = null;
    this.physics        = null;
    this.vehiclePhysics = null;
    this.input          = null;
    this.camCtrl        = null;
    this.player         = null;
    this.cars           = [];
    this.audio          = new AudioManager();
    this._drivingCar    = null;
    this._knockableLamps = [];
    this._eWasDown      = false;
    this._lastTs        = 0;
    this._frameMs       = 1000 / 60;   // limit 60 FPS — jednakowa prędkość na baterii i zasilaczu
    this._interactEl       = null;
    this._uiEl             = null;
    this._exitCarThisFrame = false;
    this._worldObjects     = [];
    this._cullFrame        = 0;
    this._fpsFrames        = 0;
    this._fpsSec           = 0;
    this._fpsDisplay       = 0;
    this._debugEl          = null;
  }

  async init() {
    // ─── 1. Fizyka ─────────────────────────────────────────────────────────
    await initRapier();
    this.physics        = new PhysicsWorld();
    this.vehiclePhysics = new VehiclePhysics();

    // ─── 2. Renderer + scena ───────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7EC8F5);
    // Gęstość mgły: 0.008 = widok ~100j — ukrywa odległe obiekty, poprawia wydajność
    this.scene.fog = new THREE.FogExp2(0x7EC8F5, 0.008);

    this.camera3 = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 110);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));  // max 1.5 zamiast 2
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;  // gładkie krawędzie cieni
    document.body.appendChild(this.renderer.domElement);

    // ─── 3. Oświetlenie ────────────────────────────────────────────────────
    this._setupLighting();

    // ─── 4. Wejście + kamera ───────────────────────────────────────────────
    this.input   = new InputManager();
    this.camCtrl = new ThirdPersonCamera(this.camera3);

    // ─── 5. Świat + auta ───────────────────────────────────────────────────
    const wb  = new WorldBuilder(this.scene, this.physics, this.vehiclePhysics);
    wb.build();
    this.cars          = wb.cars;
    this._worldObjects = wb.objects;
    this._knockableLamps = wb.knockableLamps;

    // ─── 6. Gracz ──────────────────────────────────────────────────────────
    this.player = new PlayerMichaelMyers(this.scene);
    const { body, collider } = this.physics.addPlayerCapsule(
      PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_SPAWN.z
    );
    this.player.setPhysicsBody(body, collider);

    // ─── 7. Resize ─────────────────────────────────────────────────────────
    window.addEventListener('resize', () => {
      this.camera3.aspect = innerWidth / innerHeight;
      this.camera3.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    // ─── 8. UI ─────────────────────────────────────────────────────────────
    const loading = document.getElementById('loading');
    loading.style.opacity = '0';
    setTimeout(() => (loading.style.display = 'none'), 600);
    this._uiEl       = document.getElementById('ui');
    this._interactEl = document.getElementById('interact');
    this._debugEl    = document.getElementById('debug');
    if (this._debugEl) this._debugEl.style.display = 'block';
    this._uiEl.style.display = 'block';
    document.getElementById('hint').style.display = 'block';
    const seedEl = document.getElementById('seed-display');
    if (seedEl) seedEl.textContent = `🌱 seed: ${SEED}`;
  }

  _setupLighting() {
    this.scene.add(new THREE.AmbientLight(0xffeedd, 0.65));
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.1);
    sun.position.set(20, 40, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);  // 2048: wystarczająca rozdzielczość dla gładkich cieni
    sun.shadow.camera.near   = 1;
    sun.shadow.camera.far    = 120;
    sun.shadow.camera.top    = sun.shadow.camera.right  =  40;  // mały zasięg = większa precyzja
    sun.shadow.camera.bottom = sun.shadow.camera.left   = -40;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0x87CEEB, 0x5a9e35, 0.3));
  }

  // ─── Distance culling ────────────────────────────────────────────────────

  /** Ukrywa obiekty dalej niż CULL_DIST jednostek od gracza. Sprawdza co 4 klatki. */
  _updateCulling() {
    if (++this._cullFrame % 4 !== 0) return;
    const pp = this.player.root.position;
    const DIST_SQ = 85 * 85;
    for (const obj of this._worldObjects) {
      const dx = obj.root.position.x - pp.x;
      const dz = obj.root.position.z - pp.z;
      obj.root.visible = (dx * dx + dz * dz) < DIST_SQ;
    }
  }

  // ─── Interakcja z autem ───────────────────────────────────────────────────

  /** Znajdź najbliższe auto w zasięgu ENTER_DIST. */
  _nearestCar() {
    const pp = this.player.root.position;
    let best = null, bestD = ENTER_DIST;
    for (const car of this.cars) {
      const cp = car.root.position;
      const d  = Math.hypot(pp.x - cp.x, pp.z - cp.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  _enterCar(car) {
    this._drivingCar = car;
    car.isOccupied   = true;
    this.player.root.visible = false;
    car._audio = this.audio;
    this.audio.playEngineStart();
    this.audio.startTires();
    // Kamera ustawia się za autem od razu
    this.camCtrl.yaw  = car.facing + Math.PI;
    this.camCtrl.dist = CAM_DIST_CAR;
    this._uiEl.innerHTML =
      'WASD – jedź &nbsp;|&nbsp; SPACJA – h. ręczny &nbsp;|&nbsp; H – klakson &nbsp;|&nbsp; Mysz – kamera &nbsp;|&nbsp; E – wysiądź';
  }

  _exitCar() {
    const car = this._drivingCar;
    const pos = car.root.position;   // pozycja z Rapier (synced w lateUpdate)
    // Wysiądź z boku (prostopadle do kierunku jazdy)
    const sideX = pos.x + Math.cos(car.facing) * 2.8;
    const sideZ = pos.z - Math.sin(car.facing) * 2.8;
    this.player._body.setNextKinematicTranslation({
      x: sideX, y: pos.y + 1.2, z: sideZ,
    });
    this.player.root.visible = true;
    car._audio    = null;
    this.audio.stopEngine();
    this.audio.stopTires();
    car.isOccupied        = false;
    this._drivingCar      = null;
    this._exitCarThisFrame = true;
    this.camCtrl.dist = CAM_DIST_FOOT;
    this._uiEl.innerHTML =
      'WASD – ruch &nbsp;|&nbsp; SPACJA – skok &nbsp;|&nbsp; F – pierdzenie &nbsp;|&nbsp; B – beknięcie &nbsp;|&nbsp; E – wsiądź';
  }

  /** Obsługa wejścia/wyjścia z auta + hint UI. */
  _updateInteraction() {
    const eDown    = this.input.isDown('KeyE');
    const ePressed = (eDown && !this._eWasDown) || this.input.isPadButtonPressed(2);
    this._eWasDown = eDown;

    if (ePressed) {
      if (this._drivingCar) {
        this._exitCar();
      } else {
        const near = this._nearestCar();
        if (near) this._enterCar(near);
      }
    }

    // Hint "E — wsiądź / wysiądź"
    if (this._interactEl) {
      if (this._drivingCar) {
        this._interactEl.textContent = 'E — wysiądź';
        this._interactEl.style.display = 'block';
      } else {
        const near = this._nearestCar();
        this._interactEl.style.display = near ? 'block' : 'none';
        if (near) this._interactEl.textContent = 'E — wsiądź';
      }
    }
  }

  // ─── Game loop ────────────────────────────────────────────────────────────

  start() {
    requestAnimationFrame(ts => this._loop(ts));
  }

  _loop(ts) {
    requestAnimationFrame(t => this._loop(t));
    if (ts - this._lastTs < this._frameMs - 0.5) return;  // cap 60 FPS
    const dt = Math.min((ts - this._lastTs) / 1000, 0.05);
    this._lastTs = ts;

    this.input.flush();
    this._updateCulling();
    this._updateInteraction();

    const exitedThisFrame = this._exitCarThisFrame;
    this._exitCarThisFrame = false;

    // ── 1. Wejście → Rapier vehicle controller (siły pojazdu + updateVehicle) ──
    if (this._drivingCar) {
      this._drivingCar.update(dt, this.input, this.audio);
    }
    // Zaparkowane auta też muszą dostać updateVehicle — inaczej zawieszenie nie działa
    for (const car of this.cars) {
      if (car !== this._drivingCar) car.idleStep(dt);
    }

    // ── 2. Krok Rapier (auto + gracz + kolizje świata — jeden silnik) ─────
    for (const lamp of this._knockableLamps) lamp.update(dt);

    // ── 3. Krok Rapier — auto + gracz + świat w jednym symulatorze ───────
    if (this._drivingCar) {
      // Gracz niewidoczny — ustaw capsule NAD autem (nie w środku chassis),
      // żeby kinematic body nie generowało sił na dynamic chassis i auto nie latało.
      // cp.y + 0.7 trafiał w chassis box (center y≈0.75, ±0.45) → penetracja.
      // cp.y + 4 jest nad dachem (dach ≈ cp.y + 2) — zero kontaktu.
      const cp = this._drivingCar.root.position;
      this.player._body.setNextKinematicTranslation({
        x: cp.x, y: cp.y + 4, z: cp.z,
      });
      // Dźwięk poślizgu
      const carOnRoad  = isOnRoad(cp.x, cp.z);
      const absCarSpd  = Math.abs(this._drivingCar.speedKmh ?? 0);
      const slip        = this._drivingCar.wheelSlip;
      const brakingSkid = slip > 0.80 && this._drivingCar.isBraking;
      const lateralSlip = absCarSpd > 55 && this._drivingCar.steerAngle > 0.38;
      this.audio.updateSkid((brakingSkid || lateralSlip) && absCarSpd > 5, carOnRoad);
    } else {
      if (!exitedThisFrame) {
        const pp = this.player.root.position;
        this.player.update(dt, this.input, this.camCtrl, this.physics,
                           this.audio, isOnRoad(pp.x, pp.z));
      }
    }
    this.physics.step(dt);

    // ── 4. Sync Rapier → Three.js (auto + gracz) ─────────────────────────
    for (const car of this.cars) car.lateUpdate();
    this.player.lateUpdate();

    // ── Lamp knockdown — proximity check po detekcji uderzenia ───────────
    if (this._drivingCar && this._drivingCar.impactVel > 3) {
      const cp  = this._drivingCar.root.position;
      const lv  = this._drivingCar._chassis?.linvel?.() ?? { x: 0, z: 1 };
      const len = Math.hypot(lv.x, lv.z) || 1;
      for (const lamp of this._knockableLamps) {
        if (!lamp._knocked) {
          const lp = lamp.root.position;
          if (Math.hypot(cp.x - lp.x, cp.z - lp.z) < 3.5) {
            lamp.knockDown(this._drivingCar.impactVel, lv.x / len, lv.z / len);
          }
        }
      }
    }

    // ── 5. Kamera + render ────────────────────────────────────────────────
    const followPos = this._drivingCar
      ? this._drivingCar.root.position
      : this.player.root.position;
    const autoFacing = this._drivingCar
      ? this._drivingCar.facing
      : this.player.facing;

    // Camera shake — przy uderzeniu pojazdu
    if (this._drivingCar) {
      const iv = this._drivingCar.impactVel;
      if (iv > 4) {
        // trauma 0..0.85; pełny shake dopiero przy vel ≥ 20 m/s
        this.camCtrl.addTrauma(Math.min(0.85, (iv - 4) / 16));
      }
    }

    // Steer/speed do przechylenia kamery (ze znakiem — kamera nachyla się w zakrętach)
    const camSteerSign = this._drivingCar ? (this._drivingCar._steer ?? 0) : 0;
    const camSpeedFrac = this._drivingCar
      ? Math.min(1, Math.abs(this._drivingCar.speedKmh ?? 0) / 160)
      : 0;

    this.camCtrl.update(
      followPos, this.input.mouse, dt, autoFacing,
      camSteerSign, camSpeedFrac,
    );

    // ── Dynamic FOV — poczucie prędkości ────────────────────────────────────
    if (this._drivingCar) {
      const spd = Math.abs(this._drivingCar.speedKmh ?? 0);
      const sf = Math.min(1, spd / 140);
      const targetFov = 72 + sf * 26;   // 72 (spoczynek) → 98 (≈140 km/h)
      this.camera3.fov += (targetFov - this.camera3.fov) * (1 - Math.exp(-dt * 4.2));
      this.camera3.updateProjectionMatrix();
    } else if (Math.abs(this.camera3.fov - 72) > 0.1) {
      // Wróć do bazowego FOV gdy pieszo
      this.camera3.fov += (72 - this.camera3.fov) * (1 - Math.exp(-dt * 4));
      this.camera3.updateProjectionMatrix();
    }

    this.renderer.render(this.scene, this.camera3);

    // ── HUD: FPS + pozycja XYZ ────────────────────────────────────────────
    if (this._debugEl) {
      this._fpsFrames++;
      this._fpsSec += dt;
      if (this._fpsSec >= 0.5) {
        this._fpsDisplay = Math.round(this._fpsFrames / this._fpsSec);
        this._fpsFrames  = 0;
        this._fpsSec     = 0;
      }
      const pos = this._drivingCar
        ? this._drivingCar.root.position
        : this.player.root.position;
      const spd = this._drivingCar
        ? `${Math.abs(Math.round(this._drivingCar.speedKmh ?? 0))} km/h`
        : '';
      this._debugEl.innerHTML =
        `FPS: ${this._fpsDisplay}<br>` +
        `X: ${pos.x.toFixed(1)}&nbsp; Y: ${pos.y.toFixed(1)}&nbsp; Z: ${pos.z.toFixed(1)}` +
        (spd ? `<br>${spd}` : '');
    }
  }
}

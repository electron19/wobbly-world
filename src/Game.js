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
const CAM_DIST_CAR  = 12;    // dystans kamery w aucie

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
    this._interactEl       = null;
    this._uiEl             = null;
    this._exitCarThisFrame = false;
    this._worldObjects     = [];
    this._cullFrame        = 0;
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

    this.camera3 = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 110);
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
    // Kamera ustawia się za autem od razu
    this.camCtrl.yaw  = car.facing + Math.PI;
    this.camCtrl.dist = CAM_DIST_CAR;
    this._uiEl.innerHTML =
      'WASD – jedź &nbsp;|&nbsp; SPACJA – h. ręczny &nbsp;|&nbsp; H – klakson &nbsp;|&nbsp; Mysz – kamera &nbsp;|&nbsp; E – wysiądź';
  }

  _exitCar() {
    const car = this._drivingCar;
    const pos = car.root.position;   // pozycja z cannon-es (synced w lateUpdate)
    // Wysiądź z boku (prostopadle do kierunku jazdy)
    const sideX = pos.x + Math.cos(car.facing) * 2.8;
    const sideZ = pos.z - Math.sin(car.facing) * 2.8;
    this.player._body.setNextKinematicTranslation({
      x: sideX, y: pos.y + 1.2, z: sideZ,
    });
    this.player.root.visible = true;
    car._audio    = null;
    this.audio.stopEngine();
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
    const dt = Math.min((ts - this._lastTs) / 1000, 0.05);
    this._lastTs = ts;

    this.input.flush();
    this._updateCulling();
    this._updateInteraction();

    const exitedThisFrame = this._exitCarThisFrame;
    this._exitCarThisFrame = false;

    // ── 1. Wejście → cannon-es (siły pojazdu) ────────────────────────────
    if (this._drivingCar) {
      this._drivingCar.update(dt, this.input, this.audio);
    }

    // ── 2. Krok cannon-es (fizyka pojazdów) ──────────────────────────────
    for (const lamp of this._knockableLamps) lamp.update(dt);
    this.vehiclePhysics.step(dt);

    // ── 3. Sync: cannon-es → Three.js + Rapier body (wszystkie auta) ─────
    for (const car of this.cars) car.lateUpdate();

    // ── 4. Krok Rapier (gracz + kolizje świata) ───────────────────────────
    if (this._drivingCar) {
      // Gracz niewidoczny jedzie razem z autem
      const cp = this._drivingCar.root.position;
      this.player._body.setNextKinematicTranslation({
        x: cp.x, y: cp.y + 0.7, z: cp.z,
      });
      // Dźwięk poślizgu — pisk gdy koła realnie blokują (slip ratio) LUB boczny drift
      const carOnRoad  = isOnRoad(cp.x, cp.z);
      const absCarSpd  = Math.abs(this._drivingCar.speedKmh ?? 0);
      const slip        = this._drivingCar.wheelSlip;
      // Boczny drift: dużo skrętu + wysoka prędkość → pisk w zakrętach (GTA-feel)
      const lateralSlip = absCarSpd > 55 && this._drivingCar.steerAngle > 0.38;
      this.audio.updateSkid((slip > 0.80 || lateralSlip) && absCarSpd > 5, carOnRoad);
    } else {
      if (!exitedThisFrame) {
        const pp = this.player.root.position;
        this.player.update(dt, this.input, this.camCtrl, this.physics,
                           this.audio, isOnRoad(pp.x, pp.z));
      }
    }
    this.physics.step(dt);
    this.player.lateUpdate();

    // ── 5. Kamera + render ────────────────────────────────────────────────
    const followPos = this._drivingCar
      ? this._drivingCar.root.position
      : this.player.root.position;
    const autoFacing = this._drivingCar
      ? this._drivingCar.facing
      : this.player.facing;
    this.camCtrl.update(followPos, this.input.mouse, dt, autoFacing);

    this.renderer.render(this.scene, this.camera3);
  }
}

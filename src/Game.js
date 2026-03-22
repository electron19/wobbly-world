import * as THREE from 'three';
import { initRapier, PhysicsWorld } from './core/Physics.js';
import { InputManager }             from './core/InputManager.js';
import { ThirdPersonCamera }        from './core/Camera.js';
import { PlayerMichaelMyers }       from './entities/PlayerMichaelMyers.js';
import { WorldBuilder }             from './world/WorldBuilder.js';

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
    this.scene       = null;
    this.renderer    = null;
    this.camera3     = null;
    this.physics     = null;
    this.input       = null;
    this.camCtrl     = null;
    this.player      = null;
    this.cars        = [];
    this._drivingCar = null;   // aktualnie prowadzone auto
    this._eWasDown   = false;  // edge detection klawisza E
    this._lastTs     = 0;
    this._interactEl      = null;
    this._uiEl            = null;
    this._exitCarThisFrame = false;
  }

  async init() {
    // ─── 1. Fizyka ─────────────────────────────────────────────────────────
    await initRapier();
    this.physics = new PhysicsWorld();

    // ─── 2. Renderer + scena ───────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7EC8F5);
    this.scene.fog = new THREE.FogExp2(0x7EC8F5, 0.012);

    this.camera3 = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 300);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    // ─── 3. Oświetlenie ────────────────────────────────────────────────────
    this._setupLighting();

    // ─── 4. Wejście + kamera ───────────────────────────────────────────────
    this.input   = new InputManager();
    this.camCtrl = new ThirdPersonCamera(this.camera3);

    // ─── 5. Świat + auta ───────────────────────────────────────────────────
    const wb  = new WorldBuilder(this.scene, this.physics);
    wb.build();
    this.cars = wb.cars;

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
  }

  _setupLighting() {
    this.scene.add(new THREE.AmbientLight(0xffeedd, 0.65));
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.1);
    sun.position.set(20, 40, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near   = 1;
    sun.shadow.camera.far    = 180;
    sun.shadow.camera.top    = sun.shadow.camera.right  =  80;
    sun.shadow.camera.bottom = sun.shadow.camera.left   = -80;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0x87CEEB, 0x5a9e35, 0.3));
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
    // Kamera ustawia się za autem od razu
    this.camCtrl.yaw  = car.facing + Math.PI;
    this.camCtrl.dist = CAM_DIST_CAR;
    this._uiEl.innerHTML =
      'WASD – jedź &nbsp;|&nbsp; Mysz – kamera &nbsp;|&nbsp; E – wysiądź';
  }

  _exitCar() {
    const car = this._drivingCar;
    const pos = car._body.translation();
    // Wysiądź z boku (prostopadle do kierunku jazdy)
    const sideX = pos.x + Math.cos(car.facing) * 2.8;
    const sideZ = pos.z - Math.sin(car.facing) * 2.8;
    this.player._body.setNextKinematicTranslation({
      x: sideX, y: pos.y + 0.2, z: sideZ,
    });
    this.player.root.visible = true;
    car.isOccupied        = false;
    this._drivingCar      = null;
    this._exitCarThisFrame = true;
    this.camCtrl.dist = CAM_DIST_FOOT;
    this._uiEl.innerHTML =
      'WASD – ruch &nbsp;|&nbsp; SPACJA – skok &nbsp;|&nbsp; Mysz – kamera (kliknij ekran)';
  }

  /** Obsługa wejścia/wyjścia z auta + hint UI. */
  _updateInteraction() {
    const eDown    = this.input.isDown('KeyE');
    const ePressed = eDown && !this._eWasDown;
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
    this._updateInteraction();

    const exitedThisFrame = this._exitCarThisFrame;
    this._exitCarThisFrame = false;

    if (this._drivingCar) {
      // ── Tryb jazdy ─────────────────────────────────────────────────────
      this._drivingCar.update(dt, this.input);
      this.physics.step(dt);
      this._drivingCar.lateUpdate();

      // Gracz (niewidoczny) jedzie z autem — żeby nie wypadł przez podłogę
      const cp = this._drivingCar._body.translation();
      this.player._body.setNextKinematicTranslation(cp);

      this.camCtrl.update(this._drivingCar.root.position, this.input.mouse);

    } else {
      // ── Tryb pieszy ────────────────────────────────────────────────────
      // Jeśli właśnie wysiedliśmy — pomiń player.update() w tej klatce
      // (teleport setNextKinematicTranslation nie może być nadpisany)
      if (!exitedThisFrame) {
        this.player.update(dt, this.input, this.camCtrl, this.physics);
      }
      this.physics.step(dt);
      this.player.lateUpdate();

      this.camCtrl.update(this.player.root.position, this.input.mouse);
    }

    this.renderer.render(this.scene, this.camera3);
  }
}

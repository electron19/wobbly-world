import * as THREE from 'three';
import { initRapier, PhysicsWorld } from './core/Physics.js';
import { InputManager }             from './core/InputManager.js';
import { ThirdPersonCamera }        from './core/Camera.js';
import { Player }                   from './entities/Player.js';
import { WorldBuilder }             from './world/WorldBuilder.js';

// Środek kapsuły gracza przy spawnie — snapToGround przyciągnie do ziemi
const PLAYER_SPAWN = { x: 0, y: 1.5, z: 34 };

/**
 * Główna klasa gry — orkiestrator.
 *
 * Odpowiada za:
 *   - inicjalizację Rapier, Three.js, oświetlenia
 *   - tworzenie gracza i świata
 *   - game loop
 *
 * Cykl klatki:
 *   1. input.flush()
 *   2. player.update()         → oblicz ruch, setNextKinematicTranslation
 *   3. physics.step()          → Rapier przesuwa wszystkie ciała
 *   4. player.lateUpdate()     → sync visual z physics, animacje
 *   5. camera.update()         → kamera za graczem
 *   6. renderer.render()
 */
export class Game {
  constructor() {
    this.scene    = null;
    this.renderer = null;
    this.camera3  = null;
    this.physics  = null;
    this.input    = null;
    this.camCtrl  = null;
    this.player   = null;
    this._lastTs  = 0;
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

    // ─── 5. Świat (budynki, drzewa, teren) ────────────────────────────────
    new WorldBuilder(this.scene, this.physics).build();

    // ─── 6. Gracz ──────────────────────────────────────────────────────────
    this.player = new Player(this.scene);
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

    // ─── 8. Ukryj ekran ładowania ──────────────────────────────────────────
    const el = document.getElementById('loading');
    el.style.opacity = '0';
    setTimeout(() => (el.style.display = 'none'), 600);
    document.getElementById('ui').style.display   = 'block';
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

  start() {
    requestAnimationFrame(ts => this._loop(ts));
  }

  _loop(ts) {
    requestAnimationFrame(t => this._loop(t));
    const dt = Math.min((ts - this._lastTs) / 1000, 0.05);
    this._lastTs = ts;

    // 1. Skonsumuj delty myszy
    this.input.flush();

    // 2. Gracz oblicza ruch → ustawia nextKinematicTranslation
    this.player.update(dt, this.input, this.camCtrl, this.physics);

    // 3. Rapier przesuwa ciała i rozwiązuje kolizje
    this.physics.step(dt);

    // 4. Sync visual z physics + animacje
    this.player.lateUpdate();

    // 5. Kamera za graczem
    this.camCtrl.update(this.player.root.position, this.input.mouse);

    // 6. Render
    this.renderer.render(this.scene, this.camera3);
  }
}

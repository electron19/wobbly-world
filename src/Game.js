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
import { Minimap }                  from './ui/Minimap.js';
import { SkySystem }                from './world/SkySystem.js';
import { WeatherSystem }            from './world/WeatherSystem.js';
import { SeasonSystem }             from './world/SeasonSystem.js';

const PLAYER_SPAWN      = { x: 0, y: 1.5, z: 34 };
const ENTER_DIST        = 2.2;   // max odległość od krawędzi auta do wejścia
const BUILDING_DIST     = 2.8;   // max odległość do drzwi budynku
const CAM_DIST_FOOT     = 8;     // dystans kamery pieszo
const CAM_DIST_CAR      = 8.4;   // ciaśniejsza kamera w aucie = lepszy feeling prędkości

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
    this.buildings      = [];
    this.npcs           = [];
    this.audio          = new AudioManager();
    this._drivingCar    = null;
    this._insideBuilding = null;
    this._knockableLamps = [];
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
    this._savedCamPitch    = 0.35;
    this._minimap          = null;
    this._interactCooldown = 0;   // blokada E po wejściu/wyjściu z auta
    this._actionCooldown   = 0;   // blokada wsiadania po akcji (fart/burp)
    this._sky              = null;
    this._weather          = null;
    this._seasons          = null;
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

    // ─── 3. Oświetlenie — zarządzane przez SkySystem ──────────────────────
    this._sky     = new SkySystem(this.scene);
    this._weather = new WeatherSystem(this.scene);
    this._seasons = new SeasonSystem();

    // ─── 4. Wejście + kamera ───────────────────────────────────────────────
    this.input   = new InputManager();
    this.camCtrl = new ThirdPersonCamera(this.camera3);

    // ─── 5. Świat + auta ───────────────────────────────────────────────────
    const wb  = new WorldBuilder(this.scene, this.physics, this.vehiclePhysics);
    wb.build();
    this.cars          = wb.cars;
    this.buildings     = wb.buildings;
    this.npcs          = wb.npcs;
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

    // ─── 8a. Zoom kamery scrollem ──────────────────────────────────────────
    window.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camCtrl.dist = Math.max(3, Math.min(25, this.camCtrl.dist + e.deltaY * 0.02));
    }, { passive: false });

    // ─── 9. UI ─────────────────────────────────────────────────────────────
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

    // ─── 10. Minimap ───────────────────────────────────────────────────────────
    this._minimap = new Minimap(document.body);
  }

  // _setupLighting replaced by SkySystem

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

  // ─── Interakcja z budynkami ───────────────────────────────────────────────

  /** Znajdź najbliższy dom z otwartymi drzwiami w zasięgu BUILDING_DIST. */
  _nearestBuilding() {
    if (this._drivingCar) return null;
    const pp = this.player.root.position;
    let best = null, bestD = BUILDING_DIST;
    for (const b of this.buildings) {
      if (!b.hasInterior) continue;
      const dp = b.getDoorApproachPos();
      const d  = Math.hypot(pp.x - dp.x, pp.z - dp.z);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  _enterBuilding(b) {
    this._insideBuilding = b;
    b.setInsideView(true);
    const sp = b.getInteriorSpawnPos();
    this.player._body.setNextKinematicTranslation({ x: sp.x, y: sp.y, z: sp.z });
    // FPP: schowaj mesh gracza, przełącz kamerę na widok z oczu
    this.player.root.visible = false;
    this._savedCamPitch      = this.camCtrl.pitch;
    this.camCtrl.pitch       = 0;       // horyzont przy wejściu
    this.camCtrl.firstPerson = true;
    this._uiEl.innerHTML = 'WASD – ruch &nbsp;|&nbsp; SPACJA – skok &nbsp;|&nbsp; E – wyjdź';
  }

  _exitBuilding() {
    const b  = this._insideBuilding;
    b.setInsideView(false);
    this._insideBuilding = null;
    const ep = b.getExitPos();
    this.player._body.setNextKinematicTranslation({ x: ep.x, y: ep.y, z: ep.z });
    // Przywróć widok TPP
    this.player.root.visible = true;
    this.camCtrl.firstPerson = false;
    this.camCtrl.pitch       = this._savedCamPitch;
    this.camCtrl.dist        = CAM_DIST_FOOT;
    this._uiEl.innerHTML =
      'WASD – ruch &nbsp;|&nbsp; SPACJA – skok &nbsp;|&nbsp; F – pierdzenie &nbsp;|&nbsp; B – beknięcie &nbsp;|&nbsp; K – usypiaj &nbsp;|&nbsp; E – wsiądź';
  }

  // ─── Interakcja z autem ───────────────────────────────────────────────────

  /** Znajdź najbliższe auto w zasięgu ENTER_DIST (od krawędzi, nie centrum). */
  _nearestCar() {
    const pp = this.player.root.position;
    let best = null, bestD = ENTER_DIST;
    for (const car of this.cars) {
      // Nie pozwalaj wsiąść do auta bez poprawnie zainicjalizowanej fizyki.
      // W przeciwnym razie `car.update()` wywali błąd i cała pętla gry stanie.
      if (car.isOccupied || !car.isDrivable) continue;
      const cp = car.root.position;
      const cf = car.facing;
      // Przekształć do lokalnego układu auta
      const dx = pp.x - cp.x;
      const dz = pp.z - cp.z;
      const localX =  dx * Math.cos(cf) + dz * Math.sin(cf);
      const localZ = -dx * Math.sin(cf) + dz * Math.cos(cf);
      // Odległość od najbliższego punktu bounding boxa auta (2.2 × 1.2)
      const nearX = localX - Math.max(-1.2, Math.min(1.2, localX));
      const nearZ = localZ - Math.max(-2.2, Math.min(2.2, localZ));
      const d = Math.hypot(nearX, nearZ);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  _enterCar(car) {
    // Guard na uszkodzony/niezainicjalizowany pojazd (np. po niepełnym buildzie świata).
    if (!car?.isDrivable) return;
    this._drivingCar = car;
    car.isOccupied   = true;
    this.player.root.visible = false;
    // Hard-teleport player to the same position the game-loop will use (cp.y + 4).
    // Using +30 then next-frame +4 created ~1557 m/s downward kinematic velocity →
    // Rapier speculative contacts → huge upward impulse → car launched into the air.
    // setTranslation() with the final target = zero velocity, zero contact force.
    const cp = car.root.position;
    this.player._body.setTranslation({ x: cp.x, y: cp.y + 4, z: cp.z }, false);
    car._audio = this.audio;
    this.audio.playEngineStart();
    this.audio.startTires();
    this._interactCooldown = 20;  // ~0.33s blokady na E po wsiadaniu
    // Kamera ustawia się za autem od razu
    this.camCtrl.yaw  = car.facing + Math.PI;
    this.camCtrl.dist = CAM_DIST_CAR;
    this._uiEl.innerHTML =
      'WASD – jedź &nbsp;|&nbsp; SPACJA – h. ręczny &nbsp;|&nbsp; F – LOT &nbsp;|&nbsp; H – klakson &nbsp;|&nbsp; Mysz – kamera &nbsp;|&nbsp; E – wysiądź';
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
    car._flyMode  = false;   // wyłącz lot przy wysiadaniu
    this.audio.stopEngine();
    this.audio.stopTires();
    car.isOccupied        = false;
    this._drivingCar      = null;
    this._exitCarThisFrame = true;
    this._interactCooldown = 25;  // ~0.4s blokady po wysiadaniu (żeby nie wsiadać natychmiast)
    this.camCtrl.dist = CAM_DIST_FOOT;
    this._uiEl.innerHTML =
      'WASD – ruch &nbsp;|&nbsp; SPACJA – skok &nbsp;|&nbsp; F – pierdzenie &nbsp;|&nbsp; B – beknięcie &nbsp;|&nbsp; K – usypiaj &nbsp;|&nbsp; E – wsiądź';
  }

  /** Czerwony dym z gęby — NPC i zwierzęta w promieniu 14 j.ś. zasypiają. */
  _sleepNPCs() {
    const pp = this.player.root.position;
    // Usypia tylko te przed graczem (stożek ±70°) w promieniu 14 j.ś.
    const fwdX = Math.sin(this.player.facing);
    const fwdZ = Math.cos(this.player.facing);
    for (const npc of this.npcs) {
      const dx = npc.root.position.x - pp.x;
      const dz = npc.root.position.z - pp.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 > 14 * 14) continue;
      const len = Math.sqrt(dist2) || 1;
      const dot = (dx / len) * fwdX + (dz / len) * fwdZ;
      if (dot > 0.34) npc.sleep?.();   // stożek ±70°
    }
  }

  /** Wywołuje strach u NPC i zwierząt w promieniu 18 j.ś. */
  _scareNPCs() {
    const pp = this.player.root.position;
    for (const npc of this.npcs) {
      const dx = npc.root.position.x - pp.x;
      const dz = npc.root.position.z - pp.z;
      if (dx * dx + dz * dz < 18 * 18) {
        npc.scare?.(pp.x, pp.z);
      }
    }
  }

  /** Obsługa wejścia/wyjścia z auta i budynków + hint UI. */
  _updateInteraction() {
    if (this._interactCooldown > 0) { this._interactCooldown -= 1; return; }
    // Blokada po akcji (fart/burp) — zapobiega przypadkowemu wsiadaniu do auta
    if (this._actionCooldown   > 0) { this._actionCooldown   -= 1; return; }

    // Klawiatura: E — wsiadaj/wysiadaj   Pad: button 1 (B/Circle) — OSOBNY od F/B/K
    const ePressed = this.input.isJustPressed('KeyE') || this.input.isPadButtonPressed(1);

    if (ePressed) {
      if (this._drivingCar) {
        this._exitCar();
      } else if (this._insideBuilding) {
        this._exitBuilding();
      } else {
        const nearCar  = this._nearestCar();
        const nearBldg = this._nearestBuilding();
        if (nearCar)        this._enterCar(nearCar);
        else if (nearBldg)  this._enterBuilding(nearBldg);
      }
    }

    // Hint UI
    if (this._interactEl) {
      if (this._drivingCar) {
        this._interactEl.textContent = 'E — wysiądź';
        this._interactEl.style.display = 'block';
      } else if (this._insideBuilding) {
        this._interactEl.textContent = 'E — wyjdź';
        this._interactEl.style.display = 'block';
      } else {
        const nearCar  = this._nearestCar();
        const nearBldg = this._nearestBuilding();
        if (nearCar) {
          this._interactEl.textContent = 'E — wsiądź';
          this._interactEl.style.display = 'block';
        } else if (nearBldg) {
          this._interactEl.textContent = 'E — wejdź';
          this._interactEl.style.display = 'block';
        } else {
          this._interactEl.style.display = 'none';
        }
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

    // Widoczność gracza — synchronizuj co klatkę ze stanem gry.
    // Gracz niewidoczny gdy: w aucie LUB w budynku (FPP).
    // To eliminuje wszelkie race-conditions z `visible` ustawianym w callbackach.
    this.player.root.visible = !this._drivingCar && !this._insideBuilding;

    const exitedThisFrame = this._exitCarThisFrame;
    this._exitCarThisFrame = false;

    // ── 1. Wejście → Rapier vehicle controller (siły pojazdu + updateVehicle) ──
    if (this._drivingCar) {
      if (this._drivingCar.isDrivable) {
        this._drivingCar.update(dt, this.input, this.audio);
      } else {
        // Failsafe: nie zostawiaj gry w stanie "w aucie", gdy auto nie ma fizyki.
        this._drivingCar.isOccupied = false;
        this._drivingCar = null;
      }
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
      // Pad: button 2 (X/Square) = pierdzenie, button 3 (Y/Triangle) = beknięcie+usypianie
      // OSOBNE od button 0 (A/Cross) = wsiadaj/wysiadaj
      const burp = this.player.justBurped || this.input.isPadButtonPressed(3);
      const fart = this.player.justFarted || this.input.isPadButtonPressed(2);
      const yawn = this.player.justYawned;
      if (fart) {
        this.audio.playFart();
        this.player._emitFartCloud();
        this._scareNPCs();
        this._actionCooldown = 20;   // ~0.33 s blokady wsiadania po akcji
      }
      if (burp || yawn) {
        this.audio.playBurp();
        this.audio.playYawn();
        this.player._emitSleepCloud();
        this._sleepNPCs();
        this._actionCooldown = 20;
      }
    }
    this.physics.step(dt);

    // ── 4. Sync Rapier → Three.js (auto + gracz) ─────────────────────────
    for (const car of this.cars) car.lateUpdate();
    this.player.lateUpdate();

    // ── NPC + Animals — update tylko gdy blisko gracza (≤ 120 j.ś.) ──────
    const npcRef = this._drivingCar ? this._drivingCar.root.position : this.player.root.position;
    for (const npc of this.npcs) {
      const dx = npc.root.position.x - npcRef.x;
      const dz = npc.root.position.z - npcRef.z;
      if (dx * dx + dz * dz < 14400) npc.update(dt);
    }

    // ── Lamp knockdown — proximity check po detekcji uderzenia ───────────
    if (this._drivingCar && this._drivingCar.impactVel > 3) {
      const cp  = this._drivingCar.root.position;
      const lv  = this._drivingCar._chassis?.linvel?.() ?? { x: 0, z: 0 };
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

    // ── Sky / Weather / Season ───────────────────────────────────────────
    const worldRef = this._drivingCar ? this._drivingCar.root.position : this.player.root.position;
    this._seasons.update(dt);
    this._sky.update(dt, worldRef, this._seasons);
    this._weather.update(dt, worldRef, this._sky, this._seasons.isWinter);

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

    // ── Minimap ───────────────────────────────────────────────────────────────
    if (this._minimap && !this._insideBuilding) {
      const mapPos    = this._drivingCar ? this._drivingCar.root.position : this.player.root.position;
      const mapFacing = this._drivingCar ? this._drivingCar.facing       : this.player.facing;
      this._minimap.update(mapPos, mapFacing, this.cars, this._drivingCar, this.buildings);
    }

    // ── Fly mode badge ────────────────────────────────────────────────────────
    if (this._drivingCar && this._interactEl) {
      if (this._drivingCar._flyMode) {
        this._interactEl.textContent = '✈ TRYB LOTU — SPACJA wznosi, S opada';
        this._interactEl.style.display = 'block';
      } else if (this._interactEl.textContent.startsWith('✈')) {
        this._interactEl.style.display = 'none';
      }
    }

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

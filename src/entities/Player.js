import * as THREE from 'three';
import { Entity } from './Entity.js';
import { toonMat, addOutline, C } from '../core/Materials.js';

// ─── Stałe gracza ─────────────────────────────────────────────────────────────
const SPEED    = 5.5;
const JUMP_VEL = 9.5;
const GRAVITY  = 22;

// Kapsuła: halfH=0.4, radius=0.3 → środek kapsuły 0.7 nad dołem kapsuły.
// Buty MM są w lokalnym y≈−0.23, więc root musi być 0.23 wyżej niż ziemia:
// root = body.y − 0.47  →  buty wychodzą na y≈0 (poziom podłogi).
const CAPSULE_OFFSET_Y = 0.47;

// ─── Spring (sprężyna do efektu wobbly) ───────────────────────────────────────
class Spring {
  constructor(k = 18, d = 0.75) {
    this.k = k; this.d = d;
    this.pos = 0; this.vel = 0;
  }
  update(dt, target = 0) {
    const acc = (target - this.pos) * this.k - this.vel * this.d * 2 * Math.sqrt(this.k);
    this.vel += acc * dt;
    this.pos += this.vel * dt;
  }
  kick(v) { this.vel += v; }
}

// ─── Player ───────────────────────────────────────────────────────────────────
export class Player extends Entity {
  constructor(scene) {
    super(scene);
    this.grounded  = true;
    this.velocityY = 0;
    this.facing    = 0;

    this._walkPhase  = 0;
    this._fartWasDown = false;
    this._burpWasDown = false;
    this._yawnWasDown = false;
    this._flyMode     = false;
    this._flyBob      = 0;   // faza animacji lotu (góra-dół)
    this.spSquishY = new Spring(22, 0.80);
    this.spSquishX = new Spring(16, 0.70);
    this.spLean    = new Spring(12, 0.70);
    this._fartClouds  = [];   // aktywne chmury smrodu
    this._sleepClouds = [];   // aktywne chmury usypiające

    this.root.rotation.order = 'YXZ';

    this._buildBody();
    this._buildEyes();
    this._buildLimbs();
  }

  // ─── Budowanie postaci ──────────────────────────────────────────────────────

  _buildBody() {
    this.bodyGeo  = new THREE.SphereGeometry(0.55, 22, 14);
    this.bodyOrig = this.bodyGeo.attributes.position.array.slice();
    this.bodyMesh = new THREE.Mesh(this.bodyGeo, toonMat(C.skin));
    this.bodyMesh.position.y = 0.58;
    this.bodyMesh.castShadow = true;
    addOutline(this.bodyMesh, 0.07);
    this.root.add(this.bodyMesh);
  }

  _buildEyes() {
    const wMat = toonMat(C.white);
    const dMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const sMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    [-1, 1].forEach(side => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), wMat));
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), dMat);
      pupil.position.z = 0.07;
      g.add(pupil);
      const gleam = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), sMat);
      gleam.position.set(0.04, 0.04, 0.10);
      g.add(gleam);
      g.position.set(side * 0.22, 0.72, 0.44);
      this.root.add(g);
    });
  }

  _buildLimbs() {
    const sM  = toonMat(C.skin);
    const pM  = toonMat(C.pants);
    const shM = toonMat(C.shoes);
    this.lArm = this._makeArm(-1, sM);
    this.rArm = this._makeArm( 1, sM);
    this.lLeg = this._makeLeg(-1, pM, shM);
    this.rLeg = this._makeLeg( 1, pM, shM);
  }

  _makeArm(side, mat) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.10, 0.28, 4, 8), mat);
    m.castShadow = true;
    g.add(m);
    g.position.set(side * 0.70, 0.62, 0);
    g.rotation.z = side * -0.25;
    this.root.add(g);
    return g;
  }

  _makeLeg(side, pantsMat, shoeMat) {
    const g = new THREE.Group();
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.22, 4, 8), pantsMat);
    thigh.position.y = -0.10;
    thigh.castShadow = true;
    g.add(thigh);
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), shoeMat);
    shoe.position.set(side * 0.03, -0.29, 0.05);
    shoe.scale.set(1.1, 0.75, 1.3);
    g.add(shoe);
    g.position.set(side * 0.23, 0.16, 0);
    this.root.add(g);
    return g;
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  /**
   * Oblicza ruch i ustawia nextKinematicTranslation w Rapier.
   * Wywołaj PRZED physics.step().
   */
  update(dt, input, camera, physics, audio, onRoad = false) {
    // Kierunek ruchu z klawiatury (względem kamery)
    let mx = 0, mz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp'))    mz -= 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown'))  mz += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft'))  mx -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) mx += 1;
    // Lewy analog pada
    if (Math.abs(input.pad.leftX) > 0.12) mx += input.pad.leftX;
    if (Math.abs(input.pad.leftY) > 0.12) mz += input.pad.leftY;

    const fwd   = camera.getForwardDir();
    const right = camera.getRightDir();
    const move  = new THREE.Vector3()
      .addScaledVector(fwd,   -mz)
      .addScaledVector(right,  mx);
    if (move.lengthSq() > 0) move.normalize();
    const isMoving = move.lengthSq() > 0.01;

    if (this._flyMode) {
      // ── Tryb lotu ──────────────────────────────────────────────────────────
      const FLY_SPEED = 14;
      let flyY = 0;
      if (input.isDown('Space') || input.isPadButtonDown?.(0)) flyY =  1;
      if (input.isDown('ShiftLeft') || input.isDown('ShiftRight') ||
          input.isDown('ControlLeft') || input.isDown('ControlRight')) flyY = -1;

      const desired = {
        x: move.x * FLY_SPEED * dt,
        y: flyY  * FLY_SPEED * dt,
        z: move.z * FLY_SPEED * dt,
      };
      physics.movePlayer(this._body, this._collider, desired);
      this.grounded  = false;
      this.velocityY = 0;

      // Animacja lotu — ramiona na boki, delikatne pokołysanie
      this._flyBob += dt * 2.0;
      const bob = Math.sin(this._flyBob) * 0.04;
      this.lArm.rotation.z =  1.10 + bob;
      this.rArm.rotation.z = -1.10 - bob;
      this.lArm.rotation.x = -0.20;
      this.rArm.rotation.x = -0.20;
      // Lekkie pochylenie ciała w kierunku ruchu
      this.root.rotation.x = isMoving ? -0.18 : 0;
    } else {
      // ── Normalne chodzenie ─────────────────────────────────────────────────
      this.root.rotation.x = 0;

      // Skok
      if ((input.isDown('Space') || input.isDown('KeyZ') || input.isPadButtonPressed(0)) && this.grounded) {
        this.velocityY = JUMP_VEL;
        this.grounded  = false;
        this.spSquishY.kick(-0.4);
        this.spSquishX.kick(0.2);
        audio?.playJump();
      }

      // Grawitacja (ręczna dla kinematic body)
      if (!this.grounded) {
        this.velocityY -= GRAVITY * dt;
      } else if (this.velocityY < 0) {
        this.velocityY = -2; // mały downward force dla snapToGround
      }

      const desired = {
        x: move.x * SPEED * dt,
        y: this.velocityY * dt,
        z: move.z * SPEED * dt,
      };

      // Przesuń przez Rapier (collision detection)
      const wasGrounded = this.grounded;
      const result      = physics.movePlayer(this._body, this._collider, desired);
      this.grounded     = result.grounded;

      // Efekt lądowania
      if (!wasGrounded && this.grounded) {
        if (this.velocityY < -4) {
          this.spSquishY.kick(-0.5);
          this.spSquishX.kick(0.3);
          audio?.playLand();
        }
        this.velocityY = 0;
      }
    }

    // Obrót postaci w kierunku ruchu (smooth) — tylko poza lotem
    if (isMoving) {
      const target = Math.atan2(move.x, move.z);
      let diff = target - this.facing;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.facing += diff * Math.min(1, dt * 12);
    }
    this.root.rotation.y = this.facing;

    // ─── Sprężyny (wizualne squish/lean) ───────────────────────────────────
    this.spSquishY.update(dt, isMoving ? -0.08 : 0);
    this.spSquishX.update(dt, isMoving ?  0.05 : 0);
    this.spLean.update(dt,    isMoving ? -0.12 : 0);

    const sy = 1 + this.spSquishY.pos;
    const sx = 1 + this.spSquishX.pos;
    this.bodyMesh.scale.set(sx, sy, sx);

    // ─── Pierdnięcie (F) i beknięcie (B) ──────────────────────────────────────
    // Dźwięk i scatter NPC obsługiwane w Game.js — tu tylko śledzenie krawędzi
    const fartDown = input.isDown('KeyF');
    this.justFarted = fartDown && !this._fartWasDown;
    this._fartWasDown = fartDown;

    const burpDown = input.isDown('KeyB');
    this.justBurped = burpDown && !this._burpWasDown;
    this._burpWasDown = burpDown;

    const yawnDown = input.isDown('KeyK');
    this.justYawned = yawnDown && !this._yawnWasDown;
    this._yawnWasDown = yawnDown;

    // ─── Kroki (dźwięk) ────────────────────────────────────────────────────────
    audio?.checkFootstep(this._walkPhase, isMoving, this.grounded, onRoad);

    // ─── Animacja kończyn — w locie: ramiona rozłożone (ustawiane wyżej), w chodzie: swing ──
    if (!this._flyMode) {
      if (isMoving) this._walkPhase += SPEED * dt * 2.8;
      if (isMoving) {
        const swing = Math.sin(this._walkPhase) * 0.80;
        this.lLeg.rotation.x =  swing;
        this.rLeg.rotation.x = -swing;
        this.lArm.rotation.x = -swing * 0.55;
        this.rArm.rotation.x =  swing * 0.55;
      } else {
        // Wróć do pozycji wyjściowej po wyjściu z lotu
        this.lLeg.rotation.x *= 0.85;
        this.rLeg.rotation.x *= 0.85;
        this.lArm.rotation.x *= 0.85;
        this.rArm.rotation.x *= 0.85;
        this.lArm.rotation.z += (0 - this.lArm.rotation.z) * 0.15;
        this.rArm.rotation.z += (0 - this.rArm.rotation.z) * 0.15;
      }
    } else {
      // W locie: nogi luźno opuszczone
      this.lLeg.rotation.x += (-0.20 - this.lLeg.rotation.x) * 0.10;
      this.rLeg.rotation.x += (-0.20 - this.rLeg.rotation.x) * 0.10;
    }
  }

  /** Włącz / wyłącz tryb latania. */
  setFlyMode(enabled) {
    this._flyMode = enabled;
    if (!enabled) {
      // Reset pochylenia ciała gdy lądowanie
      this.root.rotation.x = 0;
      this.lArm.rotation.z = -0.25;
      this.rArm.rotation.z =  0.25;
    }
  }

  /**
   * Emituje czerwony usypiający dym z ust postaci (do przodu i w górę).
   */
  _emitSleepCloud() {
    const fwdX = Math.sin(this.facing);
    const fwdZ = Math.cos(this.facing);

    for (let i = 0; i < 12; i++) {
      const r = 0.12 + Math.random() * 0.22;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 6, 5),
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? 0xCC0022 : (i % 3 === 1 ? 0xFF2244 : 0x991133),
          transparent: true, opacity: 0.80, depthWrite: false,
        }),
      );
      // Usta — przód głowy, wysoko
      mesh.position.set(
        this.root.position.x + fwdX * 0.45 + (Math.random() - 0.5) * 0.20,
        this.root.position.y + 0.72 + Math.random() * 0.10,
        this.root.position.z + fwdZ * 0.45 + (Math.random() - 0.5) * 0.20,
      );
      this.scene.add(mesh);
      this._sleepClouds.push({
        mesh,
        life: 2.5 + Math.random() * 1.5,
        vx: fwdX * (1.2 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.5,
        vy: 0.5 + Math.random() * 0.8,
        vz: fwdZ * (1.2 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.5,
      });
    }
  }

  /**
   * Emituje zielone kulki smrodu z tyłka postaci.
   * Tyłek = tył gracza (przeciwny do kierunku patrzenia), nisko przy pupie.
   */
  _emitFartCloud() {
    // Kierunek "do tyłu" (tyłek)
    const backX = -Math.sin(this.facing);
    const backZ = -Math.cos(this.facing);

    for (let i = 0; i < 9; i++) {
      const r = 0.10 + Math.random() * 0.18;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 6, 5),
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? 0x33BB00 : (i % 3 === 1 ? 0x66DD11 : 0x22AA44),
          transparent: true, opacity: 0.82, depthWrite: false,
        }),
      );

      // Pozycja: tyłek postaci (za plecami, na poziomie pośladków)
      mesh.position.set(
        this.root.position.x + backX * 0.38 + (Math.random() - 0.5) * 0.25,
        this.root.position.y + 0.18 + Math.random() * 0.15,
        this.root.position.z + backZ * 0.38 + (Math.random() - 0.5) * 0.25,
      );
      this.scene.add(mesh);

      // Prędkość: głównie do tyłu + w górę + lekko na boki
      this._fartClouds.push({
        mesh,
        life: 2.0 + Math.random() * 1.2,
        vx: backX * (1.4 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.6,
        vy: 0.6 + Math.random() * 0.9,
        vz: backZ * (1.4 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.6,
      });
    }
  }

  /**
   * Synchronizuje pozycję wizualną z fizyczną.
   * Wywołaj PO physics.step().
   */
  lateUpdate() {
    this._syncFromBody(-CAPSULE_OFFSET_Y);
    // Idle bob (na wierzchu zsynchronizowanej pozycji)
    const t = performance.now() / 1000;
    this.root.position.y += Math.sin(t * 1.5) * 0.015;

    // Animacja chmur usypiających
    for (let i = this._sleepClouds.length - 1; i >= 0; i--) {
      const c = this._sleepClouds[i];
      c.life -= 1 / 60;
      c.mesh.position.x += c.vx / 60;
      c.mesh.position.y += c.vy / 60;
      c.mesh.position.z += c.vz / 60;
      c.vy *= 0.96;
      c.vx *= 0.97;
      c.vz *= 0.97;
      c.mesh.scale.setScalar(1 + (2.8 - c.life) * 0.5);
      c.mesh.material.opacity = Math.max(0, c.life / 3.5) * 0.72;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        c.mesh.geometry.dispose();
        this._sleepClouds.splice(i, 1);
      }
    }

    // Animacja chmur smrodu
    for (let i = this._fartClouds.length - 1; i >= 0; i--) {
      const c = this._fartClouds[i];
      c.life -= 1 / 60;
      c.mesh.position.x += c.vx / 60;
      c.mesh.position.y += c.vy / 60;
      c.mesh.position.z += c.vz / 60;
      c.vy *= 0.97;
      c.mesh.scale.setScalar(1 + (1.8 - c.life) * 0.4);
      c.mesh.material.opacity = Math.max(0, c.life / 2.6) * 0.75;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        c.mesh.geometry.dispose();
        this._fartClouds.splice(i, 1);
      }
    }
  }
}

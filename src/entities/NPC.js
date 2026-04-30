/**
 * NPC — słodziutki przechodzeń spacerujący po mieście.
 * Brak fizyki Rapier (tylko wizualne — dla wydajności).
 * Wędrowny AI: idzie do losowego punktu w promieniu spawnR, potem staje i czeka.
 */
import * as THREE from 'three';
import { toonMat, toonGrad } from '../core/Materials.js';

// Paleta żywych kolorów w stylu Wobbly Life
const PALETTES = [
  { body: 0xFF6B6B, dark: 0xCC3333 },  // czerwony
  { body: 0xFF9F1C, dark: 0xCC6600 },  // pomarańczowy
  { body: 0xFFD93D, dark: 0xC8A800 },  // żółty
  { body: 0x6BCB77, dark: 0x3A8C45 },  // zielony
  { body: 0x4D96FF, dark: 0x1A5ECC },  // niebieski
  { body: 0xFF6BCD, dark: 0xCC3399 },  // różowy
  { body: 0xC77DFF, dark: 0x8833CC },  // fioletowy
  { body: 0x00C9B1, dark: 0x007A6A },  // turkusowy
];

const NPC_RADIUS = 0.55;
const AVOID_MARGIN = 0.55;
const LOOKAHEAD_BASE = 1.2;
const LOOKAHEAD_SPEED = 0.9;

export class NPC {
  /**
   * @param {THREE.Scene} scene
   * @param {number} x, z   punkt startowy
   * @param {number} wanderR  promień wędrówki [j.ś.]
   */
  constructor(scene, x, z, wanderR = 14, obstacles = []) {
    this.root   = new THREE.Group();
    this._scene = scene;
    this._obstacles = obstacles;

    const pal = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    this._pal = pal;

    // Stan AI
    this._spawnX  = x;
    this._spawnZ  = z;
    this._wanderR = wanderR;
    this._facing  = Math.random() * Math.PI * 2;
    this._speed   = 1.2 + Math.random() * 0.9;
    this._target  = new THREE.Vector3(x, 0, z);
    this._waiting = true;
    this._waitT   = Math.random() * 2;   // losowe opóźnienie startowe

    // Animacja
    this._walkPhase = Math.random() * Math.PI * 2;
    this._bobY      = 0;

    this._scareTimer = 0;
    this._screamCooldown = 0;
    this._abduction = null;
    this._abductedGone = false;
    this._baseSpeed  = this._speed;
    this._sleepTimer = 0;
    this._sleepFall  = 0;   // 0=stoi, 1=leży na boku

    this._build(pal);
    this.root.scale.setScalar(1.55);   // wzrost zbliżony do gracza
    this.root.position.set(x, 0, z);
    this.root.rotation.y = this._facing;
    scene.add(this.root);
  }

  /** Czerwony dym z gęby gracza — NPC pada na bok i śpi. */
  sleep() {
    const alreadySleeping = this._sleepTimer > 0;
    this._sleepTimer = 6.0 + Math.random() * 4;
    if (!alreadySleeping) {
      this._sleepFall = 0;
      this._waiting   = true;
      this._speed     = 0;
    }
  }

  /** Wywołaj gdy gracz pierdzenie w pobliżu — NPC ucieka w panice. */
  scare(px, pz, audio = null) {
    if (this._abduction || this._abductedGone) return;
    this._scareTimer = 5.0 + Math.random() * 3;
    this._speed = this._baseSpeed * 5.5;
    if (this._screamCooldown <= 0) {
      audio?.playNPCScream();
      this._screamCooldown = 0.9 + Math.random() * 0.5;
    }
    const awayAngle = Math.atan2(this.root.position.x - px, this.root.position.z - pz);
    this._target.set(
      this.root.position.x + Math.sin(awayAngle) * 28,
      0,
      this.root.position.z + Math.cos(awayAngle) * 28,
    );
    this._waiting = false;
  }

  canBeAbducted() {
    return !this._abduction && !this._abductedGone && !this._dead && this.root.visible;
  }

  /** Zabija NPC — pada, zapada się w ziemię i znika. */
  kill() {
    if (this._dead || this._abductedGone) return;
    this._dead       = true;
    this._dyingTimer = 0;
    this._speed      = 0;
    this._waiting    = true;
    this._sleepTimer = 0;
    this._sleepFall  = 0;
    this._scareTimer = 0;
  }

  startAbduction(ufo) {
    if (!this.canBeAbducted()) return false;
    this._abduction = { ufo };
    this._speed = 0;
    this._waiting = true;
    this._sleepTimer = 0;
    this._sleepFall = 0;
    this._scareTimer = 0;
    return true;
  }

  finishAbduction() {
    this._abduction = null;
    this._abductedGone = true;
    this.root.visible = false;
  }

  _build(pal) {
    const bMat  = toonMat(pal.body);
    const dMat  = toonMat(pal.dark);
    const wMat  = new THREE.MeshToonMaterial({ color: 0xFFFFFF, gradientMap: toonGrad });
    const eyMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

    // ── Głowa ────────────────────────────────────────────────────────────────
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.20, 10, 8), bMat);
    head.position.y = 0.80;
    head.castShadow = true;
    this.root.add(head);

    // Oczy
    [-1, 1].forEach(s => {
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.062, 6, 6), wMat);
      white.position.set(s * 0.10, 0.83, 0.16);
      this.root.add(white);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.034, 5, 5), eyMat);
      pupil.position.set(s * 0.10, 0.83, 0.20);
      this.root.add(pupil);
    });

    // Uśmiech (mały łuk z kulek)
    [-0.06, 0, 0.06].forEach((sx, i) => {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.018, 4, 4), eyMat);
      d.position.set(sx, 0.70 - Math.abs(sx) * 0.5, 0.19);
      this.root.add(d);
    });

    // ── Tułów ─────────────────────────────────────────────────────────────────
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.24, 4, 8), bMat);
    body.position.y = 0.44;
    body.castShadow = true;
    this.root.add(body);

    // ── Nogi ─────────────────────────────────────────────────────────────────
    this._lLeg = this._limb(0.075, 0.18, dMat);
    this._lLeg.position.set(-0.10, 0.13, 0);
    this.root.add(this._lLeg);

    this._rLeg = this._limb(0.075, 0.18, dMat);
    this._rLeg.position.set(0.10, 0.13, 0);
    this.root.add(this._rLeg);

    // ── Ramiona ───────────────────────────────────────────────────────────────
    this._lArm = this._limb(0.058, 0.15, bMat);
    this._lArm.position.set(-0.22, 0.52, 0);
    this._lArm.rotation.z =  0.25;
    this.root.add(this._lArm);

    this._rArm = this._limb(0.058, 0.15, bMat);
    this._rArm.position.set(0.22, 0.52, 0);
    this._rArm.rotation.z = -0.25;
    this.root.add(this._rArm);
  }

  _limb(r, h, mat) {
    return new THREE.Mesh(new THREE.CapsuleGeometry(r, h, 3, 6), mat);
  }

  _pickTarget() {
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist  = 2 + Math.random() * this._wanderR;
      const tx = this._spawnX + Math.sin(angle) * dist;
      const tz = this._spawnZ + Math.cos(angle) * dist;
      if (!this._isInsideObstacle(tx, tz, NPC_RADIUS + 0.2)) {
        this._target.set(tx, 0, tz);
        return;
      }
    }
    this._target.set(this._spawnX, 0, this._spawnZ);
  }

  _isInsideObstacle(x, z, pad = 0) {
    for (const o of this._obstacles) {
      const dx = x - o.cx;
      const dz = z - o.cz;
      const rr = o.r + pad;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }

  _computeAvoidance(x, z, dirX, dirZ, stepDist) {
    const lookahead = LOOKAHEAD_BASE + stepDist * LOOKAHEAD_SPEED;
    let avoidX = 0;
    let avoidZ = 0;
    let blocked = false;

    for (const o of this._obstacles) {
      const ox = x - o.cx;
      const oz = z - o.cz;
      const rr = o.r + NPC_RADIUS + AVOID_MARGIN;
      const dist = Math.hypot(ox, oz);
      if (dist > rr + lookahead) continue;

      const centerAhead = ox * dirX + oz * dirZ;
      if (centerAhead > rr + lookahead) continue;

      const lateralX = ox - dirX * centerAhead;
      const lateralZ = oz - dirZ * centerAhead;
      const lateralDist = Math.hypot(lateralX, lateralZ);
      if (lateralDist > rr) continue;

      const weight = Math.max(0, 1 - Math.max(0, centerAhead) / (rr + lookahead));
      const pushX = lateralDist > 0.001 ? lateralX / lateralDist : -dirZ;
      const pushZ = lateralDist > 0.001 ? lateralZ / lateralDist : dirX;
      avoidX += pushX * weight;
      avoidZ += pushZ * weight;

      if (centerAhead > -0.15 && centerAhead < stepDist + rr * 0.85) blocked = true;
    }

    return { avoidX, avoidZ, blocked };
  }

  update(dt) {
    if (this._abductedGone) return;

    // ── Śmierć — pada i zapada się ───────────────────────────────────────────
    if (this._dead) {
      this._dyingTimer = (this._dyingTimer ?? 0) + dt;
      const fallT = Math.min(1, this._dyingTimer / 0.35);
      const p     = fallT * fallT * (3 - 2 * fallT);
      this.root.rotation.z = p * (Math.PI / 2);
      this.root.position.y = p * 0.45;
      // Po 1.5 s — zapada się w ziemię i znika
      if (this._dyingTimer > 1.5) {
        this.root.position.y = 0.45 - (this._dyingTimer - 1.5) * 0.7;
        if (this._dyingTimer > 3.2) this.root.visible = false;
      }
      return;
    }

    this._screamCooldown = Math.max(0, this._screamCooldown - dt);

    if (this._abduction?.ufo) {
      const carry = this._abduction.ufo.getCarryPose?.();
      if (carry) {
        this.root.visible = true;
        this.root.position.x += (carry.x - this.root.position.x) * Math.min(1, dt * 4.5);
        this.root.position.y += (carry.y - this.root.position.y) * Math.min(1, dt * 3.8);
        this.root.position.z += (carry.z - this.root.position.z) * Math.min(1, dt * 4.5);
        this._facing += (carry.facing - this._facing) * Math.min(1, dt * 5);
        this.root.rotation.y = this._facing;
      }
      return;
    }

    // ── Sen + wstawanie ────────────────────────────────────────────────────────
    if (this._sleepTimer > 0 || this._sleepFall > 0) {
      if (this._sleepTimer > 0) {
        this._sleepTimer -= dt;
        this._sleepFall = Math.min(1, this._sleepFall + dt / 0.35);
        if (this._sleepTimer <= 0) {
          this._sleepFall = 0;   // natychmiastowe wstanie
          this._speed     = this._baseSpeed;
          this._waiting   = true;
          this._waitT     = 0.5;
        }
      }
      if (this._sleepFall > 0) {
        const p = this._sleepFall * this._sleepFall * (3 - 2 * this._sleepFall);
        this.root.rotation.z = p * (Math.PI / 2);   // pada na bok
        this.root.position.y = p * 0.45;            // wystarczy żeby nie wpadał pod ziemię
        return;
      }
    }
    this.root.rotation.z = 0;
    this.root.position.y = 0;

    if (this._scareTimer > 0) {
      this._scareTimer -= dt;
      if (this._scareTimer <= 0) this._speed = this._baseSpeed;
    }

    if (this._waiting) {
      this._waitT -= dt;
      // Idle bob
      const t = performance.now() / 1000;
      this.root.position.y = Math.sin(t * 2.0) * 0.010;
      if (this._waitT <= 0) { this._waiting = false; this._pickTarget(); }
      return;
    }

    const dx   = this._target.x - this.root.position.x;
    const dz   = this._target.z - this.root.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.5) {
      this._waiting = true;
      this._waitT   = 0.8 + Math.random() * 2.5;
      return;
    }

    const spd = Math.min(dist / 0.5, 1) * this._speed;
    const stepDist = spd * dt;
    let dirX = dx / dist;
    let dirZ = dz / dist;

    const { avoidX, avoidZ, blocked } = this._computeAvoidance(
      this.root.position.x, this.root.position.z, dirX, dirZ, stepDist,
    );
    if (avoidX !== 0 || avoidZ !== 0) {
      dirX += avoidX * 1.35;
      dirZ += avoidZ * 1.35;
      const len = Math.hypot(dirX, dirZ) || 1;
      dirX /= len;
      dirZ /= len;
    }

    const nextX = this.root.position.x + dirX * stepDist;
    const nextZ = this.root.position.z + dirZ * stepDist;
    if (this._isInsideObstacle(nextX, nextZ, NPC_RADIUS)) {
      if (blocked) {
        this._waiting = true;
        this._waitT = 0.18 + Math.random() * 0.28;
        this._pickTarget();
        return;
      }
    }

    // Obrót ku kierunkowi ruchu
    const tAngle = Math.atan2(dirX, dirZ);
    let diff = tAngle - this._facing;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this._facing += diff * Math.min(1, dt * 3.5);
    this.root.rotation.y = this._facing;

    // Ruch
    this.root.position.x = nextX;
    this.root.position.z = nextZ;

    // Bob pionowy podczas chodu
    this._walkPhase += spd * dt * 5;
    this.root.position.y = Math.abs(Math.sin(this._walkPhase)) * 0.04;

    // Animacja kończyn
    const swing = Math.sin(this._walkPhase) * 0.60;
    this._lLeg.rotation.x =  swing;
    this._rLeg.rotation.x = -swing;
    this._lArm.rotation.x = -swing * 0.45;
    this._rArm.rotation.x =  swing * 0.45;
  }

  dispose() {
    this._scene.remove(this.root);
  }
}

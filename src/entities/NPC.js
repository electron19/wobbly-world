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

export class NPC {
  /**
   * @param {THREE.Scene} scene
   * @param {number} x, z   punkt startowy
   * @param {number} wanderR  promień wędrówki [j.ś.]
   */
  constructor(scene, x, z, wanderR = 14) {
    this.root   = new THREE.Group();
    this._scene = scene;

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
    this._sleepTimer = 6.0 + Math.random() * 4;
    this._sleepFall  = 0;
    this._waiting    = true;
    this._speed      = 0;
  }

  /** Wywołaj gdy gracz pierdzenie w pobliżu — NPC ucieka w panice. */
  scare(px, pz) {
    this._scareTimer = 5.0 + Math.random() * 3;
    this._speed = this._baseSpeed * 5.5;
    const awayAngle = Math.atan2(this.root.position.x - px, this.root.position.z - pz);
    this._target.set(
      this.root.position.x + Math.sin(awayAngle) * 28,
      0,
      this.root.position.z + Math.cos(awayAngle) * 28,
    );
    this._waiting = false;
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
    const angle = Math.random() * Math.PI * 2;
    const dist  = 2 + Math.random() * this._wanderR;
    this._target.set(
      this._spawnX + Math.sin(angle) * dist,
      0,
      this._spawnZ + Math.cos(angle) * dist,
    );
  }

  update(dt) {
    // ── Sen + wstawanie ────────────────────────────────────────────────────────
    if (this._sleepTimer > 0 || this._sleepFall > 0.001) {
      if (this._sleepTimer > 0) {
        this._sleepTimer -= dt;
        this._sleepFall = Math.min(1, this._sleepFall + dt / 0.35);
        if (this._sleepTimer <= 0) {
          this._speed   = this._baseSpeed;
          this._waiting = true;
          this._waitT   = 0.8;   // chwila dezorientacji po przebudzeniu
        }
      } else {
        // Wstaje — _sleepFall wraca do 0
        this._sleepFall = Math.max(0, this._sleepFall - dt / 0.40);
      }
      // Smoothstep — płynna krzywa
      const p = this._sleepFall * this._sleepFall * (3 - 2 * this._sleepFall);
      this.root.rotation.z = p * (Math.PI / 2);   // pada na bok
      this.root.position.y = p * 0.22;            // uniesiony nieznacznie żeby nie był pod ziemią
      return;
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

    // Obrót ku celowi
    const tAngle = Math.atan2(dx, dz);
    let diff = tAngle - this._facing;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this._facing += diff * Math.min(1, dt * 3.5);
    this.root.rotation.y = this._facing;

    // Ruch
    const spd = Math.min(dist / 0.5, 1) * this._speed;
    this.root.position.x += Math.sin(this._facing) * spd * dt;
    this.root.position.z += Math.cos(this._facing) * spd * dt;

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

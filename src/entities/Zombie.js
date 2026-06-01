/**
 * Zombie — nocny potwór wychodzący z ziemi i idący w stronę gracza.
 * Wygląda jak NPC ale zielonkawy, z wyciągniętymi ramionami, chodzi powoli.
 * Beknięcie gracza usypia zombie (jak NPC).
 */
import * as THREE from 'three';
import { toonMat, toonGrad } from '../core/Materials.js';

const C_SKIN   = 0x7DBE6A;   // zielonkawa skóra zombie
const C_DARK   = 0x3D6B30;   // ciemna zieleń (włosy, detale)
const C_SHIRT  = 0x8B7355;   // podarta koszula (brązowo-szara)
const C_PANTS  = 0x4A4035;   // spodnie ciemne
const C_BLOOD  = 0x8B0000;   // ciemna krew (plamy)

export class Zombie {
  /**
   * @param {THREE.Scene} scene
   * @param {number} x, z  pozycja spawnu
   */
  constructor(scene, x, z) {
    this.root   = new THREE.Group();
    this._scene = scene;

    this._facing   = Math.random() * Math.PI * 2;
    this._speed    = 0.55 + Math.random() * 0.25;  // bardzo powolny chód (0.55-0.8 j.ś./s)
    this._walkPhase = Math.random() * Math.PI * 2;

    this._dead      = false;
    this._dyingTimer = 0;
    this._sleepTimer = 0;
    this._sleepFall  = 0;

    // Zombie wschodzi z ziemi na początku
    this._rising     = true;
    this._riseTimer  = 0;
    this._riseDuration = 1.8;  // sekundy wychodzenia z ziemi

    this._build();
    this.root.scale.setScalar(1.55);
    this.root.position.set(x, -2.0, z);  // zaczyna pod ziemią
    scene.add(this.root);
  }

  _build() {
    const sMat  = toonMat(C_SKIN);
    const dMat  = toonMat(C_DARK);
    const shMat = toonMat(C_SHIRT);
    const pMat  = toonMat(C_PANTS);
    const bMat  = toonMat(C_BLOOD);
    const wMat  = new THREE.MeshToonMaterial({ color: 0xCCFFCC, gradientMap: toonGrad });
    const eyMat = new THREE.MeshBasicMaterial({ color: 0xFF2200 });  // czerwone oczy

    // ── Głowa ────────────────────────────────────────────────────────────────
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.20, 10, 8), sMat);
    head.position.y = 0.80;
    head.castShadow = true;
    this.root.add(head);

    // Oczy — czerwone jak krew
    [-1, 1].forEach(s => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.072, 6, 6), eyMat);
      eye.position.set(s * 0.10, 0.83, 0.18);
      this.root.add(eye);
    });

    // Usta — szeroko otwarte (groźna mina)
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x220000 });
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.01), mouthMat);
    mouth.position.set(0, 0.68, 0.20);
    this.root.add(mouth);

    // Zęby
    [-1, 0, 1].forEach(s => {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.04, 0.01), new THREE.MeshBasicMaterial({ color: 0xEEEECC }));
      tooth.position.set(s * 0.038, 0.695, 0.205);
      this.root.add(tooth);
    });

    // ── Tułów (podarta koszula) ────────────────────────────────────────────
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.24, 4, 8), shMat);
    body.position.y = 0.44;
    body.castShadow = true;
    this.root.add(body);

    // Plama krwi na koszuli
    const bloodStain = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 5), bMat);
    bloodStain.position.set(0.05, 0.50, 0.17);
    bloodStain.scale.z = 0.3;
    this.root.add(bloodStain);

    // ── Nogi ─────────────────────────────────────────────────────────────────
    this._lLeg = this._limb(0.075, 0.18, pMat);
    this._lLeg.position.set(-0.10, 0.13, 0);
    this.root.add(this._lLeg);

    this._rLeg = this._limb(0.075, 0.18, pMat);
    this._rLeg.position.set(0.10, 0.13, 0);
    this.root.add(this._rLeg);

    // ── Ramiona — wyciągnięte do przodu (zombie-pose) ──────────────────────
    this._lArm = this._limb(0.058, 0.15, sMat);
    this._lArm.position.set(-0.22, 0.52, 0);
    this._lArm.rotation.x = -1.1;   // wyciągnięte do przodu
    this._lArm.rotation.z =  0.10;
    this.root.add(this._lArm);

    this._rArm = this._limb(0.058, 0.15, sMat);
    this._rArm.position.set(0.22, 0.52, 0);
    this._rArm.rotation.x = -1.1;
    this._rArm.rotation.z = -0.10;
    this.root.add(this._rArm);
  }

  _limb(r, h, mat) {
    return new THREE.Mesh(new THREE.CapsuleGeometry(r, h, 3, 6), mat);
  }

  /** Beknięcie gracza — zombie pada i śpi */
  sleep() {
    if (this._dead || this._rising) return;
    this._sleepTimer = 7.0 + Math.random() * 5;
    this._sleepFall  = 0;
  }

  /** Zabij zombie */
  kill() {
    if (this._dead) return;
    this._dead = true;
    this._dyingTimer = 0;
  }

  /**
   * @param {number} dt
   * @param {{ root: { position: THREE.Vector3 } }} player
   */
  update(dt, player) {
    if (!this.root.visible) return;

    // ── Śmierć ───────────────────────────────────────────────────────────────
    if (this._dead) {
      this._dyingTimer += dt;
      const fallT = Math.min(1, this._dyingTimer / 0.35);
      const p = fallT * fallT * (3 - 2 * fallT);
      this.root.rotation.z = p * (Math.PI / 2);
      this.root.position.y = p * 0.45;
      if (this._dyingTimer > 1.5) {
        this.root.position.y = 0.45 - (this._dyingTimer - 1.5) * 0.6;
        if (this._dyingTimer > 3.5) this.root.visible = false;
      }
      return;
    }

    // ── Wschodzenie z ziemi ───────────────────────────────────────────────────
    if (this._rising) {
      this._riseTimer += dt;
      const t = Math.min(1, this._riseTimer / this._riseDuration);
      const p = t * t * (3 - 2 * t);  // smoothstep
      this.root.position.y = -2.0 + p * 2.0;  // -2 → 0
      if (t >= 1) {
        this._rising = false;
        this.root.position.y = 0;
      }
      // Lekkie kołysanie ramion podczas wschodzenia
      const swing = Math.sin(this._riseTimer * 2) * 0.1;
      this._lArm.rotation.z =  0.10 + swing;
      this._rArm.rotation.z = -0.10 - swing;
      return;
    }

    // ── Sen ───────────────────────────────────────────────────────────────────
    if (this._sleepTimer > 0) {
      this._sleepTimer -= dt;
      this._sleepFall = Math.min(1, this._sleepFall + dt / 0.35);
      const p = this._sleepFall * this._sleepFall * (3 - 2 * this._sleepFall);
      this.root.rotation.z = p * (Math.PI / 2);
      this.root.position.y = p * 0.45;
      if (this._sleepTimer <= 0) {
        this._sleepFall = 0;
        this.root.rotation.z = 0;
        this.root.position.y = 0;
      }
      return;
    }
    this.root.rotation.z = 0;

    // ── Chód w stronę gracza ──────────────────────────────────────────────────
    const pp = player.root.position;
    const mp = this.root.position;
    const dx = pp.x - mp.x;
    const dz = pp.z - mp.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.8) return;  // tuż przy graczu — stój

    const dirX = dx / dist;
    const dirZ = dz / dist;
    const step = this._speed * dt;

    this.root.position.x += dirX * step;
    this.root.position.z += dirZ * step;

    // Obrót ku graczowi
    const tAngle = Math.atan2(dirX, dirZ);
    let diff = tAngle - this._facing;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this._facing += diff * Math.min(1, dt * 2.5);  // wolniejszy obrót niż NPC
    this.root.rotation.y = this._facing;

    // Animacja chodu zombie — powolna, sztywna
    this._walkPhase += this._speed * dt * 4;
    this.root.position.y = Math.abs(Math.sin(this._walkPhase)) * 0.025;

    const swing = Math.sin(this._walkPhase) * 0.35;  // małe wahadło nóg
    this._lLeg.rotation.x =  swing;
    this._rLeg.rotation.x = -swing;
    // Ramiona zombie lekko kołyszą się (ale zostają wyciągnięte)
    this._lArm.rotation.x = -1.1 + Math.sin(this._walkPhase) * 0.1;
    this._rArm.rotation.x = -1.1 - Math.sin(this._walkPhase) * 0.1;
  }

  dispose() {
    this._scene.remove(this.root);
    this.root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}

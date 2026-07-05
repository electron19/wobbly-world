/**
 * Cute animals — Dog and Cat — wandering around the city.
 * Visual-only (no Rapier physics), same wander AI as NPC.
 */
import * as THREE from 'three';
import { toonMat } from '../core/Materials.js';

// Dog colour palettes
const DOG_PALETTES = [
  { body: 0xF5DEB3, dark: 0xC8A878 }, // golden/wheat
  { body: 0x8B4513, dark: 0x5C2D0A }, // brown
  { body: 0x555555, dark: 0x222222 }, // grey
  { body: 0xFFFFFF, dark: 0xDDDDDD }, // white
  { body: 0xE8C07A, dark: 0xB8903A }, // tan
  { body: 0x1A1A1A, dark: 0x000000 }, // black
];

// Cat colour palettes
const CAT_PALETTES = [
  { body: 0xFF8040, dark: 0xCC5020, stripe: 0xCC6030 }, // orange tabby
  { body: 0xEEEEEE, dark: 0xBBBBBB, stripe: 0x888888 }, // silver tabby
  { body: 0x1A1A1A, dark: 0x000000, stripe: 0x111111 }, // black
  { body: 0xD4A878, dark: 0xA07840, stripe: 0xB08850 }, // ginger/cream
  { body: 0xDDAA88, dark: 0xAA7766, stripe: 0x886655 }, // calico-ish
];

// ─────────────────────────────────────────────────────────────────────────────
// Shared wander AI mixin — same logic as NPC
// ─────────────────────────────────────────────────────────────────────────────
function initWander(entity, x, z, wanderR, speed) {
  entity._spawnX   = x;
  entity._spawnZ   = z;
  entity._wanderR  = wanderR;
  entity._facing   = Math.random() * Math.PI * 2;
  entity._speed    = speed;
  entity._target   = new THREE.Vector3(x, 0, z);
  entity._waiting  = true;
  entity._waitT    = Math.random() * 3;
  entity._walkPhase = Math.random() * Math.PI * 2;
}

function pickTarget(entity) {
  const angle = Math.random() * Math.PI * 2;
  const dist  = 1 + Math.random() * entity._wanderR;
  entity._target.set(
    entity._spawnX + Math.sin(angle) * dist,
    0,
    entity._spawnZ + Math.cos(angle) * dist,
  );
}

function canBeAbducted(entity) {
  return !entity._abduction && !entity._abductedGone && entity.root.visible;
}

function startAbduction(entity, ufo) {
  if (!canBeAbducted(entity)) return false;
  entity._abduction = { ufo };
  entity._speed = 0;
  entity._waiting = true;
  entity._sleepTimer = 0;
  entity._sleepFall = 0;
  entity._scareTimer = 0;
  return true;
}

function finishAbduction(entity) {
  entity._abduction = null;
  entity._abductedGone = true;
  entity.root.visible = false;
}

function updateAbduction(entity, dt) {
  if (entity._abductedGone) return true;
  if (!entity._abduction?.ufo) return false;
  const carry = entity._abduction.ufo.getCarryPose?.();
  if (!carry) return false;
  entity.root.visible = true;
  entity.root.position.x += (carry.x - entity.root.position.x) * Math.min(1, dt * 4.5);
  entity.root.position.y += (carry.y - entity.root.position.y) * Math.min(1, dt * 3.8);
  entity.root.position.z += (carry.z - entity.root.position.z) * Math.min(1, dt * 4.5);
  entity._facing += (carry.facing - entity._facing) * Math.min(1, dt * 5);
  entity.root.rotation.y = entity._facing;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dog
// ─────────────────────────────────────────────────────────────────────────────
export class Dog {
  constructor(scene, x, z, wanderR = 10) {
    this.root   = new THREE.Group();
    this._scene = scene;

    const pal = DOG_PALETTES[Math.floor(Math.random() * DOG_PALETTES.length)];
    initWander(this, x, z, wanderR, 0.8 + Math.random() * 0.7);

    this._scareTimer = 0;
    this._sleepTimer = 0;
    this._sleepFall  = 0;
    this._abduction  = null;
    this._abductedGone = false;
    this._baseSpeed  = this._speed;

    this._build(pal);
    this.root.scale.setScalar(1.35);
    this.root.position.set(x, 0, z);
    this.root.rotation.y = this._facing;
    scene.add(this.root);
  }

  sleep() {
    const alreadySleeping = this._sleepTimer > 0;
    this._sleepTimer = 5.0 + Math.random() * 3;
    if (!alreadySleeping) {
      this._sleepFall = 0;
      this._waiting   = true;
      this._speed     = 0;
    }
  }

  scare(px, pz) {
    if (this._abduction || this._abductedGone) return;
    this._scareTimer = 6 + Math.random() * 4;
    this._speed = this._baseSpeed * 6.0;
    const awayAngle = Math.atan2(this.root.position.x - px, this.root.position.z - pz);
    this._target.set(
      this.root.position.x + Math.sin(awayAngle) * 22,
      0,
      this.root.position.z + Math.cos(awayAngle) * 22,
    );
    this._waiting = false;
  }

  canBeAbducted() { return canBeAbducted(this); }
  startAbduction(ufo) { return startAbduction(this, ufo); }
  finishAbduction() { finishAbduction(this); }

  _build(pal) {
    const bMat  = toonMat(pal.body);
    const dMat  = toonMat(pal.dark);
    const eyMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const noseMat = new THREE.MeshBasicMaterial({ color: 0x1A1A1A });

    // Body — horizontal capsule (rotated)
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.26, 3, 6), bMat);
    body.rotation.z = Math.PI / 2;
    body.position.set(0, 0.18, 0);
    body.castShadow = true;
    this.root.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 8, 7), bMat);
    head.position.set(0, 0.26, 0.28);
    head.castShadow = true;
    this.root.add(head);

    // Snout / muzzle
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), bMat);
    snout.scale.z = 1.3;
    snout.position.set(0, 0.23, 0.41);
    this.root.add(snout);

    // Nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.028, 5, 4), noseMat);
    nose.position.set(0, 0.245, 0.49);
    this.root.add(nose);

    // Eyes
    [-1, 1].forEach(s => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 5, 4), eyMat);
      eye.position.set(s * 0.07, 0.30, 0.40);
      this.root.add(eye);
    });

    // Ears — floppy
    [-1, 1].forEach(s => {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.10, 2, 4), dMat);
      ear.position.set(s * 0.11, 0.35, 0.18);
      ear.rotation.z = s * 0.5;
      ear.rotation.x = 0.3;
      this.root.add(ear);
    });

    // Tail — small curled nub
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.055, 5, 4), bMat);
    tail.position.set(0, 0.26, -0.28);
    this.root.add(tail);
    this._tailMesh = tail;

    // Legs — 4 short stubs
    const legPositions = [
      [-0.11, 0, 0.16], [0.11, 0, 0.16],
      [-0.11, 0, -0.16], [0.11, 0, -0.16],
    ];
    this._legs = [];
    for (const [lx, , lz] of legPositions) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.10, 2, 4), dMat);
      leg.position.set(lx, 0.06, lz);
      this.root.add(leg);
      this._legs.push(leg);
    }
  }

  update(dt) {
    if (updateAbduction(this, dt)) return;

    // ── Sen + wstawanie (przewraca się łapkami do góry) ──────────────────────
    if (this._sleepTimer > 0 || this._sleepFall > 0) {
      if (this._sleepTimer > 0) {
        this._sleepTimer -= dt;
        this._sleepFall = Math.min(1, this._sleepFall + dt / 0.30);
        if (this._sleepTimer <= 0) {
          this._sleepFall = 0;   // natychmiastowe wstanie
          this._speed     = this._baseSpeed;
          this._waiting   = true;
          this._waitT     = 0.8;
        }
      }
      if (this._sleepFall > 0) {
        const p = this._sleepFall * this._sleepFall * (3 - 2 * this._sleepFall);
        this.root.rotation.z = p * Math.PI;   // przewraca się do góry nogami
        this.root.position.y = p * 0.44;      // pies: body top (0.18+0.14)*1.35
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
      const t = performance.now() / 1000;
      this.root.position.y = Math.sin(t * 1.5) * 0.006;
      // tail wag while waiting
      if (this._tailMesh) this._tailMesh.rotation.y = Math.sin(t * 6) * 0.5;
      if (this._waitT <= 0) { this._waiting = false; pickTarget(this); }
      return;
    }

    const dx   = this._target.x - this.root.position.x;
    const dz   = this._target.z - this.root.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.4) {
      this._waiting = true;
      this._waitT   = 1.2 + Math.random() * 3.5;
      return;
    }

    const tAngle = Math.atan2(dx, dz);
    let diff = tAngle - this._facing;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this._facing += diff * Math.min(1, dt * 4);
    this.root.rotation.y = this._facing;

    const spd = Math.min(dist / 0.4, 1) * this._speed;
    this.root.position.x += Math.sin(this._facing) * spd * dt;
    this.root.position.z += Math.cos(this._facing) * spd * dt;

    this._walkPhase += spd * dt * 7;
    this.root.position.y = Math.abs(Math.sin(this._walkPhase)) * 0.03;

    // Leg animation — front/back pairs alternate
    const swing = Math.sin(this._walkPhase) * 0.45;
    if (this._legs[0]) this._legs[0].rotation.x =  swing;
    if (this._legs[1]) this._legs[1].rotation.x = -swing;
    if (this._legs[2]) this._legs[2].rotation.x = -swing;
    if (this._legs[3]) this._legs[3].rotation.x =  swing;

    // tail wag
    if (this._tailMesh) {
      this._tailMesh.rotation.y = Math.sin(this._walkPhase * 2) * 0.35;
    }
  }

  dispose() { this._scene.remove(this.root); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cat
// ─────────────────────────────────────────────────────────────────────────────
export class Cat {
  constructor(scene, x, z, wanderR = 8) {
    this.root   = new THREE.Group();
    this._scene = scene;

    const pal = CAT_PALETTES[Math.floor(Math.random() * CAT_PALETTES.length)];
    initWander(this, x, z, wanderR, 0.6 + Math.random() * 0.8);
    this._restT      = 0;
    this._scareTimer = 0;
    this._sleepTimer = 0;
    this._sleepFall  = 0;
    this._abduction  = null;
    this._abductedGone = false;
    this._baseSpeed  = this._speed;

    this._build(pal);
    this.root.scale.setScalar(1.25);
    this.root.position.set(x, 0, z);
    this.root.rotation.y = this._facing;
    scene.add(this.root);
  }

  sleep() {
    const alreadySleeping = this._sleepTimer > 0;
    this._sleepTimer = 5.0 + Math.random() * 3;
    if (!alreadySleeping) {
      this._sleepFall = 0;
      this._waiting   = true;
      this._speed     = 0;
    }
  }

  scare(px, pz) {
    if (this._abduction || this._abductedGone) return;
    this._scareTimer = 7 + Math.random() * 5;
    this._speed = this._baseSpeed * 7.0;
    const awayAngle = Math.atan2(this.root.position.x - px, this.root.position.z - pz);
    this._target.set(
      this.root.position.x + Math.sin(awayAngle) * 20,
      0,
      this.root.position.z + Math.cos(awayAngle) * 20,
    );
    this._waiting = false;
  }

  canBeAbducted() { return canBeAbducted(this); }
  startAbduction(ufo) { return startAbduction(this, ufo); }
  finishAbduction() { finishAbduction(this); }

  _build(pal) {
    const bMat  = toonMat(pal.body);
    const dMat  = toonMat(pal.dark);
    const eyMat = new THREE.MeshBasicMaterial({ color: 0x22CC44 }); // green eyes
    const noseMat = new THREE.MeshBasicMaterial({ color: 0xFF9999 }); // pink nose

    // Body — slightly rounder capsule
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.22, 3, 6), bMat);
    body.rotation.z = Math.PI / 2;
    body.position.set(0, 0.16, 0);
    body.castShadow = true;
    this.root.add(body);

    // Head — rounder than dog
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 8, 7), bMat);
    head.position.set(0, 0.25, 0.24);
    head.castShadow = true;
    this.root.add(head);

    // Pointy ears
    [-1, 1].forEach(s => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.09, 4), bMat);
      ear.position.set(s * 0.09, 0.345, 0.20);
      ear.rotation.z = s * 0.25;
      this.root.add(ear);
      // Inner ear
      const innerEar = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 4), toonMat(0xFFCCCC));
      innerEar.position.set(s * 0.09, 0.345, 0.21);
      innerEar.rotation.z = s * 0.25;
      this.root.add(innerEar);
    });

    // Eyes — big and green
    [-1, 1].forEach(s => {
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.030, 5, 5), new THREE.MeshBasicMaterial({ color: 0xFFFFFF }));
      white.position.set(s * 0.065, 0.28, 0.355);
      this.root.add(white);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 5), eyMat);
      eye.position.set(s * 0.065, 0.28, 0.375);
      this.root.add(eye);
    });

    // Nose — tiny pink triangle (sphere approx)
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.018, 4, 3), noseMat);
    nose.position.set(0, 0.258, 0.385);
    this.root.add(nose);

    // Tail — long curved (3 segments)
    this._tailGroup = new THREE.Group();
    this._tailGroup.position.set(0, 0.16, -0.22);
    this.root.add(this._tailGroup);

    const seg1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.030, 0.14, 2, 4), bMat);
    seg1.position.set(0, 0.07, 0);
    seg1.rotation.x = -0.4;
    this._tailGroup.add(seg1);

    this._tailTip = new THREE.Group();
    this._tailTip.position.set(0, 0.18, -0.06);
    this._tailGroup.add(this._tailTip);
    const seg2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.10, 2, 4), dMat);
    seg2.position.set(0, 0.05, 0);
    this._tailTip.add(seg2);

    // Legs
    const legPositions = [
      [-0.09, 0, 0.12], [0.09, 0, 0.12],
      [-0.09, 0, -0.12], [0.09, 0, -0.12],
    ];
    this._legs = [];
    for (const [lx, , lz] of legPositions) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.09, 2, 4), dMat);
      leg.position.set(lx, 0.05, lz);
      this.root.add(leg);
      this._legs.push(leg);
    }
  }

  update(dt) {
    if (updateAbduction(this, dt)) return;

    // ── Sen + wstawanie (przewraca się łapkami do góry) ──────────────────────
    if (this._sleepTimer > 0 || this._sleepFall > 0) {
      if (this._sleepTimer > 0) {
        this._sleepTimer -= dt;
        this._sleepFall = Math.min(1, this._sleepFall + dt / 0.30);
        if (this._sleepTimer <= 0) {
          this._sleepFall = 0;   // natychmiastowe wstanie
          this._speed     = this._baseSpeed;
          this._waiting   = true;
          this._waitT     = 0.8;
        }
      }
      if (this._sleepFall > 0) {
        const p = this._sleepFall * this._sleepFall * (3 - 2 * this._sleepFall);
        this.root.rotation.z = p * Math.PI;   // przewraca się do góry nogami
        this.root.position.y = p * 0.37;      // kot: body top (0.16+0.12)*1.25
        return;
      }
    }
    this.root.rotation.z = 0;
    this.root.position.y = 0;

    if (this._scareTimer > 0) {
      this._scareTimer -= dt;
      if (this._scareTimer <= 0) this._speed = this._baseSpeed;
    }

    const t = performance.now() / 1000;

    // Tail sway — always
    if (this._tailGroup) this._tailGroup.rotation.z = Math.sin(t * 1.4) * 0.3;
    if (this._tailTip)   this._tailTip.rotation.z   = Math.sin(t * 2.1) * 0.25;

    if (this._waiting) {
      this._waitT -= dt;
      this.root.position.y = 0;
      if (this._waitT <= 0) { this._waiting = false; pickTarget(this); }
      return;
    }

    const dx   = this._target.x - this.root.position.x;
    const dz   = this._target.z - this.root.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.35) {
      this._waiting = true;
      this._waitT   = 1.5 + Math.random() * 5;   // cats rest longer
      return;
    }

    const tAngle = Math.atan2(dx, dz);
    let diff = tAngle - this._facing;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this._facing += diff * Math.min(1, dt * 3.5);
    this.root.rotation.y = this._facing;

    const spd = Math.min(dist / 0.35, 1) * this._speed;
    this.root.position.x += Math.sin(this._facing) * spd * dt;
    this.root.position.z += Math.cos(this._facing) * spd * dt;

    this._walkPhase += spd * dt * 8;
    this.root.position.y = Math.abs(Math.sin(this._walkPhase)) * 0.025;

    const swing = Math.sin(this._walkPhase) * 0.40;
    if (this._legs[0]) this._legs[0].rotation.x =  swing;
    if (this._legs[1]) this._legs[1].rotation.x = -swing;
    if (this._legs[2]) this._legs[2].rotation.x = -swing;
    if (this._legs[3]) this._legs[3].rotation.x =  swing;
  }

  dispose() { this._scene.remove(this.root); }
}

/**
 * Soldier — żołnierz pilnujący lotniska.
 * Wygląd: mundur moro (oliwkowy), hełm, karabin.
 * AI: patrol po obwodzie lotniska → gdy wykryje gracza w strefie → goni i strzela.
 * Trafiony gracz: zostawia czerwone plamy krwi na ziemi.
 */
import * as THREE from 'three';
import { toonMat, toonGrad } from '../core/Materials.js';

// Kolory munduru moro
const C_UNIFORM  = 0x4A5C2A;   // ciemna oliwka (mundur)
const C_DARK     = 0x2E3A18;   // bardzo ciemna zieleń (buty, pas, ciemne elementy)
const C_HELMET   = 0x3B4A1F;   // hełm — ciemniejszy niż mundur
const C_SKIN     = 0xC8956A;   // kolor skóry
const C_GUN      = 0x222222;   // karabin — prawie czarny

// Strefa lotniska (Airport cx=290, cz=0, perimeter ~x:250..330, z:-150..+150)
const AIRPORT_MIN_X = 248;
const AIRPORT_MAX_X = 332;
const AIRPORT_MIN_Z = -152;
const AIRPORT_MAX_Z =  152;

// Punkty patrolu — obwód lotniska (8 punktów)
const PATROL_POINTS = [
  [258, -140], [290, -140], [322, -140],
  [322,    0],
  [322,  140], [290,  140], [258,  140],
  [258,    0],
];

export class Soldier {
  /**
   * @param {THREE.Scene} scene
   * @param {number} x, z   pozycja startowa
   * @param {number} patrolIndex  indeks punktu startowego w PATROL_POINTS
   */
  constructor(scene, x, z, patrolIndex = 0) {
    this.root   = new THREE.Group();
    this._scene = scene;

    this._facing    = 0;
    this._speed     = 1.5;
    this._chaseSpeed = 4.5;
    this._patrolIdx = patrolIndex;
    this._target    = new THREE.Vector3(x, 0, z);
    this._waiting   = false;
    this._waitT     = 0;

    // AI state: 'patrol' | 'alert' | 'chase' | 'shoot'
    this._state     = 'patrol';
    this._shootCooldown = 0;
    this._alertTimer    = 0;

    // Animacja
    this._walkPhase = Math.random() * Math.PI * 2;

    this._dead = false;
    this._dyingTimer = 0;

    this._build();
    this.root.scale.setScalar(1.55);
    this.root.position.set(x, 0, z);
    scene.add(this.root);
    this._pickNextPatrolPoint();
  }

  _build() {
    const uMat  = toonMat(C_UNIFORM);
    const dMat  = toonMat(C_DARK);
    const hMat  = toonMat(C_HELMET);
    const sMat  = toonMat(C_SKIN);
    const gMat  = toonMat(C_GUN);
    const wMat  = new THREE.MeshToonMaterial({ color: 0xFFFFFF, gradientMap: toonGrad });
    const eyMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

    // ── Głowa ────────────────────────────────────────────────────────────────
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.20, 10, 8), sMat);
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

    // Mina — zaciśnięte usta (brak uśmiechu, wojskowa powaga)
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x553322 });
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.018, 0.01), mouthMat);
    mouth.position.set(0, 0.70, 0.20);
    this.root.add(mouth);

    // ── Hełm ─────────────────────────────────────────────────────────────────
    // Spodnia część hełmu (hemisfera)
    const helmetBase = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
      hMat,
    );
    helmetBase.position.y = 0.83;
    helmetBase.castShadow = true;
    this.root.add(helmetBase);

    // Daszek hełmu (flat box z przodu)
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.12), hMat);
    brim.position.set(0, 0.78, 0.20);
    this.root.add(brim);

    // ── Tułów (mundur moro) ──────────────────────────────────────────────────
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.24, 4, 8), uMat);
    body.position.y = 0.44;
    body.castShadow = true;
    this.root.add(body);

    // Pas taktyczny
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.06, 10), dMat);
    belt.position.y = 0.30;
    this.root.add(belt);

    // ── Nogi ─────────────────────────────────────────────────────────────────
    this._lLeg = this._limb(0.075, 0.18, uMat);
    this._lLeg.position.set(-0.10, 0.13, 0);
    this.root.add(this._lLeg);

    this._rLeg = this._limb(0.075, 0.18, uMat);
    this._rLeg.position.set(0.10, 0.13, 0);
    this.root.add(this._rLeg);

    // Buty
    [-1, 1].forEach(s => {
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.18), dMat);
      boot.position.set(s * 0.10, 0.02, 0.03);
      this.root.add(boot);
    });

    // ── Ramiona ───────────────────────────────────────────────────────────────
    this._lArm = this._limb(0.058, 0.15, uMat);
    this._lArm.position.set(-0.22, 0.52, 0);
    this._lArm.rotation.z =  0.25;
    this.root.add(this._lArm);

    this._rArm = this._limb(0.058, 0.15, uMat);
    this._rArm.position.set(0.22, 0.52, 0);
    this._rArm.rotation.z = -0.25;
    this.root.add(this._rArm);

    // ── Karabin (trzymany prawą ręką, lekko przed tułowiem) ──────────────────
    const gunGroup = new THREE.Group();
    gunGroup.position.set(0.28, 0.48, 0.12);
    gunGroup.rotation.x = 0.15;  // lekko opuszczony do przodu

    // Kolba
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.22), gMat);
    stock.position.z = -0.12;
    gunGroup.add(stock);

    // Komora
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.18), gMat);
    receiver.position.z = 0.06;
    gunGroup.add(receiver);

    // Lufa
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.36, 6), gMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.32;
    gunGroup.add(barrel);

    // Magazynek
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.055), dMat);
    mag.position.set(0, -0.07, 0.02);
    mag.rotation.x = 0.15;
    gunGroup.add(mag);

    this.root.add(gunGroup);
    this._gunGroup = gunGroup;
  }

  _limb(r, h, mat) {
    return new THREE.Mesh(new THREE.CapsuleGeometry(r, h, 3, 6), mat);
  }

  _pickNextPatrolPoint() {
    this._patrolIdx = (this._patrolIdx + 1) % PATROL_POINTS.length;
    const [px, pz] = PATROL_POINTS[this._patrolIdx];
    this._target.set(px, 0, pz);
  }

  /** Czy gracz jest w strefie lotniska? */
  static isInAirportZone(px, pz) {
    return px > AIRPORT_MIN_X && px < AIRPORT_MAX_X
        && pz > AIRPORT_MIN_Z && pz < AIRPORT_MAX_Z;
  }

  /** Odległość do gracza */
  _distToPlayer(player) {
    const pp = player.root.position;
    const mp = this.root.position;
    return Math.hypot(pp.x - mp.x, pp.z - mp.z);
  }

  /** Zabij żołnierza */
  kill() {
    if (this._dead) return;
    this._dead = true;
    this._dyingTimer = 0;
  }

  /** Beknięcie gracza — żołnierz pada losowo (czas + kierunek). */
  sleep() {
    if (this._dead) return;
    this._sleepTimer = 4.0 + Math.random() * 8;
    this._sleepFall  = 0;
    this._sleepFallAngle = Math.random() * Math.PI * 2;
    this._sleepFallRate  = 0.20 + Math.random() * 0.70;
    this._state      = 'patrol';
    this._waiting    = true;
  }

  /**
   * Aktualizacja logiki żołnierza.
   * @param {number} dt
   * @param {object} player  instancja Player (player.root.position)
   * @param {Function} onShootPlayer  callback(soldierPos) — trafiony gracz dostaje obrażenia
   */
  update(dt, player, zombies, onShootPlayer, npcs = null) {
    if (!this.root.visible) return;

    // ── Śmierć ───────────────────────────────────────────────────────────────
    if (this._dead) {
      this._dyingTimer += dt;
      const fallT = Math.min(1, this._dyingTimer / 0.35);
      const p = fallT * fallT * (3 - 2 * fallT);
      this.root.rotation.z = p * (Math.PI / 2);
      this.root.position.y = p * 0.45;
      if (this._dyingTimer > 1.5) {
        this.root.position.y = 0.45 - (this._dyingTimer - 1.5) * 0.7;
        if (this._dyingTimer > 3.2) this.root.visible = false;
      }
      return;
    }

    // ── Sen (gaz usypiający — upadek losowy w czasie i kierunku) ──────────────
    if (this._sleepTimer > 0) {
      this._sleepTimer -= dt;
      const rate = this._sleepFallRate ?? 0.35;
      this._sleepFall = Math.min(1, (this._sleepFall ?? 0) + dt / rate);
      const p = this._sleepFall * this._sleepFall * (3 - 2 * this._sleepFall);
      const a = this._sleepFallAngle ?? 0;
      this.root.rotation.z = p * Math.sin(a) * (Math.PI / 2);
      this.root.rotation.x = p * Math.cos(a) * (Math.PI / 2);
      this.root.position.y = p * 0.45;
      if (this._sleepTimer <= 0) {
        this._sleepFall  = 0;
        this._sleepTimer = 0;
        this.root.rotation.z = 0;
        this.root.rotation.x = 0;
        this.root.position.y = 0;
        this._waiting = true;
      }
      return;
    }

    const pp = player.root.position;
    const mp = this.root.position;
    const distToPlayer = Math.hypot(pp.x - mp.x, pp.z - mp.z);
    const playerInZone = Soldier.isInAirportZone(pp.x, pp.z);
    // Gracz wysoko nad ziemią (latanie / w samolocie) — żołnierze go nie widzą.
    const FLY_IMMUNE_Y = 5.0;
    const playerFlying = pp.y > FLY_IMMUNE_Y;
    const playerEngageable = playerInZone && !playerFlying && !(this._scaredTimer > 0);

    // Najbliższy aktywny zombie w zasięgu — priorytet PRZED graczem
    const HUNT_RANGE = 90;
    const SHOOT_ZOMBIE_RANGE = 22;
    let zombieTarget = null;
    let zombieDist = Infinity;
    if (zombies) {
      for (const z of zombies) {
        if (z._dead || !z.root.visible) continue;
        const zp = z.root.position;
        const d  = Math.hypot(zp.x - mp.x, zp.z - mp.z);
        if (d < HUNT_RANGE && d < zombieDist) {
          zombieDist = d;
          zombieTarget = z;
        }
      }
    }

    // Najbliższy NPC na terenie lotniska — wojsko zabija intruzów
    let npcTarget = null;
    let npcDist = Infinity;
    if (npcs && !(this._scaredTimer > 0)) {
      for (const n of npcs) {
        if (n._dead || !n.root || !n.root.visible) continue;
        const np = n.root.position;
        if (!Soldier.isInAirportZone(np.x, np.z)) continue;
        const d = Math.hypot(np.x - mp.x, np.z - mp.z);
        if (d < HUNT_RANGE && d < npcDist) {
          npcDist = d;
          npcTarget = n;
        }
      }
    }

    this._shootCooldown = Math.max(0, this._shootCooldown - dt);
    // Odliczanie strachu po pierdnięciu
    if (this._scaredTimer > 0) this._scaredTimer -= dt;

    // ── Maszyna stanów AI ─────────────────────────────────────────────────────
    // Priorytet celów: zombie > gracz (na lotnisku) > NPC (na lotnisku)
    switch (this._state) {
      case 'patrol':
        if (zombieTarget && !(this._scaredTimer > 0)) {
          this._state = 'huntZombie';
          this._zombieTarget = zombieTarget;
        } else if (playerEngageable) {
          this._state = 'chase';
        } else if (npcTarget) {
          this._state = 'huntNPC';
          this._npcTarget = npcTarget;
        } else {
          this._doPatrol(dt);
        }
        break;

      case 'chase':
        // Zombie pojawił się — porzuca gracza, leci do zombie
        if (zombieTarget && !(this._scaredTimer > 0)) {
          this._state = 'huntZombie';
          this._zombieTarget = zombieTarget;
          break;
        }
        // Gracz uciekł z lotniska, lata wysoko, lub przestraszył żołnierza → patrol
        if (!playerEngageable) {
          this._state = 'patrol';
          this._pickNextPatrolPoint();
          break;
        }
        this._doChase(dt, pp);
        if (distToPlayer < 40) {
          this._doShoot(dt, pp, onShootPlayer);
        }
        break;

      case 'huntZombie': {
        // Strach lub brak żywych zombie → wracaj na patrol (i na lotnisko, gdy poza nim)
        if (!zombieTarget || (this._scaredTimer > 0)) {
          this._state = 'patrol';
          this._pickNextPatrolPoint();
          break;
        }
        const zp = zombieTarget.root.position;
        const zd = Math.hypot(zp.x - mp.x, zp.z - mp.z);
        this._doChase(dt, zp);
        if (zd < SHOOT_ZOMBIE_RANGE) {
          this._doShootZombie(zombieTarget);
        }
        break;
      }

      case 'huntNPC': {
        // Zombie/gracz mają priorytet — przerywaj polowanie na NPC
        if (zombieTarget && !(this._scaredTimer > 0)) {
          this._state = 'huntZombie';
          this._zombieTarget = zombieTarget;
          break;
        }
        if (playerEngageable) {
          this._state = 'chase';
          break;
        }
        const t = this._npcTarget;
        if (!t || t._dead || !t.root || !t.root.visible
            || !Soldier.isInAirportZone(t.root.position.x, t.root.position.z)) {
          this._state = 'patrol';
          this._pickNextPatrolPoint();
          break;
        }
        const np = t.root.position;
        const nd = Math.hypot(np.x - mp.x, np.z - mp.z);
        this._doChase(dt, np);
        if (nd < SHOOT_ZOMBIE_RANGE) {
          this._doShootNPC(t);
        }
        break;
      }
    }

    // ── Animacja karabinu (lekkie kołysanie) ─────────────────────────────────
    if (this._gunGroup) {
      const t = performance.now() / 1000;
      this._gunGroup.rotation.z = Math.sin(t * 1.8) * 0.04;
    }
  }

  _doPatrol(dt) {
    const mp = this.root.position;
    const dx = this._target.x - mp.x;
    const dz = this._target.z - mp.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 2.0) {
      this._pickNextPatrolPoint();
      return;
    }

    this._move(dt, dx / dist, dz / dist, this._speed);
  }

  _doChase(dt, pp) {
    const mp = this.root.position;
    const dx = pp.x - mp.x;
    const dz = pp.z - mp.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.0) return;  // za blisko — stój i strzelaj

    this._move(dt, dx / dist, dz / dist, this._chaseSpeed);
  }

  _doShootZombie(zombie) {
    if (this._shootCooldown > 0) return;
    this._shootCooldown = 0.9 + Math.random() * 0.6;
    zombie.kill?.();
    this._flashTimer = 0.08;
  }

  _doShootNPC(npc) {
    if (this._shootCooldown > 0) return;
    this._shootCooldown = 1.0 + Math.random() * 0.7;
    npc.kill?.();
    this._flashTimer = 0.08;
  }

  _doShoot(dt, pp, onShootPlayer) {
    if (this._shootCooldown > 0) return;
    this._shootCooldown = 1.2 + Math.random() * 0.8;  // strzał co ~1.2-2.0s

    // Wywołaj callback — gracz dostaje obrażenia i krew na ziemi
    if (onShootPlayer) {
      onShootPlayer({ x: this.root.position.x, z: this.root.position.z });
    }

    // Muzzle flash — krótki błysk przy lufie karabinu
    this._flashTimer = 0.08;
  }

  _move(dt, dirX, dirZ, speed) {
    const stepDist = speed * dt;
    const nextX = this.root.position.x + dirX * stepDist;
    const nextZ = this.root.position.z + dirZ * stepDist;

    this.root.position.x = nextX;
    this.root.position.z = nextZ;

    // Obrót ku kierunkowi ruchu
    const tAngle = Math.atan2(dirX, dirZ);
    let diff = tAngle - this._facing;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this._facing += diff * Math.min(1, dt * 6);
    this.root.rotation.y = this._facing;

    // Bob pionowy + animacja nóg
    this._walkPhase += speed * dt * 5;
    this.root.position.y = Math.abs(Math.sin(this._walkPhase)) * 0.04;

    const swing = Math.sin(this._walkPhase) * 0.55;
    this._lLeg.rotation.x =  swing;
    this._rLeg.rotation.x = -swing;
    this._lArm.rotation.x = -swing * 0.35;
    this._rArm.rotation.x =  swing * 0.35;
  }

  dispose() {
    this._scene.remove(this.root);
  }
}

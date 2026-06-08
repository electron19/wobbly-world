import * as THREE from 'three';
import { toonMat, addOutline } from '../core/Materials.js';

/**
 * Airport — military airfield complex.
 *
 * Layout (centre x=290, z=0):
 *   Runway        : 260×14 along Z  (x=290, z=-130..+130) — chronione, nic na nim nie stoi
 *   Taxiway       : parallel x=274, z=-110..+110, width 8
 *   Apron         : x=260..278, z=-80..+80
 *   Control tower : NW corner — x=258, z=-125 (na skraju lotniska, widok na cały pas)
 *   Hangar B-29   : centre x=258, z=78 — body 30×14×24 (clear of runway 283..297)
 *   Fighter hangar: centre x=260, z=-70 — body 22×8×14 (clear of runway)
 *   Perimeter fence, runway lights, wind sock
 */
export class Airport {
  constructor(scene, cx = 290, cz = 0) {
    this._scene = scene;
    this._cx    = cx;
    this._cz    = cz;
    this._build();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _box(x, y, z, w, h, d, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    this._scene.add(m);
    return m;
  }

  _wbox(lx, ly, lz, w, h, d, mat) {
    return this._box(this._cx + lx, ly, this._cz + lz, w, h, d, mat);
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  _build() {
    this._addRunway();
    this._addTaxiway();
    this._addApron();
    this._addControlTower();
    this._addHangarB29();
    this._addHangarFighter();
    this._addFence();
    this._addRunwayLights();
    this._addWindSock();
  }

  _addRunway() {
    const rwMat  = toonMat(0xA0A0A0);
    // Main runway surface
    const rw = new THREE.Mesh(new THREE.BoxGeometry(14, 0.08, 260), rwMat);
    rw.position.set(this._cx, 0.04, this._cz);
    rw.receiveShadow = true;
    this._scene.add(rw);

    // Centre dashed line (white boxes every 15 units)
    const dashMat = toonMat(0xFFFFFF);
    for (let i = -6; i <= 6; i++) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 6), dashMat);
      dash.position.set(this._cx, 0.09, this._cz + i * 18);
      this._scene.add(dash);
    }

    // Threshold stripes — each end (z=-130 and z=+130)
    const threshMat = toonMat(0xFFFFFF);
    for (let side of [-1, 1]) {
      const baseZ = this._cz + side * 118;
      for (let s = -3; s <= 3; s++) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 7), threshMat);
        stripe.position.set(this._cx + s * 2.0, 0.09, baseZ);
        this._scene.add(stripe);
      }
    }
  }

  _addTaxiway() {
    const twMat = toonMat(0x888888);
    const tw = new THREE.Mesh(new THREE.BoxGeometry(8, 0.08, 220), twMat);
    tw.position.set(this._cx - 16, 0.04, this._cz);
    tw.receiveShadow = true;
    this._scene.add(tw);

    // Yellow centre line on taxiway
    const ylMat = toonMat(0xDDAA00);
    const yl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 218), ylMat);
    yl.position.set(this._cx - 16, 0.05, this._cz);
    this._scene.add(yl);
  }

  _addApron() {
    // Apron: x=260..278 → localX = -30..-12, width=18, centre localX=-21
    const apMat = toonMat(0x707070);
    const ap = new THREE.Mesh(new THREE.BoxGeometry(18, 0.08, 160), apMat);
    ap.position.set(this._cx - 21, 0.04, this._cz);
    ap.receiveShadow = true;
    this._scene.add(ap);

    // Parking lines on apron
    const lineMat = toonMat(0xFFFFFF);
    for (let i = -3; i <= 3; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(17, 0.09, 0.2), lineMat);
      line.position.set(this._cx - 21, 0.05, this._cz + i * 22);
      this._scene.add(line);
    }
  }

  _addControlTower() {
    const concMat = toonMat(0x9A9A9A);
    const glassMat = new THREE.MeshToonMaterial({ color: 0x99CCEE, transparent: true, opacity: 0.75 });
    const darkMat  = toonMat(0x444444);

    // Na skraju lotniska — SW corner, daleko od pasa i hangarów,
    // dobry widok na cały runway (z=-130..+130)
    const tx = this._cx - 32;    // x=258 (fence west=252)
    const tz = this._cz - 125;   // z=-125 (fence south=-145)

    // Base building 8×8×4
    const base = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 8), concMat);
    base.position.set(tx, 2, tz);
    base.castShadow = true;
    this._scene.add(base);
    addOutline(base, 0.08);

    // Tower shaft 3×3×8
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(3, 8, 3), concMat);
    shaft.position.set(tx, 8, tz);
    shaft.castShadow = true;
    this._scene.add(shaft);
    addOutline(shaft, 0.07);

    // Glass cab 5×3×5
    const cab = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 5), glassMat);
    cab.position.set(tx, 13.5, tz);
    this._scene.add(cab);
    addOutline(cab, 0.06);

    // Roof slab
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.3, 5.5), concMat);
    roof.position.set(tx, 15.2, tz);
    this._scene.add(roof);

    // Antenna masts
    for (const ox of [-1.2, 0, 1.2]) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 4), darkMat);
      ant.position.set(tx + ox, 17, tz);
      this._scene.add(ant);
    }
  }

  _addHangarB29() {
    // Body 30×14×24 (był 54×14×28 — wystawał na pas startowy!).
    // Centre localX=-32 (x=258) → body x=243..273 (czyste, runway zaczyna się na 283).
    const hMat   = toonMat(0x999FAA);
    const dMat   = toonMat(0x4A4A55);
    const roofMat = toonMat(0x777E88);

    const bx = this._cx - 32;
    const bz = this._cz + 78;
    const W = 30, H = 14, D = 24;

    // Main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), hMat);
    body.position.set(bx, H / 2, bz);
    body.castShadow = true;
    this._scene.add(body);
    addOutline(body, 0.1);

    // Pyramidal roof — base radius dobrany tak, by po rotacji π/4 i skalowaniu
    // idealnie pokrywał prostokątną podstawę kadłuba (W × D).
    const R = 16;
    const baseSide = R * Math.SQRT2;          // bok kwadratu pyramidy po Y rot π/4
    const roofGeo = new THREE.CylinderGeometry(0, R, 4, 4, 1);
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.rotation.y = Math.PI / 4;
    roofMesh.scale.set(W / baseSide, 1, D / baseSide);
    roofMesh.position.set(bx, H + 2, bz);
    this._scene.add(roofMesh);

    // 2 doors on +Z face (front face)
    for (const dx of [-7.5, 7.5]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(13, 12, 0.4), dMat);
      door.position.set(bx + dx, 6, bz + D / 2 + 0.2);
      this._scene.add(door);
      addOutline(door, 0.07);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 0.5), toonMat(0xCCCCCC));
      frame.position.set(bx + dx, 12.3, bz + D / 2 + 0.2);
      this._scene.add(frame);
    }

    // Vertical ribbing on front face
    const ribMat = toonMat(0xBBBBCC);
    for (let i = -4; i <= 4; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.4, H + 0.5, 0.2), ribMat);
      rib.position.set(bx + i * 3.5, H / 2, bz + D / 2 + 0.1);
      this._scene.add(rib);
    }
  }

  _addHangarFighter() {
    // Body 22×8×14 (był 28×8×16). Centre localX=-30 (x=260) → body x=249..271,
    // z=-77..-63 — całkowicie poza runwayem.
    const hMat = toonMat(0x888E99);
    const dMat = toonMat(0x3D3D47);

    const bx = this._cx - 30;
    const bz = this._cz - 70;
    const W = 22, H = 8, D = 14;

    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), hMat);
    body.position.set(bx, H / 2, bz);
    body.castShadow = true;
    this._scene.add(body);
    addOutline(body, 0.09);

    // 2 doors on +Z face
    for (const dx of [-5, 5]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(9, 6.5, 0.4), dMat);
      door.position.set(bx + dx, 3.5, bz + D / 2 + 0.2);
      this._scene.add(door);
      addOutline(door, 0.06);
    }

    // Pyramidal roof — base skalowana do W × D
    const R = 12;
    const baseSide = R * Math.SQRT2;
    const roofGeo = new THREE.CylinderGeometry(0, R, 3, 4, 1);
    const roofMesh = new THREE.Mesh(roofGeo, toonMat(0x777777));
    roofMesh.rotation.y = Math.PI / 4;
    roofMesh.scale.set(W / baseSide, 1, D / baseSide);
    roofMesh.position.set(bx, H + 1.5, bz);
    this._scene.add(roofMesh);
  }

  _addFence() {
    // Perimeter: x=252..322 => localX=-38..+32, z=-145..+145
    const postMat = toonMat(0x778899);
    const wireMat = toonMat(0x8899AA);

    const minLX = -38, maxLX = 32;
    const minLZ = -145, maxLZ = 145;

    const segments = [];
    // North side z=-145
    for (let lx = minLX; lx < maxLX; lx += 4) {
      segments.push({ x0: lx, z0: minLZ, x1: lx + 4, z1: minLZ });
    }
    // South side z=+145
    for (let lx = minLX; lx < maxLX; lx += 4) {
      segments.push({ x0: lx, z0: maxLZ, x1: lx + 4, z1: maxLZ });
    }
    // West side x=localX=-38
    for (let lz = minLZ; lz < maxLZ; lz += 4) {
      segments.push({ x0: minLX, z0: lz, x1: minLX, z1: lz + 4 });
    }
    // East side x=localX=+32
    for (let lz = minLZ; lz < maxLZ; lz += 4) {
      segments.push({ x0: maxLX, z0: lz, x1: maxLX, z1: lz + 4 });
    }

    for (const seg of segments) {
      const mx = this._cx + (seg.x0 + seg.x1) / 2;
      const mz = this._cz + (seg.z0 + seg.z1) / 2;
      const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
      const ang = Math.atan2(seg.x1 - seg.x0, seg.z1 - seg.z0);

      // Post at start
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 0.2), postMat);
      post.position.set(this._cx + seg.x0, 1, this._cz + seg.z0);
      this._scene.add(post);

      // Wire rail (horizontal bar)
      const wire = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, len), wireMat);
      wire.position.set(mx, 1.6, mz);
      wire.rotation.y = -ang;
      this._scene.add(wire);

      const wire2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, len), wireMat);
      wire2.position.set(mx, 0.8, mz);
      wire2.rotation.y = -ang;
      this._scene.add(wire2);
    }
  }

  _addRunwayLights() {
    // Along both edges of runway: x=283 (localX=-7) and x=297 (localX=+7)
    for (const lx of [-7, 7]) {
      for (let lz = -120; lz <= 120; lz += 20) {
        const isEnd = lz < -100 || lz > 100;
        const col = isEnd ? 0xFF2200 : 0xFFFFEE;
        const mat = new THREE.MeshBasicMaterial({ color: col });
        // Post
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), toonMat(0x555555));
        post.position.set(this._cx + lx, 0.35, this._cz + lz);
        this._scene.add(post);
        // Light sphere
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), mat);
        light.position.set(this._cx + lx, 0.85, this._cz + lz);
        this._scene.add(light);
      }
    }
  }

  _addWindSock() {
    // Pole at localX=-20, localZ=-100
    const poleMat = toonMat(0xCCCCCC);
    const sockMat = new THREE.MeshToonMaterial({ color: 0xFF6600, transparent: true, opacity: 0.85 });

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4, 6), poleMat);
    pole.position.set(this._cx - 20, 2, this._cz - 100);
    this._scene.add(pole);

    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.8, 8), sockMat);
    sock.rotation.z = Math.PI / 2;
    sock.position.set(this._cx - 19.1, 4, this._cz - 100);
    this._scene.add(sock);
  }
}

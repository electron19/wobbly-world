/**
 * SkySystem — dynamic day/night cycle.
 *
 * Day   = 5 min real time (300 s)
 * Night = 5 min real time (300 s)
 * Cycle = 10 min
 *
 * Manages:
 *  - directional sun light (moves in arc, casts shadows)
 *  - ambient + hemisphere light (dim at night, warm at noon)
 *  - scene background + fog colour
 *  - visible sun disc + glow
 *  - visible moon disc
 *  - star field (Points mesh, fades in at night)
 */

import * as THREE from 'three';

const DAY_S   = 5 * 60;   // 300 s
const NIGHT_S = 5 * 60;   // 300 s
const CYCLE_S = DAY_S + NIGHT_S;  // 600 s

// Start near the beginning of the day so the player first sees morning light.
const START_OFFSET = 60;   // begin 1 min into the day cycle

export class SkySystem {
  constructor(scene) {
    this._scene = scene;

    // Game-time counter within one CYCLE_S period
    this._time = START_OFFSET;

    // ── Sun directional light ───────────────────────────────────────────────
    this._sunLight = new THREE.DirectionalLight(0xFFF5E0, 0);
    this._sunLight.castShadow = true;
    this._sunLight.shadow.mapSize.set(2048, 2048);
    this._sunLight.shadow.camera.near   =   1;
    this._sunLight.shadow.camera.far    = 200;
    this._sunLight.shadow.camera.left   = -70;
    this._sunLight.shadow.camera.right  =  70;
    this._sunLight.shadow.camera.top    =  70;
    this._sunLight.shadow.camera.bottom = -70;
    this._sunLight.shadow.bias          = -0.0005;
    scene.add(this._sunLight);
    scene.add(this._sunLight.target);   // target stays at origin (moved to player in update)

    // ── Moon directional light ──────────────────────────────────────────────
    this._moonLight = new THREE.DirectionalLight(0x4455AA, 0);
    scene.add(this._moonLight);
    scene.add(this._moonLight.target);

    // ── Ambient ─────────────────────────────────────────────────────────────
    this._ambient = new THREE.AmbientLight(0xFFEEDD, 0.65);
    scene.add(this._ambient);

    // ── Hemisphere (sky/ground fill) ────────────────────────────────────────
    this._hemi = new THREE.HemisphereLight(0x87CEEB, 0x5A9E35, 0.3);
    scene.add(this._hemi);

    // ── Sun disc (visible sphere in sky) ────────────────────────────────────
    this._sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(3.5, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xFFFF88, fog: false }),
    );
    scene.add(this._sunMesh);

    // ── Sun corona/glow (larger transparent sphere) ─────────────────────────
    this._sunGlow = new THREE.Mesh(
      new THREE.SphereGeometry(9, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xFFFF44,
        transparent: true,
        opacity: 0.12,
        fog: false,
        depthWrite: false,
      }),
    );
    scene.add(this._sunGlow);

    // ── Moon disc ───────────────────────────────────────────────────────────
    this._moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.8, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xCCCCEE, fog: false }),
    );
    scene.add(this._moonMesh);

    // ── Stars ───────────────────────────────────────────────────────────────
    this._starsMesh = this._buildStars();
    scene.add(this._starsMesh);

    // Internal colour helper (reused each frame)
    this._skyCol = new THREE.Color();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _buildStars() {
    const N = 1000;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      // Random direction on upper hemisphere
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(1 - Math.random() * 0.9);   // 0..~154°
      pos[i * 3]     = Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = Math.abs(Math.cos(phi)) + 0.05;    // force above horizon
      pos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xFFFFFF, size: 2.5, fog: false, transparent: true, opacity: 0,
      sizeAttenuation: false,   // stała wielkość w pikselach — gwiazdy daleko ale widoczne
    });
    const mesh = new THREE.Points(geo, mat);
    mesh.renderOrder = -1;
    return mesh;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Call every frame. playerPos used to follow shadow frustum & sky objects. */
  update(dt, playerPos, seasonSystem) {
    this._time = (this._time + dt) % CYCLE_S;

    const isDay  = this._time < DAY_S;
    const dayT   = isDay  ? this._time / DAY_S               : 0;
    const nightT = !isDay ? (this._time - DAY_S) / NIGHT_S   : 0;

    const px = playerPos ? playerPos.x : 0;
    const pz = playerPos ? playerPos.z : 0;
    const R  = 300;   // sky sphere radius — poza widocznym terenem (medium far=350)
    const Y_FLOOR = 35;   // minimalna wysokość słońca/księżyca — nie zachodzą w ziemię

    if (isDay) {
      // Sun arc: a=0 (sunrise east) → π/2 (noon top) → π (sunset west)
      const a          = dayT * Math.PI;
      const elevation  = Math.sin(a);               // 0 at horizon, 1 at zenith
      const sunDirX    = -Math.cos(a);              // east→0→west
      const sunDirY    = elevation;
      const sunDirZ    = -0.28;                     // slight south bias (northern hemisphere feel)

      const sx = px + sunDirX * R;
      const sy = Math.max(Y_FLOOR, sunDirY * R);   // nigdy poniżej Y_FLOOR (nad horyzontem)
      const sz = pz + sunDirZ * R;

      // Sun light
      this._sunLight.position.set(sx, sy, sz);
      this._sunLight.target.position.set(px, 0, pz);
      this._sunLight.target.updateMatrixWorld();
      const warmT       = Math.max(0, 1 - elevation * 4);   // 1=sunrise/set, 0=midday
      const lr = THREE.MathUtils.lerp(1.00, 0.98, 1 - warmT);
      const lg = THREE.MathUtils.lerp(0.52, 0.97, 1 - warmT);
      const lb = THREE.MathUtils.lerp(0.18, 0.87, 1 - warmT);
      this._sunLight.color.setRGB(lr, lg, lb);
      this._sunLight.intensity = Math.max(0, elevation * 1.4);

      // Sun disc + glow
      this._sunMesh.position.set(sx, sy, sz);
      this._sunMesh.visible = elevation > -0.02;
      this._sunGlow.position.set(sx, sy, sz);
      this._sunGlow.visible = elevation > 0.02;
      this._sunGlow.material.opacity = 0.08 + elevation * 0.14;

      // Moon: hidden
      this._moonMesh.visible = false;
      this._moonLight.intensity = 0;

      // Ambient: warm midday, orange at sunrise/set, dimmer at horizon
      this._ambient.color.setHex(0xFFEEDD);
      this._ambient.intensity = 0.22 + elevation * 0.5;

      // Hemi: sky colour fades between orange-dawn and blue-day
      this._hemi.intensity = 0.12 + elevation * 0.28;

      // Sky colour
      if (elevation < 0.18) {
        const t = elevation / 0.18;
        this._skyCol.setRGB(
          THREE.MathUtils.lerp(1.00, 0.49, t),
          THREE.MathUtils.lerp(0.45, 0.79, t),
          THREE.MathUtils.lerp(0.12, 0.96, t),
        );
      } else {
        const t = (elevation - 0.18) / 0.82;
        this._skyCol.setRGB(
          THREE.MathUtils.lerp(0.49, 0.30, t),
          THREE.MathUtils.lerp(0.79, 0.68, t),
          THREE.MathUtils.lerp(0.96, 0.88, t),
        );
      }
      this._hemi.color.copy(this._skyCol);

      // Stars: fade out at dawn, fully gone during day
      const starOpa = elevation < 0.12 ? Math.max(0, 1 - elevation / 0.12) : 0;
      this._starsMesh.material.opacity = starOpa * 0.85;

    } else {
      // ── Night ────────────────────────────────────────────────────────────
      const a             = nightT * Math.PI;
      const moonElevation = Math.sin(a);
      const moonDirX      = Math.cos(Math.PI - a);   // west→0→east (opposite sun)
      const moonDirY      = moonElevation;

      const mx = px + moonDirX * R;
      const my = Math.max(Y_FLOOR, moonElevation * R * 0.85);
      const mz = pz + 0.28 * R;

      // Moon disc
      this._moonMesh.position.set(mx, my, mz);
      this._moonMesh.visible = moonElevation > 0;

      // Moon light
      this._moonLight.position.set(mx, my, mz);
      this._moonLight.target.position.set(px, 0, pz);
      this._moonLight.intensity = Math.max(0, moonElevation * 0.22);

      // Sun: off
      this._sunLight.intensity = 0;
      this._sunMesh.visible    = false;
      this._sunGlow.visible    = false;

      // Ambient: dim blue-grey
      this._ambient.color.setHex(0x334466);
      this._ambient.intensity = 0.10;
      this._hemi.intensity    = 0.04;

      // Sky: dark blue-black
      this._skyCol.setRGB(0.036, 0.036, 0.082);

      // Stars: fade in at dusk, fade out at dawn
      const fadeIn  = Math.min(1, nightT * NIGHT_S / 90);
      const fadeOut = Math.min(1, (1 - nightT) * NIGHT_S / 90);
      this._starsMesh.material.opacity = Math.min(fadeIn, fadeOut) * 0.88;
    }

    // Season tint overlay (SeasonSystem optional)
    if (seasonSystem) {
      const tint = seasonSystem.skyTint;
      if (tint) {
        this._skyCol.r = THREE.MathUtils.lerp(this._skyCol.r, tint.r, 0.25);
        this._skyCol.g = THREE.MathUtils.lerp(this._skyCol.g, tint.g, 0.25);
        this._skyCol.b = THREE.MathUtils.lerp(this._skyCol.b, tint.b, 0.25);
      }
    }

    // Apply sky to scene background + fog
    this._scene.background.copy(this._skyCol);
    this._scene.fog.color.copy(this._skyCol);

    // Scale fog density: thicker at night / in rain
    const baseDensity = isDay ? 0.0070 : 0.0110;
    this._scene.fog.density = baseDensity;

    // Star field — daleko nad graczem (R=700), bez wpływu fog na renderowanie punktów.
    this._starsMesh.position.set(px, 0, pz);
    this._starsMesh.scale.setScalar(300);
  }

  // Accessors for other systems
  get isDay()      { return this._time < DAY_S; }
  get dayFraction() { return this._time < DAY_S ? this._time / DAY_S : 0; }
  /** 0=midnight, 0.5=noon */
  get normalizedTime() {
    const t = this._time / CYCLE_S;
    return t < (DAY_S / CYCLE_S) ? 0.25 + t * 0.5 / (DAY_S / CYCLE_S) : 0.75 + (t - DAY_S / CYCLE_S) * 0.5 / (NIGHT_S / CYCLE_S);
  }

  dispose() {}
}

/**
 * WeatherSystem — clouds, rain/snow, weather state machine.
 *
 * Weather states: 'clear' | 'overcast' | 'rain'
 * In winter (from SeasonSystem): rain becomes snow (white, slow fall).
 *
 * Settings object (all public, editable at runtime):
 *   changeInterval  [120, 360]  seconds between weather changes
 *   sunnyBias       0.5         probability of clear weather [0..1]
 *   cloudSpeed      1.5         cloud drift speed (units/s)
 *   rainIntensity   1.0         rain density multiplier
 */

import * as THREE from 'three';

// ── Settings ──────────────────────────────────────────────────────────────────
const CLOUD_HEIGHT   = 46;   // world-units above ground
const CLOUD_POOL     = 24;   // total cloud meshes in pool
const RAIN_COUNT     = 600;  // rain/snow particle count
const RAIN_AREA      = 70;   // half-width of rain box around player

// Target visible cloud counts per weather state
const CLOUD_TARGETS = { clear: 3, overcast: 16, rain: 20 };

// Fog density boost when overcast / raining
const FOG_BOOST = { clear: 0, overcast: 0.002, rain: 0.005 };

export class WeatherSystem {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this._scene  = scene;
    this._state  = 'clear';
    this._nextChange = 90 + Math.random() * 120;   // first change in 1.5–3.5 min
    this._clouds = [];
    this._rainPositions = null;
    this._rainMesh      = null;
    this._isSnow        = false;

    // ── Public settings ──────────────────────────────────────────────────────
    this.settings = {
      changeInterval: [120, 360],  // min/max seconds
      sunnyBias:      0.50,
      cloudSpeed:     2.0,
      rainIntensity:  1.0,
    };

    this._buildCloudPool();
    this._buildPrecipitation();
  }

  // ── Cloud pool ───────────────────────────────────────────────────────────────

  _buildCloudPool() {
    for (let i = 0; i < CLOUD_POOL; i++) {
      const cloud = this._makeCloud();
      cloud.visible = false;
      this._clouds.push(cloud);
      this._scene.add(cloud);
    }
  }

  _makeCloud() {
    const group = new THREE.Group();
    const grey  = 0.95 + Math.random() * 0.05;
    const mat   = new THREE.MeshLambertMaterial({
      color: new THREE.Color(grey, grey, grey),
      transparent: true,
      opacity: 0.85,
    });

    const nPuffs = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < nPuffs; i++) {
      const r = 4.5 + Math.random() * 5.5;
      const geo = new THREE.SphereGeometry(r, 7, 5);
      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.position.set(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 10,
      );
      mesh.scale.y = 0.35 + Math.random() * 0.25;
      group.add(mesh);
    }

    // Random initial position spread across the world
    group.position.set(
      (Math.random() - 0.5) * 350,
      CLOUD_HEIGHT + (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 350,
    );
    // Random scale for variety
    const s = 0.8 + Math.random() * 0.9;
    group.scale.set(s, s * 0.55, s);
    return group;
  }

  // ── Precipitation (rain / snow) ──────────────────────────────────────────────

  _buildPrecipitation() {
    const N   = RAIN_COUNT;
    const pos = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * RAIN_AREA * 2;
      pos[i * 3 + 1] = Math.random() * 55;
      pos[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA * 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      color:       0xAABBFF,
      size:        0.20,
      transparent: true,
      opacity:     0,
      fog:         false,
    });

    this._rainMesh      = new THREE.Points(geo, mat);
    this._rainPositions = pos;
    this._scene.add(this._rainMesh);
  }

  // ── Update ────────────────────────────────────────────────────────────────────

  /**
   * @param {number} dt
   * @param {THREE.Vector3} playerPos
   * @param {object|null}   skySystem   — to adjust fog density
   * @param {boolean}       isWinter    — from SeasonSystem
   */
  update(dt, playerPos, skySystem, isWinter = false) {
    this._isSnow = isWinter && (this._state === 'rain');

    // ── Weather state machine ────────────────────────────────────────────────
    this._nextChange -= dt;
    if (this._nextChange <= 0) {
      this._pickState();
      const [lo, hi] = this.settings.changeInterval;
      this._nextChange = lo + Math.random() * (hi - lo);
    }

    // ── Clouds drift ─────────────────────────────────────────────────────────
    const target = CLOUD_TARGETS[this._state] ?? 5;
    const drift  = this.settings.cloudSpeed * dt;

    for (let i = 0; i < CLOUD_POOL; i++) {
      const cloud = this._clouds[i];
      cloud.visible = i < target;
      if (!cloud.visible) continue;

      cloud.position.x += drift;
      // Wrap: when cloud drifts past +200, teleport to -200
      if (cloud.position.x > 220) {
        cloud.position.x = -220;
        cloud.position.z = (Math.random() - 0.5) * 350;
      }

      // Darken when overcast / rain
      const targetGrey = this._state === 'rain' ? 0.55 : this._state === 'overcast' ? 0.75 : 0.95;
      cloud.children.forEach(child => {
        if (!child.material) return;
        const c = child.material.color;
        c.r += (targetGrey - c.r) * 0.05;
        c.g += (targetGrey - c.g) * 0.05;
        c.b += (targetGrey - c.b) * 0.05;
      });
    }

    // ── Rain / Snow ─────────────────────────────────────────────────────────
    const isRaining = this._state === 'rain';
    const targetOpa = isRaining ? 0.55 * this.settings.rainIntensity : 0;
    const mat = this._rainMesh.material;
    mat.opacity += (targetOpa - mat.opacity) * Math.min(1, dt * 1.5);

    if (isRaining) {
      const fallSpeed = this._isSnow ? 4 : 22;   // snow falls slower
      const px = playerPos ? playerPos.x : 0;
      const pz = playerPos ? playerPos.z : 0;
      const pos = this._rainPositions;

      for (let i = 0; i < RAIN_COUNT; i++) {
        pos[i * 3 + 1] -= fallSpeed * dt;
        if (pos[i * 3 + 1] < 0) {
          // respawn above player
          pos[i * 3]     = px + (Math.random() - 0.5) * RAIN_AREA * 2;
          pos[i * 3 + 1] = 50 + Math.random() * 8;
          pos[i * 3 + 2] = pz + (Math.random() - 0.5) * RAIN_AREA * 2;
        }
      }
      this._rainMesh.geometry.attributes.position.needsUpdate = true;

      // Colour: blue-grey rain, white snow
      mat.color.setHex(this._isSnow ? 0xEEEEFF : 0x99AACC);
      mat.size = this._isSnow ? 0.45 : 0.18;
    }

    // ── Fog density boost from weather ────────────────────────────────────────
    if (skySystem) {
      const boost = FOG_BOOST[this._state] ?? 0;
      // Gently blend fog density toward current base + boost
      const target = skySystem._scene.fog.density + boost;
      skySystem._scene.fog.density += (target - skySystem._scene.fog.density) * 0.01;
    }
  }

  // ── State helpers ─────────────────────────────────────────────────────────────

  _pickState() {
    const r = Math.random();
    const s = this.settings.sunnyBias;
    if      (r < s)         this._state = 'clear';
    else if (r < s + 0.30)  this._state = 'overcast';
    else                    this._state = 'rain';
  }

  get state()     { return this._state; }
  get isRaining() { return this._state === 'rain'; }
  get isSnowing() { return this._state === 'rain' && this._isSnow; }

  dispose() {}
}

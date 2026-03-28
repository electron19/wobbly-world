import * as THREE from 'three';
import { WorldObject } from './WorldObject.js';
import { toonMat, C } from '../core/Materials.js';

/**
 * Latarnia uliczna: słup + ramię + głowica.
 *
 * Wytyczne:
 *  - Fizyka statyczna (Rapier + cannon-es) dopóki nie zostanie potrącona.
 *  - Po uderzeniu autem z siłą ≥ 3 m/s: cannon-es static body usuwany,
 *    lampa opada animacyjnie (rotacja wokół podstawy, przyspiesza jak grawitacja).
 *  - Obrót zawsze w kierunku uderzenia (nx, nz = składowe normali kolizji).
 *  - Rapier body zostaje (gracz dalej wchodzi w leżący słup — acceptable).
 *  - update(dt) musi być wołany co klatkę z Game.js.
 */
export class StreetLamp extends WorldObject {
  constructor(scene, physics, vehiclePhysics = null) {
    super(scene, physics, vehiclePhysics);
    this._cannonBody = null;
    this._knocked    = false;
    this._angVelX    = 0;   // prędkość kątowa obrotu (rad/s)
    this._angVelZ    = 0;
  }

  _build() {
    const metalMat = toonMat(C.metal);
    const headMat  = new THREE.MeshBasicMaterial({ color: C.lamp });

    // Słup
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.10, 4.5, 6), metalMat);
    pole.position.y = 2.25;
    this.root.add(pole);

    // Ramię
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.10, 0.10), metalMat);
    arm.position.set(0.6, 4.45, 0);
    this.root.add(arm);

    // Głowica
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.5), headMat);
    head.position.set(1.2, 4.32, 0);
    this.root.add(head);
  }

  placeAt(x, y, z, rotY = 0) {
    super.placeAt(x, y, z);
    this.root.rotation.y = rotY + Math.PI;
    this._build();
    // Rapier: statyczny (gracz wchodzi w słup)
    this._bodies.push(this.physics.addStaticCylinder(x, y + 2.25, z, 2.25, 0.10));
    // cannon-es: statyczny, ale z tagiem – auto może je potrącić
    if (this.vehiclePhysics) {
      this._cannonBody = this.vehiclePhysics.addStaticCylinder(x, y + 2.25, z, 2.25, 0.10, 'metal');
      this._cannonBody._type   = 'lamp';
      this._cannonBody._lampRef = this;
    }
    return this;
  }

  /**
   * Wywołane przez Car.js gdy uderzenie ≥ 3 m/s.
   * @param {number} vel      prędkość uderzenia [m/s]
   * @param {number} nx, nz   normalna kolizji w przestrzeni świata (xz)
   */
  knockDown(vel, nx = 0, nz = 1) {
    if (this._knocked) return;
    this._knocked = true;

    // Usuń cannon-es body — auto nie będzie dalej hamowane przez leżący słup
    if (this._cannonBody && this.vehiclePhysics) {
      this.vehiclePhysics.world.removeBody(this._cannonBody);
      this._cannonBody = null;
    }

    // Prędkość kątowa obrotu zgodna z kierunkiem uderzenia
    const speed = Math.min(vel * 0.06, 1.8);
    this._angVelX =  nz * speed + (Math.random() - 0.5) * 0.2;
    this._angVelZ = -nx * speed + (Math.random() - 0.5) * 0.2;
  }

  /**
   * Animacja opadania — wywołuj z Game.js co klatkę.
   * @param {number} dt  delta time [s]
   */
  update(dt) {
    if (!this._knocked) return;

    const MAX_TILT = Math.PI * 0.490;   // ≈ 88° — leżąca lampa
    const tilt = Math.sqrt(this.root.rotation.x ** 2 + this.root.rotation.z ** 2);

    if (tilt < MAX_TILT) {
      // Grawitacja zwiększa prędkość opadania (sin aproks. kąta nachylenia)
      const gravAccel = 4.5 * Math.sin(Math.max(tilt, 0.08));
      const dominantX = Math.abs(this._angVelX) >= Math.abs(this._angVelZ);
      if (dominantX) {
        this._angVelX += Math.sign(this._angVelX) * gravAccel * dt;
      } else {
        this._angVelZ += Math.sign(this._angVelZ) * gravAccel * dt;
      }
      this.root.rotation.x += this._angVelX * dt;
      this.root.rotation.z += this._angVelZ * dt;
    } else {
      // Uderzyła w ziemię — lekki bounce i zatrzymanie
      this._angVelX *= Math.pow(0.80, dt * 60);
      this._angVelZ *= Math.pow(0.80, dt * 60);
      this.root.rotation.x += this._angVelX * dt;
      this.root.rotation.z += this._angVelZ * dt;
      // Zaklampuj do MAX_TILT
      const len = Math.sqrt(this.root.rotation.x ** 2 + this.root.rotation.z ** 2);
      if (len > MAX_TILT) {
        const s = MAX_TILT / len;
        this.root.rotation.x *= s;
        this.root.rotation.z *= s;
      }
    }
  }
}

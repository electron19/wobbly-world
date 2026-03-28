import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { WorldObject } from './WorldObject.js';
import { toonMat, C } from '../core/Materials.js';

/**
 * Latarnia uliczna: słup + ramię + głowica.
 *
 * Fizyka: cannon-es body zaczyna jako static (auto się o nie odbija).
 * Po uderzeniu ≥ 3 m/s: switch na dynamic z masą — lampa pada z prawdziwą
 * grawitacją i pędem, auto jest lekko odrzucane przez collision response.
 * Mesh synchronizowany per-klatkę z cannon body.
 */
export class StreetLamp extends WorldObject {
  constructor(scene, physics, vehiclePhysics = null) {
    super(scene, physics, vehiclePhysics);
    this._cannonBody = null;
    this._knocked    = false;
    this._baseQuat   = new THREE.Quaternion(); // inicjalny obrót Y (kierunek lampy)
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

    // cannon-es: zaczyna jako static, po uderzeniu switch na dynamic
    if (this.vehiclePhysics) {
      const body = new CANNON.Body({
        mass:           0,             // static na start
        linearDamping:  0.55,
        angularDamping: 0.65,
      });
      body.addShape(new CANNON.Cylinder(0.10, 0.10, 4.5, 8));
      body.position.set(x, y + 2.25, z);

      // Zapamiętaj i przekaż inicjalny obrót Y do cannon body
      this._baseQuat.setFromEuler(new THREE.Euler(0, rotY + Math.PI, 0));
      body.quaternion.set(
        this._baseQuat.x, this._baseQuat.y,
        this._baseQuat.z, this._baseQuat.w,
      );

      body._material = 'metal';
      body._type     = 'lamp';
      body._lampRef  = this;
      this.vehiclePhysics.world.addBody(body);
      this._cannonBody = body;
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

    if (!this._cannonBody || !this.vehiclePhysics) return;

    // Switch static → dynamic: od teraz cannon-es liczy masę, pęd, grawitację
    this._cannonBody.mass = 120;                      // ~120 kg latarnia
    this._cannonBody.type = CANNON.Body.DYNAMIC;
    this._cannonBody.updateMassProperties();
    this._cannonBody.wakeUp();

    // Bezpośrednie ustawienie angular velocity (NIE applyImpulse z komponentem
    // liniowym — to by wysłało lampę do przodu i auto by przez nią przejeżdżało).
    // Lampa obraca się w miejscu; auto zderzając się z ciężkim dynamicznym ciałem
    // dostaje naturalny impuls wsteczny z cannon-es collision response.
    const speed = Math.min(vel * 0.06, 1.5);
    this._cannonBody.angularVelocity.set(
       nz * speed + (Math.random() - 0.5) * 0.2,
      0,
      -nx * speed + (Math.random() - 0.5) * 0.2,
    );
  }

  /**
   * Synchronizuje mesh z cannon-es body — wywołuj z Game.js co klatkę.
   * @param {number} dt  delta time [s]
   */
  update(dt) {
    if (!this._knocked || !this._cannonBody) return;

    const cp = this._cannonBody.position;
    const cq = this._cannonBody.quaternion;

    // Pozycja: cannon body siedzi w centrum cylindra (offset +2.25 od podstawy)
    this.root.position.set(cp.x, cp.y - 2.25, cp.z);

    // Rotacja: cannon quaternion zawiera już inicjalny obrót Y (ustawiony w placeAt)
    this.root.quaternion.set(cq.x, cq.y, cq.z, cq.w);
  }
}

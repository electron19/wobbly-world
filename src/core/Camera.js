import * as THREE from 'three';

/**
 * Kamera third-person z kontrolą yaw/pitch przez mysz.
 * Płynnie podąża za graczem (lerp).
 */
export class ThirdPersonCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw    = 0;
    this.pitch  = 0.35;
    this.dist   = 8;
    this.sensitivity = 0.003;
    this._lookTarget = new THREE.Vector3();
  }

  update(followPos, mouse) {
    this.yaw   -= mouse.dx * this.sensitivity;
    this.pitch  = Math.max(0.06, Math.min(1.3, this.pitch + mouse.dy * this.sensitivity));

    const hz = Math.cos(this.pitch) * this.dist;
    const hy = Math.sin(this.pitch) * this.dist;

    const desired = new THREE.Vector3(
      followPos.x + Math.sin(this.yaw) * hz,
      followPos.y + 1.8 + hy,
      followPos.z + Math.cos(this.yaw) * hz
    );

    this.camera.position.lerp(desired, 0.12);

    this._lookTarget.lerp(
      new THREE.Vector3(followPos.x, followPos.y + 1.0, followPos.z),
      0.15
    );
    this.camera.lookAt(this._lookTarget);
  }

  /** Kierunek "do przodu" gracza względem yaw kamery */
  getForwardDir() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** Kierunek "w prawo" gracza względem yaw kamery */
  getRightDir() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }
}

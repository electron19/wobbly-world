import * as THREE from 'three';

/**
 * Kamera third-person z kontrolą yaw/pitch przez mysz.
 * Płynnie podąża za graczem (lerp).
 *
 * Funkcje:
 *  - auto-wyrównanie za pojazdem/graczem
 *  - przechylenie kamery przy skrętach (body roll mirroring)
 *  - płynny follow bez screen shake
 */
export class ThirdPersonCamera {
  constructor(camera) {
    this.camera      = camera;
    this.yaw         = 0;
    this.pitch       = 0.35;
    this.dist        = 8;
    this.sensitivity = 0.003;
    this.firstPerson = false;   // true = FPP (widok z oczu)
    this._lookTarget = new THREE.Vector3();
    this._tiltZ      = 0;       // wygładzone przechylenie boczne [rad]
    this._trauma     = 0;       // 0–1, wstrząs kamery
  }

  /**
   * Dodaj "uraz" kamery — wywołaj przy zderzeniu pojazdu.
   * @param {number} amount 0–1 (1 = maksymalny wstrząs)
   */
  addTrauma(amount) {
    this._trauma = Math.min(1, this._trauma + amount);
  }

  /**
   * @param {THREE.Vector3} followPos  pozycja celu kamery
   * @param {object}        mouse      { dx, dy, padRightX, padRightY }
   * @param {number}        dt         delta czasu klatki
   * @param {number|undefined} autoAlignFacing  jeśli podany, kamera ustawia się za obiektem
   * @param {number}        steerAngle wygładzony kąt skrętu pojazdu [rad]; >0 = lewo
   * @param {number}        speedFrac  prędkość pojazdu jako ułamek maks (0–1)
   */
  update(followPos, mouse, dt = 0.016, autoAlignFacing, steerAngle = 0, speedFrac = 0) {
    // ── Obrót z myszy / prawego analoga ────────────────────────────────────
    const stickSens = 2.5;
    this.yaw -= mouse.dx * this.sensitivity + (mouse.padRightX || 0) * stickSens * dt;

    // ── Tryb FPP — widok z oczu (budynki) ───────────────────────────────────
    if (this.firstPerson) {
      // pitch: 0 = poziomo, >0 = patrzymy w górę, <0 = w dół
      // mysz w dół (dy > 0) → patrzymy w dół → pitch maleje
      this.pitch = Math.max(-0.8, Math.min(0.8,
        this.pitch - mouse.dy * this.sensitivity - (mouse.padRightY || 0) * stickSens * dt
      ));
      // Pozycja kamery = wysokość oczu gracza
      const eye = new THREE.Vector3(followPos.x, followPos.y + 1.55, followPos.z);
      this.camera.position.lerp(eye, Math.min(1, dt * 30));   // bardzo szybki lerp (≈0.5 przy 60fps)
      // Kierunek patrzenia: yaw + pitch
      const fwd = new THREE.Vector3(
        -Math.sin(this.yaw) * Math.cos(this.pitch),
         Math.sin(this.pitch),
        -Math.cos(this.yaw) * Math.cos(this.pitch),
      );
      this.camera.lookAt(this.camera.position.clone().add(fwd));
      return;
    }

    this.pitch  = Math.max(0.06, Math.min(1.3,
      this.pitch + mouse.dy * this.sensitivity + (mouse.padRightY || 0) * stickSens * dt
    ));

    // ── Auto-wyrównanie kamery (za pojazdem/graczem) ────────────────────────
    const usingManualCamera = Math.abs(mouse.dx) > 0.5 || Math.abs(mouse.padRightX || 0) > 0.1;
    if (autoAlignFacing !== undefined && !usingManualCamera) {
      const targetYaw = autoAlignFacing + Math.PI;
      let diff = targetYaw - this.yaw;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 1.5);
    }

    const speedDistPull = autoAlignFacing !== undefined ? speedFrac * 1.15 : 0;
    const camDist = this.dist + speedDistPull;
    const hz = Math.cos(this.pitch) * camDist;
    const hy = Math.sin(this.pitch) * camDist;

    const desired = new THREE.Vector3(
      followPos.x + Math.sin(this.yaw) * hz,
      followPos.y + 1.8 + hy,
      followPos.z + Math.cos(this.yaw) * hz
    );

    this.camera.position.lerp(desired, 0.16);

    this._lookTarget.lerp(
      new THREE.Vector3(followPos.x, followPos.y + 1.0, followPos.z),
      0.15
    );
    this.camera.lookAt(this._lookTarget);

    // ── Przechylenie kamery przy skręcie (bank wokół osi forward kamery) ───
    // steerAngle > 0 = lewy skręt → kamera przechyla się w prawo (ujemne)
    // Mnożymy quaternion PO lookAt — obrót wokół lokalnej osi Z (forward) kamery
    const targetTiltZ = -steerAngle * speedFrac * 0.055;
    this._tiltZ += (targetTiltZ - this._tiltZ) * (1 - Math.exp(-dt * 6));
    if (Math.abs(this._tiltZ) > 0.001) {
      const tiltQ = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1), this._tiltZ,
      );
      this.camera.quaternion.multiply(tiltQ);
    }

    // ── Wstrząs kamery (trauma) przy zderzeniu ───────────────────────────────
    if (this._trauma > 0.001) {
      const shake = this._trauma * this._trauma; // kwadratowe wygasanie (łagodniejszy start)
      this.camera.position.x += (Math.random() * 2 - 1) * shake * 0.35;
      this.camera.position.y += (Math.random() * 2 - 1) * shake * 0.20;
      this._trauma *= Math.exp(-dt * 8);
    } else {
      this._trauma = 0;
    }

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

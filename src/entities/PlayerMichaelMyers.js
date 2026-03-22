import * as THREE from 'three';
import { Player } from './Player.js';
import { toonMat, addOutline } from '../core/Materials.js';

// ─── Kolory Michael Myers ──────────────────────────────────────────────────
const COV   = 0x1C2340;  // granatowy kombinezon
const MASK  = 0xEEE8D8;  // kremowo-biała maska
const HAIR  = 0x1A1008;  // ciemne włosy
const BOOT  = 0x111111;  // czarne buty
const BLADE = 0xDDDDCC;  // stal noża
const HNDL  = 0x3A2510;  // drewniana rękojeść

/**
 * Michael Myers — nadpisuje wygląd gracza.
 * Fizyka, ruch, sprężyny i animacja kończyn bez zmian.
 */
export class PlayerMichaelMyers extends Player {

  // ─── Body = korpus kombinezonu (spring squish tu działa) ─────────────────
  _buildBody() {
    // Korpus — prostopadłościan kombinezonu
    this.bodyGeo  = new THREE.BoxGeometry(0.82, 0.68, 0.50);
    this.bodyOrig = this.bodyGeo.attributes.position.array.slice();
    this.bodyMesh = new THREE.Mesh(this.bodyGeo, toonMat(COV));
    this.bodyMesh.position.y = 0.55;
    this.bodyMesh.castShadow = true;
    addOutline(this.bodyMesh, 0.06);
    this.root.add(this.bodyMesh);

    // Głowa — biała maska
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.30, 16, 12), toonMat(MASK));
    head.scale.set(1, 1.12, 0.95);
    head.position.y = 1.02;
    head.castShadow = true;
    addOutline(head, 0.05);
    this.root.add(head);

    // Włosy (ciemna kalota z tyłu głowy)
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.48), toonMat(HAIR));
    hair.scale.set(1, 1.1, 0.95);
    hair.position.y = 1.05;
    hair.rotation.x = -0.15;
    this.root.add(hair);

    // Kołnierz kombinezonu
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.22, 0.12, 10), toonMat(COV));
    collar.position.y = 0.91;
    this.root.add(collar);
  }

  // ─── Oczy — ciemne wgłębienia w masce ────────────────────────────────────
  _buildEyes() {
    const eyeMat  = new THREE.MeshBasicMaterial({ color: 0x0D0D0D });
    const eyeMat2 = new THREE.MeshBasicMaterial({ color: 0x000000 });

    [-1, 1].forEach(side => {
      // Owal oka
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), eyeMat);
      eye.scale.set(1.4, 0.9, 0.5);
      eye.position.set(side * 0.115, 1.04, 0.27);
      this.root.add(eye);

      // Głębszy środek
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), eyeMat2);
      pupil.scale.set(1.3, 0.8, 0.5);
      pupil.position.set(side * 0.115, 1.04, 0.30);
      this.root.add(pupil);
    });

    // Nos — mały trójkąt cieniu
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), toonMat(0xC8C2B0));
    nose.scale.set(0.9, 0.6, 0.5);
    nose.position.set(0, 0.985, 0.295);
    this.root.add(nose);
  }

  // ─── Kończyny — kombinezon + but + nóż w prawej ręce ─────────────────────
  _buildLimbs() {
    const covMat  = toonMat(COV);
    const bootMat = toonMat(BOOT);

    this.lArm = this._makeMMArm(-1, covMat, false);
    this.rArm = this._makeMMArm( 1, covMat, true);
    this.lLeg = this._makeMMleg(-1, covMat, bootMat);
    this.rLeg = this._makeMMleg( 1, covMat, bootMat);
  }

  _makeMMArm(side, mat, hasKnife) {
    const g = new THREE.Group();

    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.30, 4, 8), mat);
    arm.castShadow = true;
    g.add(arm);

    // Rękawica (ciemna)
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 6), toonMat(BOOT));
    glove.scale.set(1, 0.85, 1);
    glove.position.y = -0.23;
    g.add(glove);

    if (hasKnife) this._addKnife(g);

    g.position.set(side * 0.52, 0.60, 0);
    g.rotation.z = side * -0.20;
    this.root.add(g);
    return g;
  }

  _makeMMleg(side, legMat, bootMat) {
    const g = new THREE.Group();

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.26, 4, 8), legMat);
    thigh.position.y = -0.12;
    thigh.castShadow = true;
    g.add(thigh);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.30), bootMat);
    boot.position.set(side * 0.01, -0.32, 0.04);
    addOutline(boot, 0.025);
    g.add(boot);

    g.position.set(side * 0.22, 0.18, 0);
    this.root.add(g);
    return g;
  }

  _addKnife(armGroup) {
    const bladeMat = toonMat(BLADE);
    const hndlMat  = toonMat(HNDL);

    // Rękojeść
    const hndl = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.18, 7), hndlMat);
    hndl.position.set(0.04, -0.38, 0.06);
    hndl.rotation.z = 0.35;
    armGroup.add(hndl);

    // Klinga (spłaszczony ostry kształt z BufferGeometry)
    const bladeGeo = new THREE.BufferGeometry();
    const v = new Float32Array([
      // przód klingi (dwa trójkąty)
       0.00,  0.32, 0.00,   // wierzchołek
      -0.015, 0.00, 0.012,  // lewy dół
       0.015, 0.00, 0.012,  // prawy dół

       0.00,  0.32, 0.00,
       0.015, 0.00, 0.012,
      -0.015, 0.00,-0.010,

       0.00,  0.32, 0.00,
      -0.015, 0.00,-0.010,
      -0.015, 0.00, 0.012,

       0.00,  0.32, 0.00,
      -0.015, 0.00,-0.010,
       0.015, 0.00, 0.012,
    ]);
    bladeGeo.setAttribute('position', new THREE.BufferAttribute(v, 3));
    bladeGeo.computeVertexNormals();

    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(0.04, -0.22, 0.06);
    blade.rotation.z = 0.35;
    blade.castShadow = true;
    armGroup.add(blade);
  }
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WorldObject } from './WorldObject.js';
import { addOutline, C } from '../core/Materials.js';

/**
 * Abstrakcyjna baza dla wszystkich budynków.
 *
 * Subklasy implementują _buildGeometry() — tu definiują wygląd.
 * Kolizje są dodawane automatycznie w _buildColliders() lub nadpisane.
 *
 * Cykl tworzenia:
 *   new House(scene, physics, cfg).placeAt(x, y, z)
 *   → placeAt ustawia root.position
 *   → wywołuje _buildGeometry() (local space meshes)
 *   → wywołuje _buildColliders(wx,wy,wz) (world space Rapier)
 *
 * PRZYSZŁOŚĆ: wnętrze budynku jako osobna Zone:
 *   - Drzwi = Rapier sensor collider (isSensor: true)
 *   - Dotknięcie sensora → game.loadZone(new HouseInterior(this))
 *   - Interior definiuje własne ściany, meble, kolizje
 */
export class Building extends WorldObject {
  constructor(scene, physics, cfg = {}, vehiclePhysics = null) {
    super(scene, physics, vehiclePhysics);
    this.cfg = {
      w:         6,
      h:         4,
      d:         8,
      wallColor: C.wall,
      roofColor: C.roof,
      doorColor: C.door,
      winColor:  C.window,
      ...cfg,
    };
    // Wnętrze budynku
    this.hasInterior   = false;  // subklasy ustawiają true jeśli obsługują wejście
    this._roofMesh     = null;   // Group/Mesh dachu — ukrywany gdy gracz jest w środku
    this._interiorGroup = null;  // Group mebli/podłogi — widoczny tylko w środku
    this._solidBody    = null;   // główny solid kolider (wyłączany gdy w środku)
    this._hollowBodies = [];     // ściany z otworem na drzwi (włączane gdy w środku)
  }

  // ─── Pomocniki dla subklas ─────────────────────────────────────────────────

  /**
   * Dodaj box mesh do root (local space).
   * @param {Object} opts  { cast, receive, outline }
   */
  _box(x, y, z, w, h, d, mat, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow    = opts.cast    ?? false;  // statyczne obiekty nie rzucają cieni
    mesh.receiveShadow = opts.receive ?? false;
    if (opts.outline) addOutline(mesh, opts.outline);  // domyślnie wyłączone
    this.root.add(mesh);
    return mesh;
  }

  /**
   * Dach — piramida 4-boczna zbudowana ręcznie jako BufferGeometry.
   *
   * Zalety nad CylinderGeometry:
   *   - narożniki podstawy dokładnie pokrywają narożniki budynku (× 1.1)
   *   - krawędzie podstawy równoległe do ścian budynku (brak skręcenia)
   *   - brak zniekształceń z nierównomiernego skalowania scale.z
   *
   * Wierzchołki:
   *   0: (+hw, 0, +hd) — prawy-przód
   *   1: (-hw, 0, +hd) — lewy-przód
   *   2: (-hw, 0, -hd) — lewy-tył
   *   3: (+hw, 0, -hd) — prawy-tył
   *   4: (0,   h,   0) — wierzchołek
   *
   * @param {number} w  szerokość budynku (oś X)
   * @param {number} d  głębokość budynku (oś Z)
   * @param {number} h  wysokość dachu
   */
  _roof(localX, localY, localZ, w, d, h, mat) {
    const hw = (w * 1.1) / 2;
    const hd = (d * 1.1) / 2;

    const positions = new Float32Array([
       hw, 0,  hd,  // 0
      -hw, 0,  hd,  // 1
      -hw, 0, -hd,  // 2
       hw, 0, -hd,  // 3
        0, h,   0,  // 4 wierzchołek
    ]);

    // Kolejność winding CCW widziana z zewnątrz każdej ściany
    const indices = [
      1, 0, 4,  // przód  (+Z)
      2, 1, 4,  // lewo   (-X)
      3, 2, 4,  // tył    (-Z)
      0, 3, 4,  // prawo  (+X)
    ];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(localX, localY, localZ);
    mesh.castShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  /** Dodaj statyczny box w Rapier. */
  _addPhysicsBox(wx, wy, wz, hw, hh, hd) {
    const body = this.physics.addStaticBox(wx, wy, wz, hw, hh, hd);
    if (this.vehiclePhysics) this.vehiclePhysics.addStaticBox(wx, wy, wz, hw, hh, hd, 'wall');
    this._bodies.push(body);
    return body;
  }

  /** Dodaj rotowany statyczny box (dla ścian obracanych budynków). */
  _addPhysicsBoxRotated(wx, wy, wz, hw, hh, hd, rotY = 0) {
    const body = this.physics.addStaticBoxRotated(wx, wy, wz, hw, hh, hd, rotY);
    this._bodies.push(body);
    return body;
  }

  /**
   * Przelicz lokalne współrzędne budynku na world space.
   * Używa pozycji i rotacji Y tego.root (ustawianej przez facing w _buildGeometry).
   */
  _localToWorld(lx, ly, lz) {
    const f  = this.root.rotation.y;
    const cf = Math.cos(f), sf = Math.sin(f);
    return new THREE.Vector3(
      this.root.position.x + lx * cf + lz * sf,
      this.root.position.y + ly,
      this.root.position.z - lx * sf + lz * cf,
    );
  }

  /**
   * Przełącz widok wnętrza/zewnętrza.
   * Subklasy z hasInterior=true muszą mieć _solidBody i _hollowBodies.
   */
  setInsideView(inside) {
    this._solidBody?.setEnabled(!inside);
    for (const b of this._hollowBodies) b.setEnabled(inside);
    if (this._roofMesh)      this._roofMesh.visible      = !inside;
    if (this._interiorGroup) this._interiorGroup.visible  =  inside;
  }

  // ─── Cykl tworzenia ────────────────────────────────────────────────────────

  /** Subklasy nadpisują: dodają meshy do this.root (BEZ dachu). */
  _buildGeometry() {}

  /** Subklasy nadpisują: tworzą dach PO merge jako osobny mesh/grupę.
   *  Wywoływana po _mergeRoot() — dach NIE jest scalany z resztą geometrii. */
  _buildRoofMesh(wx, wy, wz) {}

  /** Subklasy nadpisują: tworzą wnętrze (podłoga, meble) PO merge.
   *  Domyślnie widoczność = false; setInsideView(true) odkrywa. */
  _buildInterior(wx, wy, wz) {}

  /**
   * Domyślne kolizje: jeden box na cały budynek.
   * Subklasy mogą nadpisać (np. osobne ściany dla wnętrz).
   */
  _buildColliders(wx, wy, wz) {
    const { w, h, d } = this.cfg;
    this._addPhysicsBox(wx, wy + h / 2, wz, w / 2, h / 2, d / 2);
  }

  /**
   * Scal wszystkie meshe w root po materiale → minimalizuje draw calls.
   * Geometrie opakowane (transparent, BackSide outline) zostawiane osobno.
   */
  _mergeRoot() {
    const groups = new Map();  // mat.uuid → { mat, geos[] }
    const keepMeshes = [];

    const visit = (node, parentMat4) => {
      node.updateMatrix();
      const m4 = parentMat4.clone().multiply(node.matrix);
      if (node.isMesh) {
        const mtl = node.material;
        if (mtl.side === THREE.BackSide || mtl.transparent) {
          const g = node.geometry.clone();
          g.applyMatrix4(m4);
          keepMeshes.push(new THREE.Mesh(g, mtl));
          return; // nie schodź głębiej — outline mesh nie ma dzieci geometrycznych
        }
        const g = node.geometry.clone();
        // Ujednolić atrybuty (BufferGeometryUtils wymaga tych samych)
        if (!g.attributes.uv) {
          const cnt = g.attributes.position.count;
          g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cnt * 2), 2));
        }
        if (!g.index) g.toNonIndexed();  // zapewnia zgodność typów
        g.applyMatrix4(m4);
        const key = mtl.uuid;
        if (!groups.has(key)) groups.set(key, { mtl, geos: [] });
        groups.get(key).geos.push(g);
      }
      for (const c of node.children) visit(c, m4);
    };

    const identity = new THREE.Matrix4();
    for (const c of [...this.root.children]) visit(c, identity);

    this.root.clear();

    for (const { mtl, geos } of groups.values()) {
      if (!geos.length) continue;
      try {
        const merged = mergeGeometries(geos, false);
        geos.forEach(g => g.dispose());
        if (merged) {
          const mesh = new THREE.Mesh(merged, mtl);
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          this.root.add(mesh);
        }
      } catch {
        geos.forEach(g => { this.root.add(new THREE.Mesh(g, mtl)); });
      }
    }

    for (const m of keepMeshes) this.root.add(m);
  }

  /** Ustaw pozycję + zbuduj geometrię + scal + dach + wnętrze + kolizje */
  placeAt(x, y, z) {
    super.placeAt(x, y, z);
    this._buildGeometry();         // ściany, okna, drzwi — BEZ dachu
    this._mergeRoot();             // scala ściany/okna w jeden mesh per materiał
    this._buildRoofMesh(x, y, z); // dach dodany PO scalaniu → osobny, można ukryć
    this._buildInterior(x, y, z); // meble/podłoga: początkowo niewidoczne
    this._buildColliders(x, y, z);
    return this;
  }
}

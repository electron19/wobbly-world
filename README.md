# Wobbly World 🏘️

Gra 3D przeglądarkowa inspirowana Wobbly Life — wobbly postać spaceruje po osiedlu.

## Demo

> GitHub Pages: https://electron19.github.io/wobbly-world/

## Stack

| Warstwa | Technologia |
|---|---|
| Rendering | Three.js r165 (CDN + ES importmap) |
| Fizyka | Rapier3D (Rust→WASM, CharacterController) |
| Format modeli | Proceduralna geometria Three.js (przyszłość: GLTF) |
| Build tool | brak — ES modules natywnie w przeglądarce |

## Sterowanie

| Klawisz | Akcja |
|---|---|
| `WASD` / strzałki | Ruch |
| `Spacja` / `Z` | Skok |
| `Mysz` (klik) | Kamera — pointer lock |

## Architektura

```
src/
├── main.js                  ← async bootstrap
├── Game.js                  ← game loop (init, _loop)
├── core/
│   ├── Physics.js           ← Rapier3D wrapper
│   ├── InputManager.js      ← klawiatura + mysz
│   ├── Camera.js            ← kamera third-person
│   └── Materials.js         ← toon shading + paleta
├── entities/
│   ├── Entity.js            ← baza (root + physics body)
│   └── Player.js            ← gracz (spring squish + CharacterController)
├── objects/                 ← BIBLIOTEKA obiektów
│   ├── WorldObject.js       ← baza statycznych obiektów
│   ├── Building.js          ← abstrakcja budynku
│   ├── House.js             ← konkretny dom
│   ├── Tree.js              ← drzewo
│   └── StreetLamp.js        ← latarnia
└── world/
    └── WorldBuilder.js      ← kompozycja sceny
```

### Cykl klatki

```
input.flush()
  → player.update(dt)         // oblicz ruch → nextKinematicTranslation
  → physics.step(dt)          // Rapier rozwiązuje kolizje
  → player.lateUpdate()       // sync visual z physics
  → camera.update()
  → renderer.render()
```

### Dodawanie nowego obiektu

```javascript
// src/objects/Bench.js
import { WorldObject } from './WorldObject.js';
export class Bench extends WorldObject {
  placeAt(x, y, z) {
    super.placeAt(x, y, z);
    // 1. Dodaj meshy do this.root (local space)
    // 2. Dodaj kolizje przez this.physics.addStaticBox(...) (world space)
    return this;
  }
}

// W WorldBuilder.js:
import { Bench } from '../objects/Bench.js';
this._add(new Bench(this.scene, this.physics).placeAt(3, 0, 5));
```

### Wnętrza budynków (roadmap)

Drzwi = Rapier sensor collider → game.transitionTo(new HouseInterior(building))

## Uruchomienie lokalne

Wymaga serwera HTTP (ES modules nie działają na `file://`):

```bash
npx serve .
# lub
python3 -m http.server 8080
```

Następnie otwórz: http://localhost:8080/

## Deploy

```bash
bash deploy.sh "opis zmian" "v0.2.0"
```

Commituje + pushuje → GitHub Pages automatycznie aktualizuje.

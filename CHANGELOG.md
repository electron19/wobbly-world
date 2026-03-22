# Changelog — Wobbly World

## [v0.2.0] — 2026-03-22
### Added
- Przebudowa architektury na ES modules (OOP, plik per klasa)
- Fizyka Rapier3D: CharacterController (brak przechodzenia przez ściany)
- `src/core/Physics.js` — wrapper Rapier3D (static boxes, cylinders, player capsule)
- `src/core/InputManager.js` — klawiatura + pointer lock mouse
- `src/core/Camera.js` — kamera third-person (yaw/pitch, lerp)
- `src/core/Materials.js` — toon shading + paleta kolorów
- `src/entities/Entity.js` — baza dla dynamicznych obiektów
- `src/entities/Player.js` — gracz z kapsuła Rapier + spring squish
- `src/objects/WorldObject.js` — baza dla statycznych obiektów świata
- `src/objects/Building.js` — abstrakcyjna klasa budynku
- `src/objects/House.js` — konkretny dom (ściany + dach + okna + drzwi)
- `src/objects/Tree.js` — drzewo z kolizją na pień
- `src/objects/StreetLamp.js` — latarnia uliczna + PointLight
- `src/world/WorldBuilder.js` — kompozycja sceny (8 domów, 22 drzewa, 8 latarni)
- `assets/models/` — katalog na przyszłe modele GLTF
- `index.html` — nowy entry point z importmap (Three.js r165)
### Changed
- `wobbly-world.html` → archiwum oryginalnej single-file wersji

## [v0.1.0] — 2026-03-22
### Added
- Inicjalna wersja gry — jeden plik `wobbly-world.html`
- Postać WobblyCharacter z animowanym ciałem (spring physics)
- Sterowanie WASD + spacja (skok) + mysz (pointer lock)
- Scena 3D: osiedle z budynkami, drzewami, płotem, ławkami
- Toon shading z gradientem + efekt outline
- Oświetlenie: ambient + directional sun + hemisphere
- Mgła ekspotencjalna (FogExp2)
- Stack: Three.js v0.152 (CDN), vanilla JS, single HTML file

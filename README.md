# Wobbly World

Przeglądarkowa gra 3D w klimacie sandboxowego miasta. Gracz porusza się pieszo, może wsiadać do auta i jeździć po proceduralnie zbudowanym świecie z własną fizyką pojazdu, audio i prostym HUD-em debugowym.

## Demo

Produkcja: https://wobbly-world.vercel.app/

## Aktualny stan projektu

- Gameplay jest dziś głównie samochodowy. Piesza postać nadal istnieje, ale służy głównie do poruszania się po świecie i wejścia do auta.
- Rendering opiera się o Three.js i natywne ES modules, bez bundlera.
- Projekt używa dziś dwóch silników fizyki:
- `Rapier` dla gracza, statycznego świata i kolizji postaci.
- `cannon-es` dla aktualnej dynamiki pojazdu (`RaycastVehicle`).
- W repo istnieje też izolowany spike `JoltPhysics.js`, uruchamiany osobno przez `?joltSpike=1`. To nie jest jeszcze część głównego gameplayu.
- Świat budowany jest proceduralnie przez `WorldBuilder`: drogi, chodniki, dzielnice, budynki, lampy, drzewa, wzgórza, auta i granice mapy.
- Audio jest proceduralne przez Web Audio API: silnik, opony, poślizg, klakson, kroki, skok/lądowanie, pierdnięcie i beknięcie.

## Stack

| Warstwa | Technologia |
| --- | --- |
| Rendering | Three.js r165 |
| Fizyka postaci i świata | Rapier3D |
| Fizyka pojazdu | `cannon-es` (`main`) + eksperymentalnie `JoltPhysics.js` (`?joltSpike=1`) |
| Audio | Web Audio API |
| Losowość / seed | `seedrandom` |
| Build tool | brak, natywne ES modules w przeglądarce |

## Sterowanie

### Pieszo

| Klawisz / wejście | Akcja |
| --- | --- |
| `WASD` / strzałki / lewy analog | ruch |
| `Spacja` / `Z` / pad `A` | skok |
| `E` / pad `X` | wejdź do auta / wyjdź z auta |
| `F` | pierdnięcie |
| `B` | beknięcie |
| mysz / prawy analog | kamera |
| klik w ekran | pointer lock |

### W aucie

| Klawisz / wejście | Akcja |
| --- | --- |
| `WASD` / lewy analog / triggery pada | jazda, cofanie, skręt |
| `Spacja` / pad `B` | hamulec ręczny |
| `H` / pad `Y` | klakson |
| `E` / pad `X` | wysiądź |
| mysz / prawy analog | kamera |

## Główne systemy

- `ThirdPersonCamera`: auto-align za graczem lub autem, tilt w zakrętach i płynny follow bez shake.
- `Car`: proceduralny model auta, światła, uszkodzenia, wheel slip, body roll/pitch, dym wydechu i synchronizacja `cannon-es` -> `Rapier`.
- `AudioManager`: proceduralny dźwięk silnika z biegami, opon, poślizgu i efektów postaci.
- `WorldBuilder`: kompozycja mapy oraz rejestracja obiektów do cullingu i kolizji.
- `zones.js`: definicje dróg, bezpiecznych punktów oraz typów nawierzchni.
- `VehiclePhysicsJolt`: osobny spike backendu pojazdu pod przyszłą migrację z `cannon-es`.

## Architektura

```text
src/
├── main.js
├── Game.js
├── core/
│   ├── AudioManager.js
│   ├── Camera.js
│   ├── InputManager.js
│   ├── Materials.js
│   ├── Physics.js
│   ├── RNG.js
│   ├── VehiclePhysics.js
│   └── VehiclePhysicsJolt.js
├── entities/
│   ├── Car.js
│   ├── Entity.js
│   ├── Player.js
│   └── PlayerMichaelMyers.js
├── objects/
│   ├── BrickBuilding.js
│   ├── Church.js
│   ├── Ground.js
│   ├── Hill.js
│   ├── House.js
│   ├── School.js
│   ├── Shop.js
│   ├── Skyscraper.js
│   ├── StreetLamp.js
│   ├── TowerBlock.js
│   ├── Tree.js
│   ├── TriOffice.js
│   ├── Warehouse.js
│   ├── WorldObject.js
│   └── Building.js
└── world/
    ├── WorldBuilder.js
    └── zones.js
```

## Pętla gry

```text
input.flush()
  -> updateInteraction()
  -> car.update(dt) lub player.update(dt)
  -> vehiclePhysics.step(dt)        // cannon-es
  -> car.lateUpdate()               // sync vehicle -> Three.js / Rapier
  -> physics.step(dt)               // Rapier
  -> player.lateUpdate()
  -> camera.update(...)
  -> dynamic FOV + HUD
  -> renderer.render()
```

## Funkcje aktualne na `main`

- wejście i wyjście z auta
- dynamiczne FOV zależne od prędkości
- płynna kamera z tilt w zakrętach
- body roll i pitch nadwozia
- proceduralne audio silnika, opon, poślizgu i klaksonu
- rozległy świat z kilkoma strefami zabudowy
- debug HUD z FPS, pozycją i prędkością
- uszkodzenia reflektorów i tylnych świateł

## Jolt Spike

Repo zawiera izolowany spike pod przyszłą migrację warstwy pojazdu z `cannon-es` do `JoltPhysics.js`.

Uruchomienie:

```text
http://localhost:8080/?joltSpike=1
```

Aktualny zakres spike'a:

- ładuje `JoltPhysics.js` bez bundlera przez importmapę
- uruchamia osobny backend `src/core/VehiclePhysicsJolt.js`
- stawia płaską scenę testową i jedno proste testowe auto/chassis
- działa osobno od głównego świata i nie przepina jeszcze `Car.js`

Obecne ograniczenia spike'a:

- nie zastępuje jeszcze gameplayu na `main`
- nie ma jeszcze sterowania autem Jolta
- nie ma jeszcze integracji z `WorldBuilder`, nawierzchniami i wheel state z docelowego adaptera

## Uruchomienie lokalne

Wymagany jest lokalny serwer HTTP.

```bash
npx serve .
# albo
python3 -m http.server 8080
```

Następnie otwórz `http://localhost:8080/`.

## Deploy

```bash
bash deploy.sh "opis zmian" "vX.Y.Z"
```

Skrypt robi commit i push na GitHub, a GitHub Pages publikuje aktualny stan.

## Dokumentacja

- [CHANGELOG.md](./CHANGELOG.md) jest źródłem historii zmian per wersja.
- [docs/JOLT_MIGRATION.md](./docs/JOLT_MIGRATION.md) opisuje plan migracji warstwy pojazdu do `JoltPhysics.js`.
- Ten README opisuje aktualny stan `main`.
- Archiwalna wersja single-file nadal leży w `wobbly-world.html`.

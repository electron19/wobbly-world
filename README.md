# Wobbly World

Przeglądarkowa gra 3D w klimacie sandboxowego miasta. Gracz porusza się pieszo, może wsiadać do auta, wchodzić do budynków i korzystać z drabinek, a nad miastem latają UFO z aktywnym promieniem podciągającym gracza lub auto.

## Demo

Produkcja: https://wobbly-world.vercel.app/

## Aktualny stan projektu

- Gameplay jest dziś mieszany: jazda autem, eksploracja piesza, wejścia do budynków, drabinki dachowe i zdarzenia z UFO.
- Rendering opiera się o Three.js i natywne ES modules, bez bundlera.
- Projekt używa jednego silnika fizyki — **Rapier3D** — zarówno dla gracza/świata jak i pojazdu (`DynamicRayCastVehicleController`).
- Świat budowany jest proceduralnie przez `WorldBuilder`: drogi, chodniki, dzielnice, budynki, lampy, drzewa, wzgórza, auta, UFO i granice mapy (~4× świat, drogi do z=±250).
- Audio jest proceduralne przez Web Audio API: silnik, opony, poślizg, klakson, kroki, skok/lądowanie, pierdnięcie i beknięcie.

## Stack

| Warstwa | Technologia |
| --- | --- |
| Rendering | Three.js r165 |
| Fizyka (postać, świat i pojazd) | Rapier3D (`DynamicRayCastVehicleController`) |
| Audio | Web Audio API |
| Losowość / seed | `seedrandom` |
| Build tool | brak, natywne ES modules w przeglądarce |

## Sterowanie

### Pieszo

| Klawisz / wejście | Akcja |
| --- | --- |
| `WASD` / strzałki / lewy analog | ruch |
| `Spacja` / `Z` / pad `A` | skok |
| `E` / pad `A` | interakcja: auto, budynek, drabinka |
| `F` | pierdnięcie |
| `B` | beknięcie |
| `K` | usypiający oddech |
| `G` | tryb lotu gracza |
| `C` / pad `Select` | przełącz widok |
| mysz / prawy analog | kamera |
| klik w ekran | pointer lock |

### W aucie

| Klawisz / wejście | Akcja |
| --- | --- |
| `WASD` / lewy analog / triggery pada | jazda, cofanie, skręt |
| `Spacja` / pad `B` | hamulec ręczny |
| `H` / pad `Y` | klakson |
| `E` / pad `A` | wysiądź |
| `F` | tryb lotu auta |
| `C` / pad `Select` | przełącz widok |
| mysz / prawy analog | kamera |

Uwagi:

- Interakcja jest mapowana na `E` z klawiatury i `A/Cross` na padzie.
- Hamulec ręczny w aucie jest mapowany na `Spację` i `B/Circle`.
- UFO może podciągać gracza albo prowadzone auto, jeśli znajdą się bezpośrednio pod promieniem.

## Główne systemy

- `ThirdPersonCamera`: auto-align za graczem lub autem, tilt w zakrętach, camera shake przy zderzeniu i płynny follow.
- `Car`: proceduralny model auta, światła (z uszkodzeniami), wheel slip, body roll/pitch, dym wydechu i synchronizacja Rapier → Three.js.
- `UFO`: autonomiczny pojazd latający po elipsie nad miastem, z pulsującym beamem i wpływem na gracza / auto.
- `NPC`: piesi z lekkim steeringiem omijającym budynki, drzewa i lampy na bazie `exclusion circles`.
- `AudioManager`: proceduralny dźwięk silnika z 5-biegową automatyczną skrzynią, opon, poślizgu i efektów postaci.
- `VehiclePhysics`: wrapper nad Rapier `DynamicRayCastVehicleController` — jeden wspólny świat fizyki dla wszystkiego.
- `WorldBuilder`: kompozycja mapy oraz rejestracja obiektów do cullingu i kolizji.
- `zones.js`: definicje dróg, bezpiecznych punktów oraz typów nawierzchni.

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
│   └── VehiclePhysics.js
├── entities/
│   ├── Animal.js
│   ├── Car.js
│   ├── Entity.js
│   ├── Ladder.js
│   ├── NPC.js
│   ├── Player.js
│   ├── PlayerMichaelMyers.js
│   └── UFO.js
├── objects/
│   ├── BrickBuilding.js
│   ├── Building.js
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
│   └── WorldObject.js
└── world/
    ├── WorldBuilder.js
    └── zones.js
```

## Pętla gry

```text
input.flush()
  -> updateInteraction()
  -> ufo.update(dt)
  -> car.update(dt) lub player.update(dt)
  -> interakcje beam / world events
  -> physics.step(dt)              // Rapier (postać + pojazd)
  -> car.lateUpdate()              // sync Rapier → Three.js
  -> player.lateUpdate()
  -> camera.update(...)
  -> dynamic FOV + HUD
  -> renderer.render()
```

## Funkcje aktualne na `main`

- wejście i wyjście z auta
- wchodzenie do wnętrz budynków (domy)
- drabinki dachowe i wejście na wybrane dachy
- 3 autonomiczne UFO nad miastem
- beam UFO podciągający gracza albo prowadzone auto
- dynamiczne FOV zależne od prędkości
- płynna kamera z tilt w zakrętach i camera shake przy zderzeniu
- body roll i pitch nadwozia
- proceduralne audio silnika, opon, poślizgu i klaksonu
- uszkodzenia reflektorów i tylnych świateł przy zderzeniu
- NPC omijający przeszkody zamiast przechodzenia przez obiekty
- rozległy świat (~1280 jednostek) z kilkoma strefami zabudowy
- debug HUD z FPS, pozycją XYZ i prędkością km/h

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

Skrypt robi commit i push na GitHub, a Vercel auto-deployuje po każdym push do `main`.

## Dokumentacja

- [CHANGELOG.md](./CHANGELOG.md) jest źródłem historii zmian per wersja.
- Ten README opisuje aktualny stan `main`.
- Archiwalna wersja single-file nadal leży w `wobbly-world.html`.
- [docs/JOLT_MIGRATION.md](./docs/JOLT_MIGRATION.md) jest dokumentem archiwalnym i nie opisuje aktywnego backendu projektu.

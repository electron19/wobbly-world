# Wobbly World

Przeglądarkowa gra 3D w klimacie sandboxowego miasta. Gracz porusza się pieszo, może wsiadać do auta i jeździć po proceduralnie zbudowanym świecie z własną fizyką pojazdu, audio i prostym HUD-em debugowym.

## Demo

Produkcja: https://wobbly-world.vercel.app/

## Aktualny stan projektu

- Gameplay jest dziś głównie samochodowy. Piesza postać nadal istnieje, ale służy głównie do poruszania się po świecie i wejścia do auta.
- Rendering opiera się o Three.js i natywne ES modules, bez bundlera.
- Projekt używa jednego silnika fizyki — **Rapier3D** — zarówno dla gracza/świata jak i pojazdu (`DynamicRayCastVehicleController`).
- Świat budowany jest proceduralnie przez `WorldBuilder`: drogi, chodniki, dzielnice, budynki, lampy, drzewa, wzgórza, auta i granice mapy (~4× świat, drogi do z=±250).
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

- `ThirdPersonCamera`: auto-align za graczem lub autem, tilt w zakrętach, camera shake przy zderzeniu i płynny follow.
- `Car`: proceduralny model auta, światła (z uszkodzeniami), wheel slip, body roll/pitch, dym wydechu i synchronizacja Rapier → Three.js.
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
│   ├── Car.js
│   ├── Entity.js
│   ├── Player.js
│   └── PlayerMichaelMyers.js
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
  -> car.update(dt) lub player.update(dt)
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
- dynamiczne FOV zależne od prędkości
- płynna kamera z tilt w zakrętach i camera shake przy zderzeniu
- body roll i pitch nadwozia
- proceduralne audio silnika, opon, poślizgu i klaksonu
- uszkodzenia reflektorów i tylnych świateł przy zderzeniu
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

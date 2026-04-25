# Jolt Migration Plan

Projekt: `/Users/krzysztof/Projects/wobbly-world`

## Cel

Zastąpić warstwę pojazdu opartą o `cannon-es RaycastVehicle` rozwiązaniem opartym o `JoltPhysics.js`, bez przepisywania renderera (`Three.js`) i bez ruszania logiki postaci pieszej opartej o Rapiera, dopóki nie będzie to konieczne.

## Status bieżący

Aktualny stan spike'a w repo:

- `index.html` ładuje `jolt-physics` przez importmapę
- `src/core/VehiclePhysicsJolt.js` inicjalizuje Jolta i stawia izolowaną scenę testową
- `src/Game.js` ma osobny tryb uruchamiany przez `?joltSpike=1`
- spike nie zastępuje jeszcze głównego backendu samochodu i nie przepina `src/entities/Car.js`

Uruchomienie lokalne spike'a:

```text
http://localhost:8080/?joltSpike=1
```

Na tym etapie spike:

- potwierdza, że `JoltPhysics.js` ładuje się w obecnym setupie bez bundlera
- potwierdza, że można uruchomić oddzielny backend fizyki w ramach tego projektu
- nie dostarcza jeszcze docelowego sterowania, wheel state ani integracji z `WorldBuilder`

## Dlaczego Jolt

Rekomendacja opiera się na oficjalnych źródłach:

- `JoltPhysics.js` jest dystrybuowany jako webowy pakiet ESM i może być ładowany z npm lub z CDN:
  https://www.npmjs.com/package/jolt-physics
- Dokumentacja C++ Jolta jest referencyjna również dla portu JS:
  https://github.com/jrouwe/JoltPhysics.js
- Jolt ma natywny `VehicleConstraint`, a nie tylko prosty helper do raycastowego auta:
  https://secondhalfgames.github.io/jolt-docs/4.0.2/class_vehicle_constraint.html

To daje przewagę dokładnie tam, gdzie ten projekt dziś cierpi:

- sterowanie i transfer masy
- kontakt opony z nawierzchnią
- kontrola przyczepności i łączenie tarcia opony z tarciem podłoża
- wheel transforms jako część systemu pojazdu
- stabilność przy większych prędkościach

## Co zostaje

- `Three.js` i cały rendering
- proceduralny model auta w `src/entities/Car.js`
- `Rapier` dla gracza i statycznych kolizji świata na pierwszym etapie
- `WorldBuilder` jako kompozytor mapy i spawn logic
- audio, HUD, kamera, UI

## Co wymieniamy

Na dziś fizyka pojazdu siedzi głównie w tych miejscach:

- `src/core/VehiclePhysics.js`
- `src/entities/Car.js`
- `src/Game.js`
- `index.html` importmap (`cannon-es`)

Najmocniejsze sprzężenia z `cannon-es`:

- `Car.speedKmh` czyta `currentVehicleSpeedKmHour`
- `Car.update()` używa `applyEngineForce`, `setBrake`, `wheelInfos`, `frictionSlip`
- `Car.lateUpdate()` używa `updateWheelTransform()`, `wheelInfos[*].worldTransform`, `deltaRotation`, `steering`
- `Game._loop()` zakłada osobny krok `vehiclePhysics.step(dt)` przed Rapierem
- `WorldBuilder` rejestruje przeszkody także w backendzie pojazdu przez `vehiclePhysics.addStaticBox`, `addStaticCylinder`, `addHillHeightfield`

## Docelowa architektura

### Etap 1: wymiana tylko backendu pojazdu

Zostawiamy:

- `PhysicsWorld` (Rapier) dla gracza i świata
- `Car` jako wizualno-gameplayową klasę auta

Dodajemy:

- `src/core/VehiclePhysicsJolt.js`
- lekki adapter z API kompatybilnym z tym, czego oczekuje `WorldBuilder` i `Car`

Minimalne API adaptera:

```js
class VehiclePhysicsJolt {
  async init()
  createVehicle(x, y, z, facing)
  addStaticBox(x, y, z, hw, hh, hd, material)
  addStaticCylinder(x, y, z, hh, r, material)
  addHillHeightfield(cx, cz, radius, height, sy)
  step(dt)
}
```

Zwracany obiekt pojazdu nie powinien być już surowym `RaycastVehicle`, tylko wrapperem typu:

```js
{
  body,
  vehicleConstraint,
  wheels,
  getSpeedKmh(),
  setDriverInput({ throttle, brake, steer, handBrake }),
  getWheelState(index),
}
```

### Etap 2: odklejenie `Car` od konkretnego solvera

`src/entities/Car.js` powinien przestać znać:

- `wheelInfos`
- `deltaRotation`
- `currentVehicleSpeedKmHour`
- `applyEngineForce`
- `setBrake`

Zamiast tego:

- `Car.update()` przekazuje wejście do abstrakcji `setDriverInput(...)`
- `Car.lateUpdate()` czyta zunifikowane `getWheelState(i)` i `getSpeedKmh()`

To jest klucz, bo bez tego każda zmiana silnika znowu przyklei logikę auta do API konkretnej biblioteki.

## Jak odwzorować aktualne systemy auta

### Sterowanie

Aktualny model wejścia w `Car.update()` zostaje:

- gaz / cofanie
- steering smoothing
- handbrake

Zmienia się tylko wykonanie:

- dziś: `applyEngineForce` i `setBrake`
- po migracji: ustawianie wejścia na kontrolerze pojazdu Jolta

### Przyczepność i nawierzchnie

Dziś nawierzchnie są sterowane przez:

- `isOnRoad`
- `isOnHardSurface`
- dynamiczne `frictionSlip`

Po migracji:

- zostają `zones.js` i kategorie nawierzchni
- materiał / powierzchnia musi wpływać na współczynnik tarcia w Jolt
- najlepiej mapować nawierzchnie do własnych material tags:
  - `road`
  - `sidewalk`
  - `grass`
  - `wall`
  - `metal`
  - `wood`

`VehicleConstraint::SetCombineFriction` jest dokładnie miejscem, gdzie Jolt pozwala spiąć tarcie opony z tarciem podłoża.

### Koła

Dziś animacja kół próbuje rekonstruować rzeczy z `deltaRotation`.

Po migracji:

- wheel rotation
- steering angle
- suspension compression
- ground contact

powinny pochodzić bezpośrednio z wheel state udostępnianego przez backend Jolta.

To jest ważne, bo obecny projekt już pokazał, że ręczne rekonstruowanie obrotu kół bardzo łatwo się rozjeżdża z ruchem auta.

### Transfer masy i „feeling”

Obecny projekt ma dużo ręcznego „game feel”:

- body roll
- body pitch
- downforce
- kamera i audio

Po migracji to dalej może zostać w warstwie gameplayowej. Jolt ma poprawić bazę fizyczną, nie zastąpić wszystkich efektów.

## Plan wdrożenia

### Faza A: spike techniczny

1. Dodać ładowanie `jolt-physics` do projektu.
2. Stworzyć `VehiclePhysicsJolt.js`.
3. Odpalić jedno testowe auto na płaskiej scenie.
4. Odczytać:
   - speed
   - wheel transforms
   - contact state
5. Potwierdzić, że auto jedzie, hamuje i skręca.

Stan realizacji:

- `1-3`: wykonane
- `4-5`: częściowo, bo spike ładuje backend i testową scenę, ale nie ma jeszcze wejścia kierowcy ani pełnego modelu pojazdu

### Faza B: kompatybilność z istniejącym światem

1. Dodać statyczne boxy, cylindry i heightfield dla świata.
2. Podpiąć `WorldBuilder` do nowego backendu.
3. Utrzymać dotychczasowy spawn aut.
4. Zostawić Rapiera dla gracza bez zmian.

### Faza C: przepisanie `Car`

1. Wyciąć bezpośrednie odwołania do `wheelInfos`.
2. Zastąpić je neutralnym API backendu.
3. Przepiąć:
   - speed HUD
   - wheel spin
   - skid detection
   - audio
   - lights / reversing

### Faza D: tuning

1. Grip per nawierzchnia.
2. Steering response.
3. Handbrake.
4. Brake balance.
5. Pitch/roll i kamera.

## Ryzyka

- `JoltPhysics.js` ma API zbliżone do C++, ale nie każda część Jolta musi być w 100% wyeksportowana w JS.
- Projekt obecnie działa bez bundlera, więc trzeba dobrać sposób ładowania Jolta zgodny z importmap / CDN.
- Przez pewien czas będą współistnieć dwa silniki fizyki: Rapier i Jolt. To jest akceptowalne, ale trzeba pilnować porządku odpowiedzialności.

## Rekomendacja praktyczna

Najlepszy następny ruch to nie „przepisz wszystko”, tylko:

1. zrobić branch spike z jednym autem na Jolt
2. ujednolicić interfejs backendu pojazdu
3. dopiero wtedy przepinać cały świat

To minimalizuje ryzyko i pozwala szybko sprawdzić, czy Jolt faktycznie daje lepszy feeling niż obecny `cannon-es`.

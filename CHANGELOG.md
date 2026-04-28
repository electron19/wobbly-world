# Changelog — Wobbly World

## [v0.9.14] — 2026-04-28
### Added
- `Ladder` i `UFO`: drabinki dachowe oraz 3 latające obiekty z promieniem wpływu podpięte do `WorldBuilder` i pętli `Game`
- `PoppyFactory`: rozbudowana fabryka z wnętrzem i interakcją wejścia
- NPC avoidance: unikanie okręgów przeszkód i bezpieczniejszy wybór celu podczas spaceru

### Fixed
- Interakcja `E` z klawiatury: lokalne kolejkowanie wejścia w `Game.js`, żeby wejście do auta / budynku / drabinki nie ginęło między klatkami lub cooldownami
- Mapping pada rozdzielony: `A/Cross` = interakcja, `B/Circle` = hamulec ręczny w aucie
- README zsynchronizowany z aktualnym sterowaniem, systemem UFO i aktualną listą encji

## [v0.9.13] — 2026-04-26
### Fixed
- Wheel visual rotation: `lateUpdate()` now uses smoothed speed (`_smoothSpd / 3.6`) instead of raw `currentVehicleSpeed()` — eliminates pulsating backward wheel spin during right turns caused by single-frame velocity projection spikes
- `VehiclePhysics`: `sideFrictionStiffness` raised from `0.15` → `0.45` — stabilises Rapier friction solver during sharp turns, reducing false brake-force spikes that activated stop/reverse lights

## [v0.9.9] — 2026-04-26
### Fixed
- `AudioManager`: race condition przy wyjeździe z auta w ciągu 640 ms — `setTimeout(() => startEngine(), 640)` śledzone przez `_engineStartId`; `stopEngine()` wywołuje `clearTimeout(_engineStartId)` przed guard'em `!_engineRunning`, eliminując "phantom engine" po wyjściu z auta przed rozruchem
- `Game.js`: fallback `linvel() ?? { x:0, z:1 }` zmieniony na `{ x:0, z:0 }` — `z:1` dawał fałszywy kierunek uderzenia w latarnie gdy chassis był niedostępny
- `Camera.js`: `addTrauma()` zaimplementowane — `_trauma` akumuluje energie zderzenia, kwadratowe wygasanie (`trauma²`) daje łagodny efekt, zanika przez `exp(-dt*8)` (~0.5 s); wcześniej metoda ignorowała parametr (`void amount`)

## [v0.9.8] — 2026-04-26
### Fixed
- Phantom braking: grupy kolizji kół wykluczone z detekcji dynamicznych ciał — brak fałszywego hamowania w pobliżu zaparkowanych aut
- Próg prędkości idle: `-1 → -5` km/h — brak aktywacji hamulca przy cofaniu z impetem
- `frictionSlip`: `0.85 → 4.0` — poprawa przyczepności przy normalnej jeździe po Rapier migracji
- Hamulec idle: naprawa kroku fizyki przy zerowej prędkości

## [v0.9.7] — 2026-04-26
### Fixed
- Hamowanie w pobliżu zaparkowanych aut: wheel raycasty wykluczone z detekcji ciał dynamicznych
- Boczne tarcie obniżone — brak "wciągania" przez kadłuby stojących pojazdów

## [v0.9.6] — 2026-04-26
### Fixed
- Pulsujące hamowanie: obniżony `frictionSlip` + symetryczne tłumienie zawieszenia (compression = relaxation) — eliminuje oscylacje siły hamowania

## [v0.9.5] — 2026-04-26
### Added
- System wchodzenia do wnętrz budynków — gracz może wejść do domu (`House.js`), scena przełącza widok; `WorldBuilder.js` i `Game.js` obsługują wejście/wyjście

## [v0.9.4] — 2026-04-26
### Fixed
- Siła silnika, tarcie, obrót kół i tłumienie zawieszenia po migracji do Rapier — jazda znowu responsywna

## [v0.9.3] — 2026-04-26
### Fixed
- Wheel raycasty: poprawna długość i origin po zmianie na `DynamicRayCastVehicleController`
- Idle suspension: zawieszenie nie zapada się przy braku kontaktu z podłożem
- Root Y: formuła obliczania pozycji nadwozia względem chassis

## [v1.0.8] — 2026-04-13
### Added
- 4× większy świat: nowe drogi E-W `z=±200/±250`, N-S `x=±195`
- Nowe Osiedle Północne i Południowe: 24 domy + 4 sklepy
- `Ground` powiększony do 1280 jednostek; granice mapy ±660

## [v1.0.7] — 2026-04-13
### Added
- HUD debug: FPS, pozycja XYZ, prędkość km/h
- Reflektory i tylne światła łamią się/gasną przy uderzeniu (uszkodzenia wizualne)

## [v1.0.6] — 2026-04-13
### Fixed
- `linearDamping`: `0.18 → 0.02` — brak sztucznego hamowania powietrzem po migracji Rapier
- Lampy uliczne: kolizja box `r=0.30` zamiast zbyt dużego — brak tunelowania
- Chodniki: `PlaneGeometry` zamiast box'ów — lepsza wydajność

## [v1.0.5] — 2026-04-13
### Fixed
- Lampy uliczne padają kinematycznie przy zderzeniu (ease-in, pivot u podstawy, bez wirowania)

## [v1.0.4] — 2026-04-13
### Fixed
- TDZ crash: `const dt` przeniesione przed pierwsze użycie w `lateUpdate`

## [v1.0.3] — 2026-04-13
### Fixed
- Podłączono `updateTires` — dźwięk opon asfalt/trawa przywrócony po migracji Rapier
- Usunięto optional chaining z `isPadButtonDown` (powodowało ciche błędy)

## [v1.0.2] — 2026-04-13
### Fixed
- Crash `contact.ri undefined` przy zderzeniu — poprawna obsługa event'u kontaktu Rapier
- Niespójność `dt` w `lateUpdate` — jeden spójny `dt` z pętli gry

## [v1.0.1] — 2026-04-13
### Changed
- **Migracja fizyki pojazdu: `cannon-es` → Rapier `DynamicRayCastVehicleController`** — jeden wspólny świat Rapier dla gracza, auta i świata; kolizje naturalne, brak duplikacji static bodies
### Added
- Ślady opon przy bocznym drifcie w zakrętach (`lateralSkid`)
- SVG favicon (eliminacja 404 przy ładowaniu)
### Fixed
- Kapsuła gracza nad dachem auta przy jeździe (brak eksplozji fizyki)
- `SyntaxError` w `Physics.js` (zbłąkany `}` na linii 23)

## [v1.0.0] — 2026-04-04
### Added
- **Body roll/pitch** — nadwozie wizualnie przechyla się w zakrętach (do 4°) i kiwa przy gazie/hamowaniu (do 2.7°); koła zostają w root, tylko mesh karoserii w `_bodyPivot`
- **Camera shake (trauma system)** — wstrząs kamery przy kolizji; intensywność zależna od prędkości uderzenia; zanika w ~0.5s
- **Camera tilt w zakrętach** — kamera delikatnie bankuje (do 3°) przy dużym kącie skrętu + prędkości
- **Dynamic FOV** — pole widzenia rośnie 65→85° wraz z prędkością (do 200 km/h); płynny powrót
- **Downforce** — siła docisku F = 0.5·v² N; lepsza przyczepność przy >60 km/h
### Fixed
- Usunięto nieużywaną zmienną `camSteer` w `Game.js`
- Camera tilt używa `quaternion.multiply` po `lookAt` (wcześniej `rotation.z` niespójne z eulerami)

## [v0.9.7] — 2026-03-28
### Fixed
- Limit 60 FPS w pętli gry (`_frameMs = 1000/60`): na 120Hz ekranie pętla pomija co drugą klatkę — gra porusza się z tą samą prędkością na baterii i zasilaczu
- Wygładzanie gazu/hamulca: `dt/tau` → `1 - exp(-dt/tau)` — matematycznie poprawne frame-rate-independent, eliminuje różnicę w odpowiedzi pedału między 30 a 60 FPS
- Wygładzanie skrętu: `Math.min(1, STEER_SPEED * dt)` → `1 - exp(-STEER_SPEED * dt)` — ta sama poprawka

## [v0.7.5] — 2026-03-28
### Fixed
- TriOffice (x=100,z=0) i (x=-100,z=0) stały na osi drogi E-W z=0 — usunięte z CBD
- TriOffice (x=162,z=-42) w CBD wschód — przeniesiony do pola (x=200,z=-25)
### Changed
- TriOffice proporcje: W=11,D=9 → W=10,D=50 — mocno rozciągnięty trójkąt (a=10, b=50), 5 pięter
- TriOffice kolizja: 2 boxy wzdłuż elongated osi (przód + tył) zamiast 1 kwadratu
- TriOffice `_regCircle`: hw=5.5,hd=4.5 → hw=5,hd=25 (nowe wymiary)
- 2 budynki trójkątne w otwartych polach poza miastem: Far East (200,-25,FE) + Far West (-200,25,FW)
  - Czubki skierowane ku centrum miasta, fasady od zewnątrz

## [v0.7.4] — 2026-03-28
### Fixed
- Ślady/dźwięk podczas normalnej jazdy: usunięto `skidInfo < 0.88` z warunku — triggerował przy każdym zakręcie
- Za mocne hamowanie na przód: usunięto dystrybucję 100/65%, równe hamowanie na 4 koła
- `isSkidding` (bazowany na skidInfo) zastąpiony jawnym `absCarSpd > 55 && steerAngle > 0.38` dla dźwięku driftu
### Changed
- `MAX_BRAKE_FORCE`: 220 → 175 Nm — płynniejsze, grywalne hamowanie (GTA-feel)
- Ślady tylko przy `slip > 0.85` (prawie zablokowane koła) lub hamulcu ręcznym na tylnych

## [v0.7.3] — 2026-03-28
### Fixed
- Pojazd poruszał się skokowo: przywrócono `MAX_BRAKE_FORCE` 380→220 Nm (380 powodowało niestabilność fizyki)
- Zarzucanie tyłu przy hamowaniu: rozkład hamowania 100% przód / 65% tył — przód hamuje mocniej, tył stabilny
- Hamowanie równe przód/tył (`fR = fF`) gdy `backAmount > 0.10` — brak nadsterowności pod hamowaniem
### Changed
- GTA-style cornering: `cornerT = steer × min(1, absSpd/60)` obniża `fR` w zakrętach przy prędkości — lekkie zarzucanie tyłu
- Asfalt: `fR = max(0.55, 2.6 - launchT*1.60 - cornerT*0.90)` — zakręty ≥60 km/h z driftem

## [v0.7.2] — 2026-03-28
### Fixed
- Ślady i dźwięk hamowania: próg poślizgu `0.28 → 0.85` — marks/pisk TYLKO gdy koła są faktycznie zablokowane
- Dźwięk tarcia w Game.js: próg `0.20 → 0.80` — spójnie z progiem śladów
- Boczny poślizg (cornering): próg skidInfo `0.92 → 0.88` (mniej fałszywych alarmów na wybojach)
### Changed
- `MAX_BRAKE_FORCE`: 220 → 380 Nm — pełna blokada kół przy ≥90% nacisku pedału; przy <90% auto hamuje bez poślizgu

## [v0.7.1] — 2026-03-28
### Fixed
- Slip ratio kół: `deltaRotation * 60` → `* 120` (physics step = 1/120s, nie 1/60s)
  - Błędne `* 60` dawało stały slip=0.5 przy normalnej jeździe → ciągły dźwięk tarcia i ślady hamowania
  - Poprawione w 3 miejscach: obliczenie maxSlip (dźwięk), wizualny obrót kół przy hamowaniu, ślady opon

## [v0.7.0] — 2026-03-27
### Fixed
- `linearDamping: 0.18 → 0.04` — pojazd nie hamuje sam; 0.18 powodowało 18% straty prędkości/s
- Auto-flip recovery: po 2 s koziołkowania auto wyprostowuje się (zachowuje kierunek Y)
- `rollInfluence: 0.03 → 0.01` — auto nie przewraca się od krawężnika
- Góry: zaślepka dna (`CircleGeometry`) dla kształtów round/ridge — brak dziury w podstawie
- Ślady opon: brązowe na trawie → brązowe ~12 punktów po wjeździe na asfalt → czarne (dynamiczna zmiana)
- E-W z=0 — lampy: droga miała tylko 4 lampy w centrum, teraz pełne pokrycie ±110j
- N-S x=±65 i x=±130 — lampy: przedłużone do z=±140
- Przyczepność 3 nawierzchni: asfalt fF=3.2, beton chodnika fF=2.8 (μ×0.88), trawa fF=0.70
### Changed
- `restitution: 0.1 → 0.28` — sprężyste uderzenia w ściany/obiekty
### Added
- Nowe drogi: E-W z=±150 (halfLen=145), lampy wzdłuż
- `Church.js` — kościół z wieżą, iglicą, witrażami, złotym krzyżem
- `Warehouse.js` — hala przemysłowa z bramami garażowymi i ryglami
- Nowe dzielnice `_addFarFarNorth/South` (z∈[-195,-155] i [155,195]):
  kościoły + 2 magazyny + kamienice + domy w 4 pasach
- N-S x=0: lampy przedłużone do z=±178

## [v0.6.2] — 2026-03-27
### Changed
- RWD nadsterowalność: tył wchodzi w wheelspin przy ruszaniu z mocnym gazem
  - `frictionSlip` tył dynamicznie: 2.6 (normalne) → 0.32 (pełny gaz od miejsca) — poślizg gdy silnik > tarcie
  - `MAX_ENGINE_FORCE`: 6750 → 9000 N — siła silnika przekracza przyczepność przy ruszaniu
  - `angularDamping`: 0.25 → 0.12 — tył swobodnie wychodzi bez silnego tłumienia
- Oversteer wygasa przy ~40 km/h (frictionSlip wraca do 2.6) — bez poślizgu na autostradzie

## [v0.6.1] — 2026-03-27
### Changed
- Analogowe hamowanie: pedał gazu i hamulec mają rampę narastania (80 ms) i opadania (180 ms)
- Dotyczy zarówno klawiatury (0/1 → płynne) jak i pada (już był analog, teraz też wygładzony)
- Efekt: delikatne wciśnięcie → wolne hamowanie; pełny nacisk → pełna siła po ~80 ms

## [v0.6.0] — 2026-03-27
### Changed
- Biegi: fizyczne przełożenia nieliniowe (`RPM_PER_KMH = [310, 148, 91, 59, 52]`) zamiast liniowych
- Biegi: po zmianie biegu RPM = `prędkość × przełożenie_nowego_biegu` (zamiast stałego `RPM_DROP=2200`)
- Biegi: 5 bieg ma minimalny spadek dźwięku względem 4 (124.9 → 118.2 Hz przy 115 km/h, ~5%)
- `rpmToHz`: sqrt-kompresja zamiast liniowej → mniejsze różnice słyszalne między wysokimi biegami
- Progi zmiany: `[20, 42, 68, 115]` km/h w górę / `[12, 27, 48, 85]` km/h w dół
- Zawieszenie: miększe sprężyny (`suspensionStiffness` 52→36), większy skok (0.22→0.28), wolniejszy powrót (dampingRelaxation 3.2→2.4)
- `frictionSlip` przód/tył na asfalcie: 1.5/1.3 → 3.2/2.6 — auto zachowuje prędkość w zakrętach zamiast tracić
- `angularDamping` chassis: 0.40→0.25 — mniejszy opór przy rotacji, lepsze zachowanie pędu

## [v0.5.0] — 2026-03-27
### Fixed
- Drzewa i lampy nie nachodzą na siebie ani na budynki:
  - Drzewa: po dodaniu rejestrowane w `_circles` (r≈3.3j) — kolejne drzewa/lampy je omijają
  - Lampy: sprawdzane przez `_isFreeForTree(x,z,1.5)` przed dodaniem (wcześniej bez sprawdzenia)
  - Lampy: po dodaniu rejestrowane w `_circles` (r≈1.7j)

## [v0.4.9] — 2026-03-27
### Changed
- `MAX_BRAKE_FORCE`: 600 → 220 Nm — mniej agresywne hamowanie (mniejsze opóźnienie)
- Hamowanie na trawie: 38% siły asfaltu (`BRAKE_GRASS_MULT = 0.38`) → dłuższa droga
- Hamulec ręczny na trawie: skalowany tak samo jak nożny
- `onRoad` obliczane raz na klatkę, przed blokiem gazu/hamulca (refaktor)

## [v0.4.8] — 2026-03-27
### Fixed
- Coasting: `brakeForce = 0` gdy brak gazu — auto toczy się swobodnie
- Parking: `IDLE_BRAKE` (8) tylko gdy `absSpd < 1.5` km/h
- Wizualne koła: slip-blend tylko przy aktywnym `_isBraking`/`_isHandbraking`
### Changed
- `linearDamping`: 0.08 → 0.18 — naturalny opór toczenia przez powietrze/tarcie

## [v0.4.7] — 2026-03-27
### Fixed
- Pisk opon: aktywny TYLKO gdy koła realnie blokują (slip ratio > 20%) lub boczny drift
  - Usunięto `brakeSkid` — ślady/pisk nie pojawiają się przy zwykłym hamowaniu
  - Pisk teraz oparty na `wheelSlip` (deltaRotation vs vehicleSpeed), nie na `isBraking`
- Wizualna blokada kół: przy dużym poślizgu koła wizualnie zwalniają proporcjonalnie do slip ratio
### Changed
- `MAX_BRAKE_FORCE`: 120 → 600 Nm — umożliwia fizyczną blokadę przy pełnym hamowaniu
- `HAND_BRAKE_FORCE`: 140 → 700 Nm — dramatyczny drift
- `_isBraking` służy teraz TYLKO do świateł stop (już przy każdym hamowaniu > idle)
### Added
- Getter `Car.wheelSlip` — slip ratio [0..1] (0=wolne toczenie, 1=blokada)

## [v0.4.6] — 2026-03-27
### Fixed
- Koła: `+=wheelRotDelta` (poprzednie `-=` było błędne — koła kręciły się do tyłu)

## [v0.4.5] — 2026-03-27
### Fixed
- Koła pojazdu: naprawiona rotacja — kręciły się do tyłu i stały przy coasting (brak gazu)
  - Wymiana `w.deltaRotation` (=0 bez silnika) na obliczanie z `speedKmh / WHEEL_R * dt`
  - Negacja znaku: `inner.rotation.x -= wheelRotDelta` (wcześniej `+=` dawało obrót wstecz)
### Changed
- Wydajność: zasięg renderowania skrócony (cull 200→85j, camera far 200→110, fog 0.004→0.008)
### Added
- Pierdnięcie gracza: klawisz **F** — proceduralny szum z LFO (losowa długość 0.28–0.83 s)
- Beknięcie gracza: klawisz **B** — oscylator piła z sweep (losowa długość 0.32–0.67 s)
- Hint sterowania zaktualizowany (F/B widoczne na ekranie)

## [v0.4.4] — 2026-03-24
### Changed
- Trawa: poślizg brzmi jak mokry błotek (głęboki rumble 120 Hz + chlupot bandpass 320 Hz)
- Ulica: pisk opon bez zmian ("iiiihhh" 3200 Hz + syk 1800 Hz)

## [v0.4.3] — 2026-03-24
### Fixed
- Lampy uliczne: poprawiona rotacja klosza dla wszystkich dróg (E-W z=0, z=-50, N-S x=±65 były odwrócone)
- Klakson pada: zmienione z `isPadButtonPressed` → `isPadButtonDown` (ciągłe trąbienie przy trzymaniu Y)
- Pisk opon: aktywny TYLKO na asfalcie — na trawie cisza (zgodnie z życzeniem)
- Trawa: brak dźwięku tarcia przy poślizgu na trawie

## [v0.4.2] — 2026-03-24
### Changed
- Klakson: ciągły dźwięk gdy trzymasz H (startHorn/stopHorn zamiast jednorazowego)
- Dym wydechu: 4× więcej kłębów/s, większe cząsteczki (r 0.07→0.13), unoszą się dłużej (2.2s), szybciej rosną

## [v0.4.1] — 2026-03-24
### Fixed
- Pisk opon: przerobiony na realistyczny szum wysokich częstotliwości (bandpass 3200 Hz + highpass 1800 Hz) zamiast oscylatora piły — brzmi jak "iiiihhh"
- Ślady opon: ribbon mesh (quady szerokości bieżnika WHEEL_W=0.26 m) zamiast cienkich linii

## [v0.4.0] — 2026-03-24
### Added
- Klakson: H (klawiatura) / Y-pad (Xbox button 3) — proceduralny podwójny sygnał
- Światła stop: tylne lampy świecą jaskrawoczerwono przy hamowaniu / hamulcu ręcznym
- Światła cofania: białe lampki przy jeździe wstecz
- Ogródki zielone + ścieżka z białych płytek przed każdym domem
- Dźwięk zderzenia aut — chassis oznaczone jako 'metal' (użyty istniejący dźwięk metaliczny)
### Fixed
- Ślady opon: usunięto warunek `isInContact` (cannon-es nie zawsze go ustawia) → ślady pojawiają się poprawnie przy hamowaniu i poślizgu
- Usunięto szum opon (na życzenie użytkownika)

## [v0.3.2] — 2026-03-24
### Fixed
- Ślady opon: wszystkie 4 koła (było tylko 2 tylne), próg skidInfo 0.88→0.96
- Ślady przy hamowaniu (wszystkie koła) i hamulcu ręcznym (tylne koła) — niezależnie od fizycznego skidInfo
- Lampy uliczne obrócone we właściwą stronę (oświetlają ulicę, nie trawę)
- Dźwięki uderzeń: chodniki, wzgórza, krawężniki oznaczone jako 'ground' (brak fałszywych dźwięków)

## [v0.3.0] — 2026-03-24
### v0.3.1 poprawki (2026-03-24)
- Dźwięki uderzeń dla wszystkich obiektów: ściany (bum), drzewa (trzask), latarnie (brzęk metaliczny)
- Chodniki i wzgórza oznaczone jako `'ground'` — brak fałszywych dźwięków od podłoża
- `MAX_ENGINE_FORCE` 4000→2000 N (przyspieszenie wolniejsze o 50%)
- Hamulec ręczny: SPACJA (klawiatura) / B (pad)
### Added
- `AudioManager` — proceduralny dźwięk przez Web Audio API (zero plików)
- Silnik z 5-biegową automatyczną skrzynią: RPM rośnie na każdym biegu, shift → RPM spada → rośnie znowu
- Rozruch silnika: sekwencja starter → złapanie → flare → bieg jałowy
- Kroki: inny dźwięk na asfalcie (ostry klik) vs trawie (miękki szelest)
- Opony: ciągły szum/pomruk, zależny od nawierzchni i prędkości
- Pisk opon przy poślizgu: road (wysoki screech) vs grass (niski scrape)
- Dźwięk hamulca ręcznego (B) proporcjonalny do prędkości
- Skok (sine sweep) + lądowanie (bum + szum)
- Dym wydechu: cząsteczki szarego dymu z rury gdy silnik pracuje
- `isOnRoad(x, z)` — detekcja nawierzchni używająca pełnej siatki ROADS
### Changed
- `MAX_SPEED_KMH`: 70 → 140 km/h (wyższe prędkości)
- `MAX_ENGINE_FORCE`: 2500 → 4000 N (lepsza dynamika)
- `MAX_STEER_ANGLE`: 0.58 → 0.78 rad (większy kąt skrętu, ≈45°)
- `MAX_REV_KMH`: 25 → 35 km/h
- Detekcja nawierzchni (onRoad) w `Car.js` używa `isOnRoad()` zamiast uproszczonego sprawdzenia
### Fixed
- Ślady opon używają poprawnej detekcji drogi (wszystkie 6 dróg, nie tylko główne)



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

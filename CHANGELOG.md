# Changelog — Wobbly World

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

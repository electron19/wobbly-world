# Audyt kodu — błędy i niezgodności

Data audytu: 2026-04-04

## 1) Niezgodność dokumentacji architektury z aktualnym kodem
- `README.md` opisuje `src/entities/Player.js` jako główną implementację gracza.
- Faktycznie gra inicjalizuje `PlayerMichaelMyers`.
- To utrudnia onboarding i debugowanie, bo nowy deweloper zacznie od złego pliku.

**Dowody:**
- README wskazuje `Player.js` jako gracza.
- `Game` importuje i tworzy `PlayerMichaelMyers`.

## 2) Niezgodność opisu sterowania z zachowaniem gry
- `README.md` opisuje wyłącznie ruch pieszy i skok.
- UI w `Game.js` oraz `index.html` pokazuje dodatkowe sterowanie (wsiadanie/wysiadanie z auta, klakson, dźwięki postaci, kamera itd.).
- Dokumentacja użytkownika nie odpowiada temu, co faktycznie widzi gracz.

## 3) Niespójność nazewnictwa domenowego w klasie gracza
- Klasa nazywa się `PlayerMichaelMyers`, ale komentarz nagłówkowy mówi o „The Player (Poppy Playtime)”.
- To wskazuje na pozostałość po refaktorze i zwiększa ryzyko mylnej interpretacji assetów/założeń projektowych.

## 4) Nadmierne poleganie na polach „wewnętrznych” (`_...`) między modułami
- `Game` korzysta bezpośrednio z wewnętrznych pól encji (`player._body`, `car._steer`, `car._audio`).
- To łamie hermetyzację i podnosi ryzyko regresji przy zmianach implementacji encji.
- Zalecenie: wystawić jawne API (`setHiddenInCar`, `getPhysicsBody`, `getSteerInput` itp.).

## 5) Niespójny opis topologii dróg vs aktualna konfiguracja
- Komentarz nagłówkowy w `zones.js` opisuje krótszą siatkę dróg.
- Faktyczna tablica `ROADS` zawiera znacznie więcej tras (np. z=±150, ±200, ±250 oraz x=±195).
- Komentarz nie odzwierciedla stanu systemu stref i może wprowadzać w błąd przy dalszym rozwoju mapy.

## Szybkie kontrole wykonane technicznie
- Składnia JS (`node --check`) dla wszystkich plików `src/**/*.js`: brak błędów składni.


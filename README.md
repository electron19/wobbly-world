# Wobbly World 🏘️

Gra 3D przeglądarkowa — wobbly postać spaceruje po osiedlu.

## Demo

> GitHub Pages: https://electron19.github.io/wobbly-world/wobbly-world.html

## Stack

- **Three.js** v0.152 (CDN)
- Vanilla JS — zero buildu, jeden plik HTML
- Toon shading + spring physics

## Sterowanie

| Klawisz | Akcja |
|---|---|
| `WASD` | Ruch |
| `Spacja` | Skok |
| `Mysz` (klik) | Kamera (pointer lock) |

## Uruchomienie lokalne

Otwórz `wobbly-world.html` w przeglądarce — nie wymaga serwera.

## Deploy

```bash
bash deploy.sh "opis zmian"
```

Commituje zmiany i pushuje do GitHub (GitHub Pages).

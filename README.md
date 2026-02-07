# 🐻💙 Polar Bear Love Quest

A cute Valentine-themed mini‑game collection made with pure **HTML + CSS + JavaScript**.

This project was built as a cozy love letter:  
collect hearts, buy a flower, and deliver it to your special polar bear NPC 💐❄️

---

## ✨ Features

### 💙 Mini Game 1 — Collect the Hearts
- Explore a snowy pixel map (Tiled `.tmj` map support)
- Collect hearts scattered around the world
- Spend hearts at the flower shop
- Deliver the flower to the NPC to trigger a Valentine win popup

### 🧠 Mini Game 2 — Memory Match (3 Levels)
- Beginner → Medium → Hard progression
- Uses an image pool loaded from `manifest.json`
- Win screen includes confetti + fun polar bear facts

### 🎵 Background Music Playlist
- Multiple songs play in sequence
- Mute + volume slider UI
- Settings saved with `localStorage`
- Starts safely after username confirmation (browser autoplay friendly)

### 💌 Valentine Win Card
After completing the hearts quest, the player receives a love message popup with:
- A cute image
- A menu button to return home
- A heartfelt Valentine note 💙

---

## 📂 Project Structure

```bash
polar-bear-love-quest/
│
├── index.html
├── style.css
├── game.js              # menu + memory game logic
├── hearts.js            # tilemap hearts quest game
├── music.js             # global background playlist
│
└── assets/
    ├── maps/
    │   └── winter_map_final.tmj
    ├── sprites/
    │   ├── pbear_down_blue.png
    │   ├── pbear_down_pink.png
    │   ├── heart.png
    │   └── flower.png
    ├── music/
    │   ├── song1.m4a
    │   ├── song2.m4a
    │   └── song3.m4a
    └── memory/
        └── polar_bear/
            ├── manifest.json
            └── images...
```

---

## 🚀 How to Run Locally

Because the game loads JSON + maps, you must run it with a local server.

### Option 1 — VS Code Live Server (recommended)
1. Open the folder in VS Code  
2. Install the **Live Server** extension  
3. Right‑click `index.html` → **Open with Live Server**

### Option 2 — Python Server

```bash
python -m http.server 8000
```

Then open:

```
http://localhost:8000
```

---

## 🗺️ Map Editing (Tiled)

This game uses maps created in **Tiled**:

- Tilemap format: `.tmj`
- Object layer: `Objects`
- Classes used:
  - `player`
  - `heart`
  - `npc`
  - `flowershop`

Tiles can also include:

- `collides = true`
- animations via `<animation>` frames in TSX

---

## 📜 License

This project is personal and made as a Valentine gift.

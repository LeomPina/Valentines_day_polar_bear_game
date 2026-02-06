(() => {
  /* ===================== CONFIG ===================== */
  const MAP_URL_ = "assets/maps/winter_map_final.tmj";
  const MAP_URL = new URL(MAP_URL_, location.href).toString(); // 🔴 CHANGE if needed

  const TILE_SIZE = 16;
  const WORLD_SCALE = 1;     // keep as 1 (or whatever you built the map for)
  let CAMERA_ZOOM = 1.5;     // this is your zoom
  const DRAW_TILE = TILE_SIZE * WORLD_SCALE;

  const MOVE_COOLDOWN_MS = 120;

  const FLIP_H = 0x80000000;
  const FLIP_V = 0x40000000;
  const FLIP_D = 0x20000000;
  const GID_MASK = ~(FLIP_H | FLIP_V | FLIP_D);

  const OBJ_COLLIDE_HEIGHT = 14; // pixels from the bottom that collide (try 8–14)
  const OBJ_COLLIDE_INSET_X = 2; // trim left/right (try 0–8)
  const HEARTS_REQUIRED = 8;


  function stripGidFlags(gid) {
    return gid & GID_MASK;
  }


  // 🔴 CHANGE THESE PATHS TO MATCH YOUR FILES
  const SPRITES = {
    npc_bear_down:  "assets/sprites/pbear_down_pink.png",
    bear_down:  "assets/sprites/pbear_down_blue.png",
    bear_up:    "assets/sprites/pbear_up_blue.png",
    bear_left:  "assets/sprites/pbear_left_blue.png",
    bear_right: "assets/sprites/pbear_right_blue.png",
    heart:      "assets/sprites/heart.png",
    flower:     "assets/sprites/flower.png",
  };

  // sprite sizes measured in tiles
  const SPRITE_SIZE_TILES = {
    bear:   { w: 2, h: 2 },
    heart:  { w: 1, h: 1 },
    flower: { w: 1, h: 1 },
  };

  const HEART_DIALOGS = [
    "My beautiful princess 💙",
    "Your cuddles are the world to me ❄️💙",
    "I'm so grateful for my pookerella 💙",
    "Looking into your baby blues is literal heaven 💙",
    "The most beautiful and sweetest girl in the universe 💙",
    "You have the most perfect polar bear paws I've seen in my life ❤️",
    "I LOVE YOUUUUUUUU SOSOSOSOS MUCHHCHHHHHH AHHHHHH 💙",
    "I'm the luckiest boy in the world to have such an amazing pookgirl 💙",
  ];

  // ✅ Heart dialog pool (no repeats)
  let remainingHeartDialogs = [...HEART_DIALOGS];

  function getUniqueHeartDialog() {
    // Safety reset (only happens if more hearts are added later)
    if (remainingHeartDialogs.length === 0) {
      remainingHeartDialogs = [...HEART_DIALOGS];
    }

    // Pick random index from remaining pool
    const index = Math.floor(Math.random() * remainingHeartDialogs.length);

    // Remove it so it can never repeat
    return remainingHeartDialogs.splice(index, 1)[0];
  }


  /* ===================== DOM ===================== */
  const canvas = document.getElementById("heartsCanvas");
  const msgEl = document.getElementById("message");
  if (!canvas || !msgEl) return;
  const ctx = canvas.getContext("2d");

  /* ===================== STATE ===================== */
  let shopArea = null;
  let npcArea = null; // optional if you want rectangle for npc too

  let interactables = [];
  let map = null;
  let tilesets = [];
  let tilesetImages = new Map();

  const spriteImgs = {};
  let blocked = [];
  let hearts = new Map();
  let shop = null;
  let npc = null;

  let player = { tx: 0, ty: 0, dir: "down" };
  let heartsCount = 0;
  let hasFlower = false;

  let camX = 0;
  let camY = 0;
  let lastMoveAt = 0;
  let keyHandler = null;

  let collectionTileImages = new Map(); // firstgid -> Map(tileId -> HTMLImageElement)


  /* ===================== HELPERS ===================== */
  const keyXY = (x, y) => `${x},${y}`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));


  function setMessage(t) {
    msgEl.textContent = t;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(`Failed to load ${src}`);
      img.src = src;
    });
  }

  function objToTile(obj) {
    return {
      tx: Math.floor(obj.x / TILE_SIZE),
      ty: Math.floor(obj.y / TILE_SIZE),
    };
  }

  function getProps(obj) {
    const out = {};
    if (!obj.properties) return out;
    for (const p of obj.properties) out[p.name] = p.value;
    return out;
  }

  let animStart = performance.now();


  /* ===================== TILESET HELPERS ===================== */
  function findTilesetForGid(gid) {
    let chosen = null;
    for (const ts of tilesets) {
      if (gid >= ts.firstgid) chosen = ts;
      else break;
    }
    return chosen;
  }

  function tileCollides(gid) {
    const ts = findTilesetForGid(gid);
    if (!ts || !ts.tiles) return false;
    const localId = gid - ts.firstgid;
    const tile = ts.tiles.find(t => t.id === localId);
    return tile?.properties?.some(p => p.name === "collides" && p.value === true);
  }

  /* ===================== BUILD COLLISION ===================== */
  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }


  function buildBlockedGrid() {
    blocked = Array.from({ length: map.height }, () =>
      Array(map.width).fill(false)
    );

    // 1) Collisions from tile layers (tiles with collides=true)
    for (const layer of map.layers) {
      if (layer.type !== "tilelayer" || !layer.visible) continue;

      layer.data.forEach((gid, i) => {
        if (!gid) return;
        const clean = stripGidFlags(gid);
        if (tileCollides(clean)) {
          const x = i % map.width;
          const y = Math.floor(i / map.width);
          blocked[y][x] = true;
        }
      });
    }

    // 2) Collisions from tile-objects (trimmed footprint)
    for (const layer of map.layers) {
      if (layer.type !== "objectgroup" || !layer.visible) continue;

      for (const obj of layer.objects) {
        if (!obj.gid) continue;

        // ✅ Skip objects that must remain walkable / interactable / collectible
        const cls = (obj.class || obj.type || obj.name || "").trim().toLowerCase();
        if (["heart", "player", "pookgirl", "npc", "pookboy", "shop", "flowershop"].includes(cls)) {
          continue;
        }

        // Tiled tile-object: x is left in pixels, y is bottom in pixels
        const objW = (obj.width || TILE_SIZE);
        const objH = (obj.height || TILE_SIZE);

        // Only collide with a bottom "footprint strip"
        const left = obj.x + OBJ_COLLIDE_INSET_X;
        const right = obj.x + objW - OBJ_COLLIDE_INSET_X;

        const bottom = obj.y;
        const top = obj.y - Math.min(OBJ_COLLIDE_HEIGHT, objH);

        if (right <= left) continue;

        const startX = Math.floor(left / TILE_SIZE);
        const endX = Math.floor((right - 1) / TILE_SIZE);
        const startY = Math.floor(top / TILE_SIZE);
        const endY = Math.floor((bottom - 1) / TILE_SIZE);

        for (let ty = startY; ty <= endY; ty++) {
          for (let tx = startX; tx <= endX; tx++) {
            if (blocked[ty] && blocked[ty][tx] !== undefined) {
              blocked[ty][tx] = true;
            }
          }
        }
      }
    }

    // ✅ Safety: hearts must always be walkable (in case something overlaps)
    for (const key of hearts.keys()) {
      const [tx, ty] = key.split(",").map(Number);
      if (blocked[ty] && blocked[ty][tx] !== undefined) blocked[ty][tx] = false;
    }
  }


  /* ===================== OBJECTS ===================== */
  function parseObjects() {
    hearts.clear();
    shop = null;
    npc = null;
    shopArea = null;
    npcArea = null;
    interactables = [];

    const objLayer = map.layers.find(l => l.type === "objectgroup" && l.name === "Objects");
    if (!objLayer) return;

    for (const obj of objLayer.objects) {
      const cls = (obj.class || obj.type || obj.name || "").trim().toLowerCase();
      const props = getProps(obj);

      // Tile-objects: x is left, y is bottom
      const tileObjTx = Math.floor(obj.x / TILE_SIZE);
      const tileObjTy = Math.floor((obj.y - 1) / TILE_SIZE);

      // ===== PLAYER (tile-object) =====
      if (cls === "player" || cls === "pookgirl") {
        player.tx = tileObjTx;
        player.ty = tileObjTy;
        player.dir = "down";
        continue;
      }

      // ===== HEARTS (tile-object) =====
      if (cls === "heart") {
        hearts.set(keyXY(tileObjTx, tileObjTy), { value: Number(props.value ?? 1) });
        continue;
      }

      // ===== NPC / SHOP AS TILE-OBJECT =====
      if (obj.gid) {
        if (cls === "npc") {
          npc = {
            tx: tileObjTx,
            ty: tileObjTy,
            dialog: String(props.dialog ?? "Hi… I’d love a flower 🌸"),
            successDialog: String(props.successDialog ?? "OMG thank you 😳💙"),
          };
        }
        continue;
      }

      // ===== NPC / SHOP AS RECTANGLE OR POINT =====
      const hasRect = (obj.width || 0) > 0 && (obj.height || 0) > 0;

      // Build an interaction area:
      // - if rectangle: use its true area
      // - if point: treat it like a 1-tile box centered on the point
      const area = hasRect
        ? { x: obj.x, y: obj.y, w: obj.width, h: obj.height }
        : {
          x: obj.x - TILE_SIZE,     // center a 2x2 tile box on the point
          y: obj.y - TILE_SIZE * 2,
          w: TILE_SIZE * 2,
          h: TILE_SIZE * 2
        };


      if (cls === "flowershop" || cls === "shop") {
        shopArea = area;
        shop = {
          cost: Number(props.cost ?? 3),
          dialog: String(props.dialog ?? "Bring me more hearts 💙"),
          successDialog: String(props.successDialog ?? "You bought a flower 🌸"),
        };
        continue;
      }

      if (cls === "npc") {
        npcArea = area;

        // Give NPC a draw position:
        // - rectangle objects: y is TOP, so bottom = y + h
        // - point objects: use point itself
        const px = hasRect ? (obj.x + obj.width / 2) : obj.x;
        const pyBottom = hasRect ? (obj.y + obj.height) : obj.y;

        npc = {
          tx: Math.floor(px / TILE_SIZE),
          ty: Math.floor((pyBottom - 1) / TILE_SIZE),
          dialog: String(props.dialog ?? "Hi… I’d love a flower 🌸"),
          successDialog: String(props.successDialog ?? "OMG thank you 😳💙"),
        };
        continue;
      }
    }

    // Helpful debug:
    console.log("[NPC]", npc, "[npcArea]", npcArea);
    console.log("[SHOP]", shop, "[shopArea]", shopArea);
  }




  function updateCamera() {
    // Use the canvas *display size* (CSS pixels), not the internal buffer
    const rect = canvas.getBoundingClientRect();
    const viewW = (rect.width) / CAMERA_ZOOM;
    const viewH = (rect.height) / CAMERA_ZOOM;

    const targetX = player.tx * DRAW_TILE + DRAW_TILE / 2 - viewW / 2;
    const targetY = player.ty * DRAW_TILE + DRAW_TILE / 2 - viewH / 2;

    const worldW = map.width * DRAW_TILE;
    const worldH = map.height * DRAW_TILE;

    camX = clamp(targetX, 0, Math.max(0, worldW - viewW));
    camY = clamp(targetY, 0, Math.max(0, worldH - viewH));
  }





  /* ===================== DRAWING ===================== */
  function drawSprite(img, tx, ty, size) {
    const w = size.w * DRAW_TILE;
    const h = size.h * DRAW_TILE;
    const x = tx * DRAW_TILE + DRAW_TILE / 2 - camX;
    const y = ty * DRAW_TILE + DRAW_TILE - camY;
    ctx.drawImage(img, x - w / 2, y - h, w, h);
  }

  function drawObjectTile(obj) {
    let gid = obj.gid;
    if (!gid) return;

    gid = stripGidFlags(gid);

    const ts = findTilesetForGid(gid);
    if (!ts) return;

    const id = gid - ts.firstgid;
    if (id < 0) return;

    // Tiled object x,y are in MAP pixels; for tile objects, y is the bottom edge
    const px = obj.x * WORLD_SCALE - camX;
    const pyBottom = obj.y * WORLD_SCALE - camY;

    // ✅ Collection tileset (each tile has its own image)
    if (ts.isCollection) {
      const perTile = collectionTileImages.get(ts.firstgid);
      const tileImg = perTile?.get(id);
      if (!tileImg) return;

      const w = tileImg.naturalWidth * WORLD_SCALE;
      const h = tileImg.naturalHeight * WORLD_SCALE;

      ctx.drawImage(tileImg, px, pyBottom - h, w, h);
      return;
    }

    // ✅ Sheet tileset
    if (!ts.columns || ts.columns <= 0) return;

    const img = tilesetImages.get(ts.firstgid);
    if (!img) return;

    if (id >= (ts.tilecount || 0)) return;

    const sx = (ts.margin || 0) + (id % ts.columns) * (ts.tilewidth + (ts.spacing || 0));
    const sy = (ts.margin || 0) + Math.floor(id / ts.columns) * (ts.tileheight + (ts.spacing || 0));

    // draw at tileset tile pixel size (world scale only; camera zoom handled by ctx transform)
    const dw = ts.tilewidth * WORLD_SCALE;
    const dh = ts.tileheight * WORLD_SCALE;

    ctx.drawImage(
      img,
      sx, sy, ts.tilewidth, ts.tileheight,
      px, pyBottom - dh,
      dw, dh
    );
  }


    

// UPDATED: draw() — add animated gid for BOTH tile layers + tile-objects
  function draw() {
    const now = performance.now();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(CAMERA_ZOOM, 0, 0, CAMERA_ZOOM, 0, 0);
    ctx.clearRect(0, 0, canvas.width / CAMERA_ZOOM, canvas.height / CAMERA_ZOOM);

    updateCamera();

    // ---- TILE LAYERS ----
    for (const layer of map.layers) {
      if (layer.type !== "tilelayer" || !layer.visible) continue;

      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          let gid = layer.data[y * map.width + x];
          if (!gid) continue;

          gid = stripGidFlags(gid);

          // ✅ APPLY ANIMATION (if this tile has <animation> in TSX)
          gid = getAnimatedGid(gid, now);

          const ts = findTilesetForGid(gid);
          if (!ts) continue;

          const id = gid - ts.firstgid;
          if (id < 0) continue;

          // ✅ Collection tileset: per-tile image
          if (ts.isCollection) {
            const perTile = collectionTileImages.get(ts.firstgid);
            const tileImg = perTile?.get(id);
            if (!tileImg) continue;

            const w = (ts.tilewidth || TILE_SIZE) * WORLD_SCALE;
            const h = (ts.tileheight || TILE_SIZE) * WORLD_SCALE;

            ctx.drawImage(
              tileImg,
              x * DRAW_TILE - camX,
              y * DRAW_TILE - camY - (h - DRAW_TILE), // anchor bottom
              w,
              h
            );
            continue;
          }

          // ✅ Sheet tileset
          if (!ts.columns || ts.columns <= 0) continue;

          const img = tilesetImages.get(ts.firstgid);
          if (!img) continue;

          if (id >= (ts.tilecount || 0)) continue;

          const sx =
            (ts.margin || 0) +
            (id % ts.columns) * (ts.tilewidth + (ts.spacing || 0));
          const sy =
            (ts.margin || 0) +
            Math.floor(id / ts.columns) * (ts.tileheight + (ts.spacing || 0));

          ctx.drawImage(
            img,
            sx, sy, ts.tilewidth, ts.tileheight,
            x * DRAW_TILE - camX,
            y * DRAW_TILE - camY,
            DRAW_TILE, DRAW_TILE
          );
        }
      }
    }

    // ---- TILE-OBJECTS (object layers with gid) ----
    for (const layer of map.layers) {
      if (layer.type !== "objectgroup" || !layer.visible) continue;

      for (const obj of layer.objects) {
        if (!obj.gid) continue;

        // IMPORTANT: if the object tile is animated, swap its gid BEFORE drawing
        let ogid = stripGidFlags(obj.gid);
        ogid = getAnimatedGid(ogid, now);

        // drawObjectTile expects an object with .gid
        // so we temporarily pass a shallow clone with the animated gid
        drawObjectTile({ ...obj, gid: ogid });
      }
    }

    // ---- GAME SPRITES ----
    hearts.forEach((_, key) => {
      const [x, y] = key.split(",").map(Number);
      drawSprite(spriteImgs.heart, x, y, SPRITE_SIZE_TILES.heart);
    });

    if (npc?.tx != null && npc?.ty != null) {
      drawSprite(spriteImgs.npc_bear_down, npc.tx, npc.ty, SPRITE_SIZE_TILES.bear);
    }

    const bearImg =
      player.dir === "up" ? spriteImgs.bear_up :
      player.dir === "left" ? spriteImgs.bear_left :
      player.dir === "right" ? spriteImgs.bear_right :
      spriteImgs.bear_down;

    const bearSize =
      (player.dir === "down" || player.dir === "left")
        ? { w: 2.3, h: 2.3 }
        : { w: 2, h: 2 };

    drawSprite(bearImg, player.tx, player.ty, bearSize);

    if (hasFlower) {
      drawSprite(spriteImgs.flower, player.tx, player.ty - 1, SPRITE_SIZE_TILES.flower);
    }

    // ---- DEBUG AREAS ----
    ctx.save();

    if (shopArea) {
      ctx.fillStyle = "rgba(255, 105, 180, 0.25)";
      ctx.strokeStyle = "rgba(255, 105, 180, 0.9)";
      ctx.lineWidth = 2;
      ctx.fillRect(shopArea.x - camX, shopArea.y - camY, shopArea.w, shopArea.h);
      ctx.strokeRect(shopArea.x - camX, shopArea.y - camY, shopArea.w, shopArea.h);
    }

    ctx.restore();

    // ---- HUD ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillRect(10, 10, 160, 28);
    ctx.fillStyle = "#000";
    ctx.fillText(`❤️ ${heartsCount}/${HEARTS_REQUIRED}`, 18, 30);
  }

  function playerCenterPx() {
    return {
      x: (player.tx + 0.5) * TILE_SIZE,
      y: (player.ty + 0.5) * TILE_SIZE,
    };
  }

  function pointInRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  function autoInteract() {
    const p = playerCenterPx();

    // ✅ SHOP via rectangle area
    if (shopArea && shop && pointInRect(p, shopArea)) {
      if (hasFlower) setMessage("You already bought it 🌸");
      else if (heartsCount >= shop.cost) {
        heartsCount -= shop.cost;
        hasFlower = true;
        setMessage(shop.successDialog);
      } else {
        setMessage(shop.dialog);
      }
    }

    // ✅ NPC via rectangle area
    if (npcArea && npc && pointInRect(p, npcArea)) {
      if (hasFlower) {
        setMessage(npc.successDialog);

        // ✅ SHOW WIN POPUP
        document.getElementById("heartsWinModal").classList.remove("hidden");

        // stop movement
        window.removeEventListener("keydown", keyHandler);
      }
      else {
        setMessage(npc.dialog);
      }
    }
  }




  /* ===================== GAMEPLAY ===================== */
  function tryMove(dx, dy, dir) {
    const now = performance.now();
    if (now - lastMoveAt < MOVE_COOLDOWN_MS) return;
    lastMoveAt = now;
    player.dir = dir;

    const nx = player.tx + dx;
    const ny = player.ty + dy;

    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) {
      setMessage("You can’t go that way Princess ❄️");
      return;
    }

    if (blocked[ny]?.[nx]) {
    //  setMessage("woopsie! ❄️");
      return;
    }

    player.tx = nx;
    player.ty = ny;

    const h = hearts.get(keyXY(nx, ny));
    if (h) {
      hearts.delete(keyXY(nx, ny));
      heartsCount += h.value;
      setMessage(getUniqueHeartDialog());
    }

    autoInteract();
    draw();
  }

  function interact() {
    const dx = player.dir === "left" ? -1 : player.dir === "right" ? 1 : 0;
    const dy = player.dir === "up" ? -1 : player.dir === "down" ? 1 : 0;

    const tx = player.tx + dx;
    const ty = player.ty + dy;

    const hitShop = shop && shop.tx === tx && shop.ty === ty;
    const hitNpc  = npc  && npc.tx  === tx && npc.ty  === ty;

    if (hitShop) {
      if (hasFlower) setMessage("You already bought it 🌸");
      else if (heartsCount >= shop.cost) {
        heartsCount -= shop.cost;
        hasFlower = true;
        setMessage(shop.successDialog);
      } else {
        setMessage(shop.dialog);
      }
      draw();
      return;
    }

    if (hitNpc) {
      if (hasFlower) {
        setMessage(npc.successDialog);
        // ✅ win condition — you can switch screens here if you want
        // showScreen("memWin") or a hearts win screen if you have one
        window.removeEventListener("keydown", keyHandler);
      } else {
        setMessage(npc.dialog);
      }
      draw();
      return;
    }

    setMessage("Nothing to interact with here 💙");
    draw();
  }


  /* ===================== CONTROLS ===================== */
  function startControls() {
    keyHandler = (e) => {
      if (!document.getElementById("screen-hearts").classList.contains("active")) return;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","Enter"].includes(e.key)) e.preventDefault();

      if (e.key === "ArrowUp") tryMove(0, -1, "up");
      if (e.key === "ArrowDown") tryMove(0, 1, "down");
      if (e.key === "ArrowLeft") tryMove(-1, 0, "left");
      if (e.key === "ArrowRight") tryMove(1, 0, "right");
      if (e.key === " " || e.key === "Enter") interact();
    };
    window.addEventListener("keydown", keyHandler, { passive: false });
  }

  // ✅ WIN MODAL MENU BUTTON
  document.getElementById("winMenuBtn").addEventListener("click", () => {
    document.getElementById("heartsWinModal").classList.add("hidden");

    // go back to menu screen
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById("screen-menu").classList.add("active");
  });


  /* ===================== LOAD ===================== */

  // 1) UPDATED: parseTsxToTileset (adds tile.animation support)
  function parseTsxToTileset(tsxText) {
    const xml = new DOMParser().parseFromString(tsxText, "text/xml");
    const tsNode = xml.querySelector("tileset");
    if (!tsNode) throw new Error("Invalid TSX (no <tileset>)");

    const tilewidth  = Number(tsNode.getAttribute("tilewidth"));
    const tileheight = Number(tsNode.getAttribute("tileheight"));
    const spacing    = Number(tsNode.getAttribute("spacing") || 0);
    const margin     = Number(tsNode.getAttribute("margin") || 0);
    const tilecount  = Number(tsNode.getAttribute("tilecount") || 0);
    let columns      = Number(tsNode.getAttribute("columns") || 0);

    const imgNode = xml.querySelector("image");
    const image = imgNode?.getAttribute("source");
    const imagewidth  = Number(imgNode?.getAttribute("width") || 0);
    const imageheight = Number(imgNode?.getAttribute("height") || 0);

    // If columns missing, compute it
    if (!columns && imagewidth && tilewidth) {
      columns = Math.floor((imagewidth - margin * 2 + spacing) / (tilewidth + spacing));
    }

    // Parse <tile> for properties + per-tile images + animations
    const tiles = [];
    const tileImages = new Map();

    xml.querySelectorAll("tile").forEach(tileEl => {
      const id = Number(tileEl.getAttribute("id"));

      // properties
      const props = [];
      tileEl.querySelectorAll("properties > property").forEach(p => {
        const name = p.getAttribute("name");
        const type = p.getAttribute("type") || "string";
        let value = p.getAttribute("value");
        if (value === null) value = p.textContent;

        if (type === "bool") value = value === "true";
        else if (type === "int" || type === "float") value = Number(value);

        props.push({ name, value });
      });

      // collection tileset per-tile image
      const img = tileEl.querySelector("image")?.getAttribute("source");
      if (img) tileImages.set(id, img);

      // animation frames (tileid + duration)
      const anim = [];
      tileEl.querySelectorAll("animation > frame").forEach(fr => {
        anim.push({
          tileid: Number(fr.getAttribute("tileid")),
          duration: Number(fr.getAttribute("duration")) // ms
        });
      });

      tiles.push({
        id,
        properties: props,
        animation: anim.length ? anim : null
      });
    });

    const isCollection = columns === 0 && tileImages.size > 0;

    return {
      tilewidth, tileheight, spacing, margin, tilecount, columns,
      image, imagewidth, imageheight,
      tiles,
      isCollection,
      tileImages
    };
  }


  // 2) NEW: animation helper (returns the current frame gid for animated tiles)
  animStart = performance.now();

  function getAnimatedGid(gid, now) {
    const ts = findTilesetForGid(gid);
    if (!ts || !ts.tiles) return gid;

    const localId = gid - ts.firstgid;
    const tile = ts.tiles.find(t => t.id === localId);
    const anim = tile?.animation;
    if (!anim || anim.length === 0) return gid;

    let total = 0;
    for (const f of anim) total += f.duration;
    if (total <= 0) return gid;

    const t = (now - animStart) % total;

    let acc = 0;
    for (const f of anim) {
      acc += f.duration;
      if (t < acc) return ts.firstgid + f.tileid; // frame tileid is local to tileset
    }

    return gid;
  }


  // 3) NEW: render loop so animations keep updating (not only on movement)
  let __animRAF = null;

  function startRenderLoop() {
    if (__animRAF) cancelAnimationFrame(__animRAF);

    const loop = () => {
      // only animate while hearts screen is active
      if (document.getElementById("screen-hearts")?.classList.contains("active")) {
        draw();
      }
      __animRAF = requestAnimationFrame(loop);
    };

    __animRAF = requestAnimationFrame(loop);
  }



  async function loadAll() {
    map = await (await fetch(MAP_URL)).json();

    const objLayer = map.layers.find(l => l.type === "objectgroup" && l.name === "Objects");
    console.log("Objects with gid (tile-objects):", objLayer?.objects?.filter(o => o.gid).length);


    const resolved = [];
    tilesetImages = new Map();
    collectionTileImages = new Map();

    for (const t of map.tilesets) {
      if (t.source) {
        const tsxUrl = new URL(t.source, MAP_URL).toString();
        const res = await fetch(tsxUrl);
        if (!res.ok) throw new Error(`TSX not found (${res.status}): ${tsxUrl}`);

        const tsxText = await res.text();
        const meta = parseTsxToTileset(tsxText);

        // Detect collection tileset (columns=0)
        const isCollection =
          (!meta.columns || meta.columns <= 0) &&
          meta.tileImages &&
          (meta.tileImages instanceof Map ? meta.tileImages.size > 0 : Object.keys(meta.tileImages).length > 0);

        resolved.push({ firstgid: t.firstgid, ...meta, isCollection });

        if (isCollection) {
          // Load per-tile images
          const perTile = new Map();
          const entries = meta.tileImages instanceof Map ? meta.tileImages.entries() : Object.entries(meta.tileImages);

          for (const [tileIdRaw, rel] of entries) {
            const tileId = Number(tileIdRaw);
            const url = new URL(rel, tsxUrl).toString();
            const img = new Image();
            img.src = url;
            await img.decode();
            perTile.set(tileId, img);
          }
          collectionTileImages.set(t.firstgid, perTile);
        } else {
          // Normal sheet tileset
          if (!meta.columns || !meta.tilewidth || !meta.tileheight) {
            console.warn("Bad TSX meta (columns/tile size missing):", tsxUrl, meta);
          }
          if (!meta.image) {
            console.warn("TSX has no tileset <image>:", tsxUrl);
          } else {
            const imageUrl = new URL(meta.image, tsxUrl).toString();
            const img = new Image();
            img.src = imageUrl;
            await img.decode();
            tilesetImages.set(t.firstgid, img);
          }
        }
      } else {
        // Embedded tileset (sheet)
        resolved.push({ ...t, isCollection: false });

        const imageUrl = new URL(t.image, MAP_URL).toString();
        const img = new Image();
        img.src = imageUrl;
        await img.decode();
        tilesetImages.set(t.firstgid, img);
      }
    }

    tilesets = resolved.sort((a, b) => a.firstgid - b.firstgid);

    for (const k in SPRITES) spriteImgs[k] = await loadImage(SPRITES[k]);

    buildBlockedGrid();
    parseObjects();
    updateCamera();
    draw();
  }


  window.startHeartsGame = async () => {
    heartsCount = 0;
    hasFlower = false;
    await loadAll();
    setMessage("Collect hearts 💙 Buy a flower 🌸 Deliver it!");
    startControls();
    startRenderLoop();
  };
})();

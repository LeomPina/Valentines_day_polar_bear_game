(() => {
  const audio = document.getElementById("bgMusic");
  const musicUI = document.getElementById("musicPlayer");
  const muteBtn = document.getElementById("muteBtn");
  const volumeSlider = document.getElementById("volumeSlider");

  if (!audio || !musicUI || !muteBtn || !volumeSlider) {
    console.warn("Music UI/audio element missing.");
    return;
  }

  const tracks = [
    "assets/music/1.m4a",
    "assets/music/2.m4a",
    "assets/music/3.m4a",
    "assets/music/4.m4a",
  ];

  let currentTrack = 0;
  let needsUserGestureToStart = false;

  // Restore saved settings
  const savedVol = localStorage.getItem("musicVol");
  const savedMuted = localStorage.getItem("musicMuted");

  audio.volume = savedVol !== null ? Number(savedVol) : 0.99;
  audio.muted = savedMuted === "true";

  muteBtn.textContent = audio.muted ? "🔇" : "🔊";
  volumeSlider.value = String(audio.volume);

  // 🎨 Update slider fill visually (cross-browser)
  function updateFill() {
    const pct = (volumeSlider.value / volumeSlider.max) * 100;
    volumeSlider.style.setProperty("--fill", pct + "%");
  }

  // Initial paint
  updateFill();

  function playTrack(index) {
    currentTrack = ((index % tracks.length) + tracks.length) % tracks.length;
    audio.src = tracks[currentTrack];
    audio.load();
  }

  function nextTrack() {
    playTrack(currentTrack + 1);
    audio.play().catch(() => {
      needsUserGestureToStart = true;
      musicUI.classList.add("hidden");
    });
  }

  audio.loop = false;
  audio.addEventListener("ended", nextTrack);

  muteBtn.addEventListener("click", () => {
    audio.muted = !audio.muted;
    muteBtn.textContent = audio.muted ? "🔇" : "🔊";
    localStorage.setItem("musicMuted", String(audio.muted));
  });

  volumeSlider.addEventListener("input", (e) => {
    audio.volume = Number(e.target.value);
    localStorage.setItem("musicVol", String(audio.volume));

    updateFill();
  });

  async function tryAutoplay() {
    try {
      await audio.play();
      needsUserGestureToStart = false;
      // ✅ Autoplay worked → show UI immediately (optional but nice)
      musicUI.classList.remove("hidden");
    } catch (e) {
      needsUserGestureToStart = true;
      // ✅ Autoplay blocked → keep UI hidden until username confirm
      musicUI.classList.add("hidden");
    }
  }

  // Called after username confirm click
  window.maybeStartBackgroundMusic = async () => {
    // Always show UI once she confirmed username
    musicUI.classList.remove("hidden");

    // If already playing, don't restart
    if (!audio.paused) return;

    try {
      await audio.play();
      needsUserGestureToStart = false;
    } catch (e) {
      // Still blocked or other issue — UI stays visible so she can try mute/volume later
    }
  };

  // Init
  playTrack(currentTrack);
  tryAutoplay();
})();

// game.js - copy-paste file
(() => {
  // Canvas & context
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // UI elements
  const startDialog = document.getElementById('startDialog');
  const startBtn = document.getElementById('startBtn');
  const loaderText = document.getElementById('loaderText');

  // Asset filenames (must exist exactly as named)
  const ASSETS = {
    Front: 'Front.png',
    Back: 'Back.PNG',       // note uppercase .PNG
    Health: 'Health.PNG',
    Dead: 'Dead.PNG',
    Bg: 'Bg.png',
    Sun: 'sun.png'
  };

  // Web-hosted short sounds (small)
  const SOUND_ORB_SPAWN = 'https://actions.google.com/sounds/v1/cartoon/pop.ogg';
  const SOUND_ORB_COLLECT = 'https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg';
  const audioSpawn = new Audio(SOUND_ORB_SPAWN);
  const audioCollect = new Audio(SOUND_ORB_COLLECT);

  // Images store
  const imgs = {};
  let imagesToLoad = Object.keys(ASSETS).length;
  let imagesLoaded = 0;

  // Preload images with progress
  function preloadImages() {
    return new Promise((resolve) => {
      imagesLoaded = 0;
      Object.entries(ASSETS).forEach(([key, src]) => {
        const img = new Image();
        img.onload = () => {
          imgs[key] = img;
          imagesLoaded++;
          loaderText.textContent = `Loading assets... ${Math.round((imagesLoaded / imagesToLoad) * 100)}%`;
          if (imagesLoaded === imagesToLoad) resolve();
        };
        img.onerror = () => {
          // still count as loaded but set as null to fallback to procedural drawing
          imgs[key] = null;
          imagesLoaded++;
          loaderText.textContent = `Loading assets... ${Math.round((imagesLoaded / imagesToLoad) * 100)}%`;
          if (imagesLoaded === imagesToLoad) resolve();
        };
        img.src = src;
      });
    });
  }

  // GAME STATE
  let running = false;
  let lastTime = 0;
  let raf = null;

  let timeLeft = 60.0; // seconds to night
  let score = 0;

  const player = {
    x: window.innerWidth / 2,
    y: window.innerHeight - 135,
    w: 120, h: 140,
    dir: 'back',
    targetX: window.innerWidth / 2,
    ease: 0.16
  };

  // Plants list: random positions middle region
  const plants = [];
  function spawnPlants() {
    plants.length = 0;
    const count = 4 + Math.floor(Math.random() * 2); // 4..5
    const margin = 90;
    for (let i = 0; i < count; i++) {
      const px = margin + Math.random() * (canvas.width - margin * 2);
      const py = canvas.height * 0.36 + Math.random() * (canvas.height * 0.18);
      plants.push({
        x: px,
        y: py,
        w: 110,
        h: 78,
        thirst: 100,
        alive: true,
        grow: 0
      });
    }
  }

  // Drops (water thrown)
  const drops = [];

  // Orb: only one at a time
  let orb = null;
  let lastOrbSpawn = 0;

  // Sunlight meter / super
  let sunlightMeter = 0;
  let superReady = false;

  // Particles
  const particles = [];

  // Sound helpers via WebAudio for splash (optional fallback)
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = AudioCtx ? new AudioCtx() : null;
  function playSplash(volume = 0.16, freq = 700, dur = 0.25) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, audioCtx.currentTime);
    g.gain.setValueAtTime(volume, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  }

  // Input: touch & mouse swipe
  let touchStart = null;
  canvas.addEventListener('touchstart', e => { touchStart = e.touches[0]; }, { passive: true });
  canvas.addEventListener('touchend', e => {
    if (!touchStart) return;
    const te = e.changedTouches[0];
    handleSwipe(te.clientX, te.clientY, touchStart.clientX, touchStart.clientY);
    touchStart = null;
  }, { passive: true });

  // Mouse fallback
  let mouseDown = null;
  canvas.addEventListener('mousedown', e => { mouseDown = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('mouseup', e => {
    if (!mouseDown) return;
    handleSwipe(e.clientX, e.clientY, mouseDown.x, mouseDown.y);
    mouseDown = null;
  });

  function handleSwipe(endX, endY, startX, startY) {
    const dx = endX - startX, dy = endY - startY;
    // horizontal move near bottom
    if (Math.abs(dy) < 50 && Math.abs(dx) > 20 && startY > (canvas.height - 180)) {
      player.targetX = Math.max(80, Math.min(canvas.width - 80, player.x + dx));
      return;
    }
    // upward swipe -> throw
    if (dy < -28) {
      if (superReady) {
        // super throw: refill all plants
        plants.forEach(p => {
          if (p.alive) { p.thirst = 100; p.grow = 1; }
        });
        sunlightMeter = 0; superReady = false;
        // big particles + sound
        plants.forEach(p => {
          for (let k = 0; k < 28; k++) {
            particles.push({ x: p.x + (Math.random() - 0.5) * 80, y: p.y + (Math.random() - 0.5) * 40, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 6, life: 800 });
          }
        });
        playSplash(0.44, 380, 0.6);
        score += 24;
      } else {
        // normal throw: spawn drop with arc
        player.dir = 'front';
        setTimeout(() => player.dir = 'back', 220);
        drops.push({ x: player.x, y: player.y, vx: dx / 18, vy: dy / 36, life: 4500 });
      }
    }
  }

  // Utility collision for drops-hit-plant
  function dropHitsPlant(drop, plant) {
    const px = plant.x - plant.w / 2, py = plant.y - plant.h / 2;
    return drop.x > px && drop.x < px + plant.w && drop.y > py && drop.y < py + plant.h;
  }

  // Spawn single orb (if none exists)
  function spawnOrb() {
    if (orb) return;
    // spawn x under sun region (top area)
    const margin = 80;
    const ox = margin + Math.random() * (canvas.width - margin * 2);
    orb = { x: ox, y: -12, r: 14, vy: 2.6 };
    // play spawn sound (web-hosted)
    try { audioSpawn.play(); } catch (e) {}
    lastOrbSpawn = performance.now();
  }

  // Reset round
  function resetRound() {
    timeLeft = 60;
    score = 0;
    sunlightMeter = 0;
    superReady = false;
    drops.length = 0;
    particles.length = 0;
    orb = null;
    spawnPlants();
    player.x = canvas.width / 2; player.targetX = player.x;
    running = true;
    lastTime = performance.now();
    raf = requestAnimationFrame(loop);
  }

  // Draw helpers
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawScene(now, dt) {
    // Background image or fallback
    if (imgs.Bg) {
      // cover-style draw
      const img = imgs.Bg;
      const ar = img.width / img.height;
      const car = canvas.width / canvas.height;
      let dw, dh, dx, dy;
      if (ar > car) { dh = canvas.height; dw = dh * ar; dx = -(dw - canvas.width) / 2; dy = 0; }
      else { dw = canvas.width; dh = dw / ar; dx = 0; dy = -(dh - canvas.height) / 2; }
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = '#cfeffd'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // day->night t (0..1)
    const t = Math.max(0, Math.min(1, 1 - (timeLeft / 60)));
    // sun x moves right->left
    const sunX = canvas.width - 110 - t * (canvas.width - 220);
    const sunY = 92;

    // draw sun (image or procedural)
    if (imgs.Sun) ctx.drawImage(imgs.Sun, sunX - 56, sunY - 56, 112, 112);
    else {
      const g = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 86);
      g.addColorStop(0, 'rgba(255,240,160,0.95)'); g.addColorStop(1, 'rgba(255,200,60,0.06)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sunX, sunY, 86, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,210,70,1)'; ctx.beginPath(); ctx.arc(sunX, sunY, 36, 0, Math.PI * 2); ctx.fill();
    }

    // draw plants
    for (let p of plants) {
      const px = p.x, py = p.y;
      // thirst bar above plant
      const bw = 84, bh = 10;
      const bx = px - bw / 2, by = py - p.h / 2 - 26;
      // background
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; roundRect(ctx, bx - 2, by - 2, bw + 4, bh + 4, 8); ctx.fill();
      // fill
      ctx.fillStyle = p.alive ? '#6fb6ff' : '#7a7a7a'; roundRect(ctx, bx, by, Math.max(2, (p.thirst / 100) * bw), bh, 6); ctx.fill();
      // outline
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.strokeRect(bx, by, bw, bh);

      // plant image choose
      if (!p.alive) {
        if (imgs.Dead) ctx.drawImage(imgs.Dead, px - p.w / 2, py - p.h / 2, p.w, p.h);
        else { ctx.fillStyle = '#7b4b2f'; ctx.fillRect(px - p.w / 2, py - p.h / 2, p.w, p.h); }
      } else {
        if (p.thirst <= 25) {
          if (imgs.Health) ctx.drawImage(imgs.Health, px - p.w / 2, py - p.h / 2, p.w, p.h);
          else { ctx.fillStyle = '#caa05a'; ctx.fillRect(px - p.w / 2, py - p.h / 2, p.w, p.h); }
        } else {
          if (imgs.Front) ctx.drawImage(imgs.Front, px - p.w / 2, py - p.h / 2, p.w, p.h);
          else { ctx.fillStyle = '#2e9b2e'; ctx.beginPath(); ctx.ellipse(px, py, p.w / 2, p.h / 2, 0, 0, Math.PI * 2); ctx.fill(); }
        }
      }
    }

    // orb beam/ orb
    if (orb) {
      // beam gradient
      const bx = orb.x, by = orb.y;
      const beamH = Math.max(0, by + 6);
      const grad = ctx.createLinearGradient(bx, 0, bx, beamH);
      grad.addColorStop(0, 'rgba(255,240,160,0.0)');
      grad.addColorStop(0.6, 'rgba(255,220,80,0.18)');
      grad.addColorStop(1, 'rgba(255,200,50,0.30)');
      ctx.fillStyle = grad; ctx.fillRect(bx - 18, 0, 36, beamH);

      // orb glow
      const g2 = ctx.createRadialGradient(bx, by, 0, bx, by, orb.r * 3);
      g2.addColorStop(0, 'rgba(255,238,120,0.95)'); g2.addColorStop(1, 'rgba(255,200,40,0.05)');
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(bx, by, orb.r * 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,210,60,1)'; ctx.beginPath(); ctx.arc(bx, by, orb.r, 0, Math.PI * 2); ctx.fill();
    }

    // draw drops
    ctx.save();
    for (let d of drops) {
      ctx.fillStyle = 'rgba(57,149,255,0.95)'; ctx.beginPath(); ctx.ellipse(d.x, d.y, 6, 8, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // draw player
    const dx = player.x - player.w / 2, dy = player.y;
    if (player.dir === 'front' && imgs.Front) ctx.drawImage(imgs.Front, dx, dy, player.w, player.h);
    else if (imgs.Back) ctx.drawImage(imgs.Back, dx, dy, player.w, player.h);
    else { ctx.fillStyle = '#5b3a2e'; ctx.fillRect(dx, dy, player.w, player.h); }

    // particles
    for (let p of particles) {
      const alpha = Math.max(0, Math.min(1, p.life / 600));
      ctx.fillStyle = `rgba(200,230,255,${alpha})`; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    }

    // UI: sunlight
    const ux = 16, uy = 16, uw = 220, uh = 22;
    roundRect(ctx, ux, uy, uw, uh, 12); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fill();
    ctx.fillStyle = '#ffb65e'; roundRect(ctx, ux + 2, uy + 2, Math.max(6, (sunlightMeter / 100) * (uw - 4)), uh - 4, 10); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.font = '12px system-ui, Arial'; ctx.textAlign = 'left'; ctx.fillText('Sunlight', ux + 6, uy + 15);

    // super ready
    if (superReady) {
      roundRect(ctx, canvas.width - 124, 14, 108, 28, 14); ctx.fillStyle = 'rgba(30,170,140,0.95)'; ctx.fill();
      ctx.fillStyle = 'white'; ctx.font = '12px system-ui, Arial'; ctx.textAlign = 'center'; ctx.fillText('SUPER READY', canvas.width - 124 + 54, 32);
    }

    // score bottom-left
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.font = '14px system-ui, Arial'; ctx.textAlign = 'left';
    ctx.fillText(`Score: ${score}`, 16, canvas.height - 18);

    // draw sun small arc to show time
    const pct = Math.max(0, Math.min(1, timeLeft / 60));
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(sunX, sunY + 94, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct); ctx.stroke();
  }

  // MAIN LOOP
  function loop(ts) {
    if (!lastTime) lastTime = ts;
    const dt = ts - lastTime;
    lastTime = ts;

    if (running) {
      // update
      // player ease
      player.x += (player.targetX - player.x) * player.ease;

      // update drops
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.x += d.vx; d.y += d.vy; d.vy += 0.28; d.life -= dt;
        // collision with plants
        let hit = false;
        for (let p of plants) {
          if (p.alive && dropHitsPlant(d, p)) {
            p.thirst = Math.min(100, p.thirst + 42);
            p.grow = 1.0;
            score += 6;
            // particles
            for (let k = 0; k < 10; k++) particles.push({ x: d.x + (Math.random() - 0.5) * 18, y: d.y + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3, life: 380 });
            playSplash(0.16, 700 - Math.random() * 200, 0.26);
            hit = true; break;
          }
        }
        if (hit || d.y > canvas.height + 80 || d.life <= 0 || d.x < -120 || d.x > canvas.width + 120) drops.splice(i, 1);
      }

      // orb update: falling
      if (orb) {
        orb.y += orb.vy;
        // check catch
        if (orb.y > canvas.height - 220 && Math.abs(orb.x - player.x) < 90) {
          // collect
          sunlightMeter = Math.min(100, sunlightMeter + 28);
          if (sunlightMeter >= 100) { sunlightMeter = 100; superReady = true; }
          // particles
          for (let i = 0; i < 12; i++) particles.push({ x: orb.x + (Math.random() - 0.5) * 24, y: orb.y + (Math.random() - 0.5) * 16, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 2, life: 320 });
          try { audioCollect.play(); } catch (e) {}
          orb = null;
        } else if (orb.y > canvas.height - 60) {
          // missed - small penalty to alive plants
          for (let p of plants) if (p.alive) p.thirst = Math.max(0, p.thirst - 10);
          orb = null;
        }
      } else {
        // spawn every ~5s
        if (!lastOrbSpawn || (performance.now() - lastOrbSpawn) > 5000) spawnOrb();
      }

      // update particles (physics)
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
      }

      // plants thirst decay & death
      for (let p of plants) {
        if (!p.alive) continue;
        p.thirst = Math.max(0, p.thirst - (0.9 * dt / 1000)); // tuned rate for balanced gameplay
        if (p.thirst <= 0) { p.alive = false; p.thirst = 0; }
        if (p.grow > 0) p.grow = Math.max(0, p.grow - (dt / 600));
      }

      // time update
      timeLeft -= dt / 1000;
      if (timeLeft <= 0) {
        running = false;
        // show Good night message
        showEndScreen();
      }
    }

    // draw
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawScene(ts, dt);

    raf = requestAnimationFrame(loop);
  }

  // show end overlay
  function showEndScreen() {
    // fade overlay + text
    ctx.fillStyle = 'rgba(0,0,0,0.48)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '44px system-ui, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Good night 💤', canvas.width / 2, canvas.height / 2);
  }

  // START/LOAD flow
  preloadImages().then(() => {
    loaderText.textContent = 'Assets loaded — Ready';
    startBtn.disabled = false;
  });

  startBtn.addEventListener('click', () => {
    startDialog.style.display = 'none';
    spawnPlants();
    lastTime = 0;
    running = true;
    lastOrbSpawn = performance.now() - 3000; // allow first orb a bit earlier
    raf = requestAnimationFrame(loop);
  });

  // make sure sounds can play on mobile after user interaction
  startBtn.addEventListener('click', () => { try { audioSpawn.play(); audioCollect.play(); } catch (e) {} if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); });

  // reset on spacebar (convenience)
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ' && !running) { timeLeft = 60; score = 0; spawnPlants(); running = true; lastTime = 0; raf = requestAnimationFrame(loop); startDialog.style.display = 'none'; }
  });

})();

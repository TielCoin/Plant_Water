// ====== Load Required PNGs ======
const playerFrontImg = new Image();
playerFrontImg.src = "Front.png";
const playerBackImg = new Image();
playerBackImg.src = "Back.PNG";

const plantHealthyImg = new Image();
plantHealthyImg.src = "Health.PNG";
const plantWitheredImg = new Image();
plantWitheredImg.src = "Dead.PNG";

// ====== Web Audio API for Splash Sound ======
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSplash() {
    let osc = audioCtx.createOscillator();
    let gainNode = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.connect(gainNode).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

// ====== Setup Canvas ======
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W, H;
function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// ====== Game State ======
let player = { x: W / 2, y: H - 150, w: 80, h: 100, dir: "back" };
let pots = [];
let waterDrops = [];
let sunOrbs = [];
let sunlightMeter = 0;
let score = 0;
let gameTime = 120; // seconds to night
let superThrowReady = false;

// ====== Spawn Pots ======
function spawnPots() {
    pots = [];
    for (let i = 0; i < 5; i++) {
        let px = Math.random() * (W - 100) + 50;
        let py = Math.random() * (H / 2) + H / 3;
        pots.push({
            x: px,
            y: py,
            w: 70,
            h: 60,
            thirst: 100,
            healthy: true,
            growAnim: 0 // animation progress for bloom
        });
    }
}
spawnPots();

// ====== Controls ======
let touchStart = null;
canvas.addEventListener("touchstart", e => {
    touchStart = e.touches[0];
});
canvas.addEventListener("touchend", e => {
    if (!touchStart) return;
    let touchEnd = e.changedTouches[0];
    let dx = touchEnd.clientX - touchStart.clientX;
    let dy = touchEnd.clientY - touchStart.clientY;

    // Move player horizontally
    if (Math.abs(dy) < 50 && Math.abs(dx) > 20 && touchStart.clientY > H - 200) {
        player.x += dx;
    }
    // Throw water
    else if (dy < -30) {
        player.dir = "front";
        if (superThrowReady) {
            pots.forEach(p => {
                p.thirst = 100;
                p.healthy = true;
                p.growAnim = 1;
            });
            superThrowReady = false;
            sunlightMeter = 0;
        } else {
            waterDrops.push({
                x: player.x,
                y: player.y,
                vx: dx / 25,
                vy: dy / 25
            });
        }
        setTimeout(() => player.dir = "back", 200);
    }
    touchStart = null;
});

// ====== Update ======
function update(dt) {
    // Water movement
    waterDrops.forEach(d => {
        d.x += d.vx;
        d.y += d.vy;
        d.vy += 0.3; // gravity
    });
    waterDrops = waterDrops.filter(d => d.y < H + 50);

    // Spawn sunlight orb
    if (Math.random() < 0.01) {
        sunOrbs.push({ x: Math.random() * (W - 30) + 15, y: -20, r: 15 });
    }
    sunOrbs.forEach(s => s.y += 2);

    // Collect sunlight
    sunOrbs = sunOrbs.filter(s => {
        if (Math.hypot(s.x - player.x, s.y - player.y) < s.r + player.w / 2) {
            sunlightMeter += 20;
            if (sunlightMeter >= 100) {
                sunlightMeter = 100;
                superThrowReady = true;
            }
            return false;
        }
        return s.y < H + 30;
    });

    // Water + pot collision
    waterDrops.forEach(d => {
        pots.forEach(p => {
            if (d.x > p.x && d.x < p.x + p.w &&
                d.y > p.y && d.y < p.y + p.h) {
                p.thirst = 100;
                p.healthy = true;
                p.growAnim = 1; // start bloom animation
                score += 10;
                playSplash();
                d.y = H + 100; // remove drop
            }
        });
    });

    // Thirst decay & plant health
    pots.forEach(p => {
        p.thirst -= 0.05 * dt;
        if (p.thirst <= 25) p.healthy = false;
        if (p.growAnim > 0) p.growAnim -= dt / 500; // bloom animation fade
        if (p.growAnim < 0) p.growAnim = 0;
    });

    // Game timer
    gameTime -= dt / 1000;
    if (gameTime <= 0) {
        alert(`Game Over! Score: ${score}`);
        spawnPots();
        gameTime = 120;
        score = 0;
        sunlightMeter = 0;
    }
}

// ====== Draw ======
function draw() {
    // Background (day-night transition)
    let t = 1 - gameTime / 120;
    ctx.fillStyle = `rgb(${200 - 100 * t}, ${230 - 80 * t}, ${255 - 200 * t})`;
    ctx.fillRect(0, 0, W, H);

    // Sun moving across sky
    ctx.fillStyle = "yellow";
    let sunX = W - 100 - t * (W - 200);
    ctx.beginPath();
    ctx.arc(sunX, 100, 50, 0, Math.PI * 2);
    ctx.fill();

    // Pots & plants
    pots.forEach(p => {
        // Draw pot (simple brown shape)
        ctx.fillStyle = "#8B4513";
        ctx.fillRect(p.x, p.y, p.w, p.h);

        // Plant image with growth animation
        let growScale = 1 + p.growAnim * 0.3;
        let plantImg = p.healthy ? plantHealthyImg : plantWitheredImg;
        ctx.drawImage(
            plantImg,
            p.x + p.w / 2 - (p.w / 2) * growScale,
            p.y - 80 * growScale,
            p.w * growScale,
            80 * growScale
        );
    });

    // Player
    ctx.drawImage(
        player.dir === "front" ? playerFrontImg : playerBackImg,
        player.x - player.w / 2,
        player.y,
        player.w,
        player.h
    );

    // Water drops
    ctx.fillStyle = "blue";
    waterDrops.forEach(d => {
        ctx.beginPath();
        ctx.arc(d.x, d.y, 5, 0, Math.PI * 2);
        ctx.fill();
    });

    // Sunlight orbs
    sunOrbs.forEach(s => {
        ctx.fillStyle = "yellow";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "orange";
        ctx.stroke();
    });

    // UI bars
    ctx.fillStyle = "orange";
    ctx.fillRect(10, 10, (sunlightMeter / 100) * 200, 15);
    ctx.strokeRect(10, 10, 200, 15);

    ctx.fillStyle = "blue";
    let avgThirst = pots.reduce((sum, p) => sum + p.thirst, 0) / pots.length;
    ctx.fillRect(10, 30, (avgThirst / 100) * 200, 15);
    ctx.strokeRect(10, 30, 200, 15);

    // Score & credits
    ctx.fillStyle = "black";
    ctx.font = "16px Arial";
    ctx.fillText(`Score: ${score}`, 10, 60);
    ctx.fillText(`Game by Balaji`, W - 150, 20);
}

// ====== Main Loop ======
let lastTime = 0;
function loop(timestamp) {
    let dt = timestamp - lastTime;
    lastTime = timestamp;
    update(dt);
    draw();
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

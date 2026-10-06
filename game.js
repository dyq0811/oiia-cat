(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = H - 40;

  const SPEEDS = [
    { name: 'Low', px: 240 },
    { name: 'Medium', px: 540 },
    { name: 'High', px: 720 },
  ];
  const GRAVITY = 2600;
  const JUMP_V = -860;
  const INK = '#535353';

  const speedBtns = [...document.querySelectorAll('.speed')];
  const pauseBtn = document.getElementById('pauseBtn');
  const micBtn = document.getElementById('micBtn');
  const micLevelEl = document.getElementById('micLevel');
  const micThresholdEl = document.getElementById('micThreshold');
  const sensitivityEl = document.getElementById('sensitivity');

  let state; // 'ready' | 'running' | 'paused' | 'over'
  let speedLevel, cat, obstacles, clouds, score, scroll, nextGap, lives, night, skyTime;
  let hiScore = Number(localStorage.getItem('oiiaHiScore')) || 0;
  const MAX_LIVES = 3;
  const HURT_TIME = 1.5;
  const DAY_LENGTH = 6;

  function reset() {
    state = 'ready';
    cat = { x: 60, y: GROUND_Y, vy: 0, w: 36, h: 48, spin: 0, onGround: true, hurt: 0 };
    lives = MAX_LIVES;
    night = 0;
    skyTime = 0;
    obstacles = [];
    clouds = [{ x: 140, y: 40 }, { x: 420, y: 70 }, { x: 700, y: 34 }];
    score = 0;
    scroll = 0;
    nextGap = 300;
    updatePauseBtn();
  }

  function setSpeed(level) {
    speedLevel = level;
    speedBtns.forEach((b, i) => b.classList.toggle('active', i === level));
  }

  function startGame() {
    if (state === 'over') reset();
    else if (state !== 'ready') return;
    state = 'running';
    updatePauseBtn();
  }

  function jump() {
    if (state !== 'running' || !cat.onGround) return false;
    cat.vy = JUMP_V;
    cat.onGround = false;
    return true;
  }

  function togglePause() {
    if (state === 'running') state = 'paused';
    else if (state === 'paused') state = 'running';
    updatePauseBtn();
  }

  function updatePauseBtn() {
    pauseBtn.textContent = state === 'paused' ? 'Resume (P)' : 'Pause (P)';
    pauseBtn.disabled = state !== 'running' && state !== 'paused';
  }

  // ---------- Input ----------
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (!e.repeat && jump()) playOi();
    } else if (e.code === 'Digit0' || e.code === 'Numpad0') {
      startGame();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      togglePause();
    } else if (e.code === 'KeyM') {
      micBtn.click();
    } else if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
      setSpeed(Number(e.code.slice(-1)) - 1);
    }
  });

  speedBtns.forEach((b) => b.addEventListener('click', () => { setSpeed(Number(b.dataset.speed)); b.blur(); }));
  pauseBtn.addEventListener('click', () => { togglePause(); pauseBtn.blur(); });
  canvas.addEventListener('pointerdown', jump);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'running') togglePause();
  });

  // ---------- Sound ----------
  let audioCtx;
  function getAudioCtx() {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // Synthesized "oi": a sawtooth voice through two formant filters gliding from "o" to "i".
  function playOi() {
    const ac = getAudioCtx();
    const t = ac.currentTime;

    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.linearRampToValueAtTime(640, t + 0.24);

    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.9, t + 0.02);
    out.gain.setValueAtTime(0.9, t + 0.2);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    out.connect(ac.destination);

    for (const [from, to, level] of [[550, 300, 1], [850, 2300, 0.6]]) {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 8;
      bp.frequency.setValueAtTime(from, t);
      bp.frequency.setValueAtTime(from, t + 0.08);
      bp.frequency.exponentialRampToValueAtTime(to, t + 0.2);
      const g = ac.createGain();
      g.gain.value = level;
      osc.connect(bp).connect(g).connect(out);
    }

    osc.start(t);
    osc.stop(t + 0.32);
  }

  const FORMANTS = { o: [500, 850], i: [300, 2300], a: [800, 1250] };

  function playVowel(v, pitch, dur) {
    const ac = getAudioCtx();
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(pitch * 0.92, t);
    osc.frequency.linearRampToValueAtTime(pitch, t + dur * 0.4);

    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.6, t + 0.012);
    out.gain.setValueAtTime(0.6, t + dur * 0.7);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(ac.destination);

    FORMANTS[v].forEach((f, k) => {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 8;
      bp.frequency.value = f;
      const g = ac.createGain();
      g.gain.value = k ? 0.6 : 1;
      osc.connect(bp).connect(g).connect(out);
    });

    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // ---------- Microphone ("oi!") ----------
  let analyser, micStream, micSource, micBuf, micArmed = true, lastShout = 0, bufferedUntil = 0;
  const MIC_MAX = 0.25;

  function micThreshold() {
    return MIC_MAX * (1 - sensitivityEl.value / 100) + 0.004;
  }
  function updateThresholdMarker() {
    micThresholdEl.style.left = `${Math.min(1, micThreshold() / MIC_MAX) * 100}%`;
  }
  sensitivityEl.addEventListener('input', updateThresholdMarker);
  updateThresholdMarker();

  function micOff() {
    micSource.disconnect();
    micStream.getTracks().forEach((t) => t.stop());
    analyser = micSource = micStream = null;
    bufferedUntil = 0;
    micLevelEl.style.width = '0';
    micBtn.textContent = '🎤 Mic: Off';
    micBtn.classList.remove('active');
  }

  micBtn.addEventListener('click', async () => {
    micBtn.blur();
    if (analyser) { micOff(); return; }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const actx = getAudioCtx();
      analyser = actx.createAnalyser();
      analyser.fftSize = 512;
      micBuf = new Float32Array(analyser.fftSize);
      micSource = actx.createMediaStreamSource(micStream);
      micSource.connect(analyser);
      micBtn.textContent = '🎤 Mic: On';
      micBtn.classList.add('active');
    } catch (err) {
      micBtn.textContent = 'Mic blocked';
      console.error(err);
    }
  });

  function pollMic(now) {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(micBuf);
    let sum = 0;
    for (let i = 0; i < micBuf.length; i++) sum += micBuf[i] * micBuf[i];
    const rms = Math.sqrt(sum / micBuf.length);
    micLevelEl.style.width = `${Math.min(1, rms / MIC_MAX) * 100}%`;

    const thr = micThreshold();
    // Rising-edge trigger so one shout = one jump.
    if (rms > thr && micArmed && now - lastShout > 150) {
      micArmed = false;
      lastShout = now;
      // A shout just before landing still counts.
      if (!jump()) bufferedUntil = now + 150;
    } else if (rms < thr * 0.75) {
      micArmed = true;
    }
    if (now < bufferedUntil && jump()) bufferedUntil = 0;
  }

  // ---------- Update ----------
  function makeObstacle(kind, count = 1) {
    const s = SPRITES[kind];
    const sw = s.map[0].length * s.p;
    const h = s.map.length * s.p;
    return { kind, x: W, y: GROUND_Y - h, w: sw * count + 4 * (count - 1), h, count, sw };
  }

  function spawnObstacle() {
    const r = Math.random();
    if (score > 200 && r < 0.2) {
      // Bee flies high (run under) or low (jump over).
      const o = makeObstacle('bee');
      o.y = GROUND_Y - (Math.random() < 0.5 ? 72 : 36);
      obstacles.push(o);
    } else if (r < 0.5) {
      obstacles.push(makeObstacle('cucumber', Math.random() < 0.3 ? 2 : 1));
    } else if (r < 0.75) {
      obstacles.push(makeObstacle('vacuum'));
    } else {
      obstacles.push(makeObstacle('spray'));
    }
  }

  function update(dt) {
    const v = SPEEDS[speedLevel].px;
    const dx = v * dt;

    cat.vy += GRAVITY * dt;
    cat.y += cat.vy * dt;
    if (cat.y >= GROUND_Y) {
      cat.y = GROUND_Y;
      cat.vy = 0;
      cat.onGround = true;
    }
    // OIIA spin while airborne; face forward on the ground.
    cat.spin = cat.onGround ? 0 : cat.spin + 22 * dt;

    scroll += dx;
    clouds.forEach((c) => {
      c.x -= dx * 0.15;
      if (c.x < -70) { c.x = W + Math.random() * 200; c.y = 30 + Math.random() * 50; }
    });

    obstacles.forEach((o) => { o.x -= dx * (o.kind === 'bee' ? 1.15 : 1); });
    obstacles = obstacles.filter((o) => o.x + o.w > 0);

    const last = obstacles[obstacles.length - 1];
    if (!last || W - (last.x + last.w) > nextGap) {
      spawnObstacle();
      nextGap = v * (1.1 + Math.random() * 1.2) + 220;
    }

    score += dx * 0.025;
    skyTime += dt;
    night = getSkyState(skyTime).darkness;
    cat.hurt = Math.max(0, cat.hurt - dt);
    if (cat.hurt > 0) return;

    // Hitbox is a bit smaller than the sprite for fairness.
    const cx = cat.x + 6, cy = cat.y - cat.h + 6, cw = cat.w - 12, ch = cat.h - 8;
    for (const o of obstacles) {
      if (cx < o.x + o.w && cx + cw > o.x && cy < o.y + o.h && cy + ch > o.y) {
        lives--;
        if (lives > 0) {
          cat.hurt = HURT_TIME;
          break;
        }
        state = 'over';
        if (score > hiScore) {
          hiScore = Math.floor(score);
          localStorage.setItem('oiiaHiScore', hiScore);
        }
        updatePauseBtn();
        break;
      }
    }
  }

  // ---------- Draw ----------
  // Pixel maps: '.' is transparent, other chars index into a palette.
  const CLOUD = [
    '.....XXXX.......',
    '...XXXXXXXX.XX..',
    '..XXXXXXXXXXXXX.',
    '.XXXXeXXXeXXXXXX',
    'XXXXpXmmXpXXXXXX',
    'XXXXXXXXXXXXXXXX',
    '.SSSSSSSSSSSSSS.',
  ];
  const CLOUD_COLORS = { X: '#ffffff', S: '#e6ecf7', e: '#5a4a6a', m: '#5a4a6a', p: '#ffb8cc' };
  const SUN = [
    '...YYYY...',
    '.YYYYYYYY.',
    'YYYYYYYYYY',
    'YYeYYYYeYY',
    'YYYYYYYYYY',
    'YpYYmmYYpY',
    'YYYYYYYYYY',
    '.YYYYYYYY.',
    '...YYYY...',
  ];
  const SUN_COLORS = { Y: '#ffd66e', e: '#6b4a3a', m: '#6b4a3a', p: '#ff9eb5' };

  const SPRITES = {
    cucumber: {
      p: 4,
      map: [
        '.ggg.',
        'gGGGg',
        'GeGeG',
        'GpmpG',
        'GGGGG',
        'GGgGG',
        'GGGGG',
        'GgGGG',
        '.GGG.',
      ],
      colors: { G: '#6dbf4b', g: '#a3e27f', e: '#2f3b2a', m: '#2f3b2a', p: '#ff9eb5' },
    },
    vacuum: {
      p: 4,
      map: [
        '.....HHH.',
        '......H..',
        '.RRRRRH..',
        'RRRRRRRR.',
        'RReRReRRR',
        'RRRmmRRRR',
        'RRRRRRRRR',
        'SSSSSSSSS',
        '.K.....K.',
      ],
      colors: { R: '#ff8a9a', H: '#8a8a9a', e: '#2b2b3a', m: '#2b2b3a', S: '#d9d9e3', K: '#4a4a5a' },
    },
    spray: {
      p: 4,
      map: [
        '.TTTT.',
        '.TTTTN',
        '..TT..',
        '.BBBB.',
        'BBBBBB',
        'BeBBeB',
        'BBmmBB',
        'BWBBBB',
        'BWBBBB',
        '.BBBB.',
      ],
      colors: { T: '#9b7bff', N: '#7a5cf0', B: '#7ec8ff', W: '#d6f0ff', e: '#24425a', m: '#24425a' },
    },
    bee: {
      p: 3,
      map: [
        '...WW.WW..',
        '...WWWWW..',
        '.YYKYYKY..',
        'YeYKYYKYY.',
        'YYYKYYKYYK',
        '.YYKYYKY..',
      ],
      colors: { W: '#e8f6ff', Y: '#ffd23f', K: '#3b2f2f', e: '#3b2f2f' },
    },
  };

  function drawPixels(map, colors, x, y, p, target = ctx) {
    x = Math.round(x);
    map.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] === '.') continue;
        target.fillStyle = colors[row[c]];
        target.fillRect(x + c * p, y + r * p, p, p);
      }
    });
  }

  function getSkyState(time) {
    const phase = (time % (DAY_LENGTH * 2)) / (DAY_LENGTH * 2);
    const progress = (phase * 4) % 1;
    const blend = progress ** 3 * (progress * (progress * 6 - 15) + 10);
    const altitude = Math.cos(phase * Math.PI * 2);
    return { phase, band: Math.floor(phase * 4), blend, altitude, darkness: (1 - altitude) / 2 };
  }

  function mixColor(from, to, amount) {
    const channels = [1, 3, 5].map((offset) => {
      const start = parseInt(from.slice(offset, offset + 2), 16);
      const end = parseInt(to.slice(offset, offset + 2), 16);
      return Math.round(start + (end - start) * amount);
    });
    return `rgb(${channels.join(',')})`;
  }

  function createSkyLayer(bands) {
    const layer = document.createElement('canvas');
    layer.width = W;
    layer.height = H;
    const g = layer.getContext('2d');
    const bandH = GROUND_Y / bands.length;
    const P = 6;
    bands.forEach((col, i) => {
      g.fillStyle = col;
      g.fillRect(0, i * bandH, W, bandH + 1);
      if (i === 0) return;
      g.fillStyle = bands[i - 1];
      for (let x = 0; x < W; x += P) {
        if ((x / P) % 2 === 0) g.fillRect(x, i * bandH, P, P);
      }
    });
    return layer;
  }

  const skyLayers = [
    ['#c8e6ff', '#d7edff', '#e6f3ff', '#f6eefb', '#ffe8f0', '#fff0e4'],
    ['#555778', '#826382', '#b7758c', '#eb9291', '#ffb18b', '#ffd697'],
    ['#1b1e45', '#232757', '#2c3068', '#363a78', '#434584', '#52518f'],
    ['#6679a1', '#9396b8', '#bdb0cc', '#e7bfd1', '#ffd4be', '#ffe7bc'],
  ].map(createSkyLayer);

  const MOON = [
    '..MMMMM..',
    '.MMMMMMM.',
    'MMMMMMMMM',
    'MeeMMMeeM',
    'MMMMMMMMM',
    'MpMMmMMpM',
    'MMMMMMMMM',
    '.MMMMMMM.',
    '..MMMMM..',
  ];
  const MOON_COLORS = { M: '#fff4c8', e: '#6b5a7a', m: '#6b5a7a', p: '#ffb8cc' };
  const STARS = Array.from({ length: 40 }, (_, i) => [
    (i * 197 + 37) % W,
    56 + ((i * 89) % (GROUND_Y - 130)),
    i % 3 === 0 ? 3 : 2,
  ]);

  function drawHills(offset, P, base, amp, freq, seed, color, topColor) {
    const first = Math.floor(offset / P);
    const shift = offset - first * P;
    for (let i = 0; i <= W / P + 1; i++) {
      const n = first + i;
      const wave = Math.sin(n * freq + seed) * 0.65 + Math.sin(n * freq * 2.3 + seed * 3) * 0.35;
      const hgt = Math.round((base + amp * wave) / P) * P;
      const x = Math.floor(i * P - shift);
      ctx.fillStyle = color;
      ctx.fillRect(x, GROUND_Y - hgt, P + 1, hgt);
      ctx.fillStyle = topColor;
      ctx.fillRect(x, GROUND_Y - hgt, P + 1, P);
    }
  }

  const FLOWER_COLORS = ['#ff9eb5', '#ffd66e', '#c9a7ff', '#ffffff'];

  function drawGround() {
    const T = 10;
    const first = Math.floor(scroll / T);
    const shift = scroll - first * T;
    for (let i = 0; i <= W / T + 1; i++) {
      const n = first + i;
      const x = Math.floor(i * T - shift);
      // Grass: two rows of 5px mosaic
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          ctx.fillStyle = (n * 2 + c + r) % 2 ? '#8fd694' : '#7ccb85';
          ctx.fillRect(x + c * 5, GROUND_Y + r * 5, 6, 5);
        }
      }
      // Soil: checkerboard tiles
      for (let r = 0; r < 3; r++) {
        ctx.fillStyle = (n + r) % 2 ? '#f4dcb6' : '#ecd0a6';
        ctx.fillRect(x, GROUND_Y + 10 + r * 10, T + 1, 10);
      }
      // Deterministic sprinkle of tiny flowers and pebbles
      const hash = (n * 2654435761) >>> 0;
      if (hash % 9 === 0) {
        ctx.fillStyle = FLOWER_COLORS[(hash >>> 8) % FLOWER_COLORS.length];
        ctx.fillRect(x + 3, GROUND_Y - 3, 3, 3);
        ctx.fillRect(x, GROUND_Y, 3, 3);
        ctx.fillRect(x + 6, GROUND_Y, 3, 3);
        ctx.fillStyle = '#ffe9a8';
        ctx.fillRect(x + 3, GROUND_Y, 3, 3);
      } else if (hash % 7 === 0) {
        ctx.fillStyle = '#d9bd92';
        ctx.fillRect(x + 2, GROUND_Y + 20, 4, 3);
      }
    }
  }

  const SPRITE = 76;
  const catImg = new Image();
  catImg.src = 'oiia.png';

  function drawCat() {
    const { x, y, w, h } = cat;
    // Blink while invincible after a hit.
    const visible = cat.hurt === 0 || Math.floor(cat.hurt * 10) % 2 === 0;
    ctx.save();
    ctx.translate(x + w / 2, y);
    // Fake Y-axis rotation by squashing horizontally.
    const sx = Math.cos(cat.spin);
    ctx.scale(Math.abs(sx) < 0.08 ? 0.08 : sx, 1);
    // Cat's feet sit ~93% down the frame, body centred at ~46% across.
    if (visible) ctx.drawImage(catImg, -SPRITE * 0.46, -SPRITE * 0.93, SPRITE, SPRITE);
    ctx.restore();

    if (!cat.onGround) {
      ctx.fillStyle = INK;
      ctx.font = 'bold 14px monospace';
      const letters = ['O', 'I', 'I', 'A'];
      ctx.fillText(letters[Math.floor(cat.spin / 1.2) % 4], x + w + 4, y - h - 4);
    }
  }

  const HEART = [
    '.XX.XX.',
    'XhXXXXX',
    'XXXXXXX',
    '.XXXXX.',
    '..XXX..',
    '...X...',
  ];
  const HEART_FULL = { X: '#ff5c8a', h: '#ffffff' };
  const HEART_EMPTY = { X: '#cfc6d6', h: '#cfc6d6' };

  function drawObstacle(o) {
    const s = SPRITES[o.kind];
    const bob = o.kind === 'bee' ? Math.round(Math.sin(scroll * 0.06)) * 3 : 0;
    ctx.save();
    ctx.globalAlpha = 1;
    for (let i = 0; i < o.count; i++) {
      const x = Math.round(o.x + i * (o.sw + 4));
      const y = o.y + bob;
      for (const [width, color] of [[2, '#fff9e8'], [1, '#535353']]) {
        ctx.fillStyle = color;
        s.map.forEach((row, rowIndex) => {
          for (let column = 0; column < row.length; column++) {
            if (row[column] === '.') continue;
            ctx.fillRect(x + column * s.p - width, y + rowIndex * s.p - width,
              s.p + width * 2, s.p + width * 2);
          }
        });
      }
      drawPixels(s.map, s.colors, x, y, s.p);
    }
    ctx.restore();
  }

  function draw() {
    const sky = getSkyState(skyTime);
    ctx.drawImage(skyLayers[sky.band], 0, 0);
    ctx.globalAlpha = sky.blend;
    ctx.drawImage(skyLayers[(sky.band + 1) % skyLayers.length], 0, 0);
    ctx.globalAlpha = 1;
    const orbit = Math.sin(sky.phase * Math.PI * 2);
    const warmth = (1 - Math.abs(sky.altitude)) ** 3;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 28, W, GROUND_Y - 28);
    ctx.clip();
    ctx.globalAlpha = Math.max(0, Math.min(1, (sky.altitude + 0.15) / 0.35));
    drawPixels(SUN, { ...SUN_COLORS, Y: mixColor('#ffd66e', '#ff987a', warmth) },
      W / 2 - 25 + orbit * 240, GROUND_Y - 90 - sky.altitude * 90, 5);
    ctx.globalAlpha = Math.max(0, Math.min(1, (-sky.altitude + 0.15) / 0.35));
    drawPixels(MOON, MOON_COLORS,
      W / 2 - 22 - orbit * 240, GROUND_Y - 90 + sky.altitude * 90, 5);
    const starVisibility = Math.max(0, (night - 0.5) * 2);
    STARS.forEach(([sx, sy, size], index) => {
      const sparkle = (1 + Math.sin(skyTime * 2 + index * 1.7)) / 2;
      ctx.globalAlpha = starVisibility * (0.55 + sparkle * 0.45);
      ctx.fillStyle = '#fff4d9';
      ctx.fillRect(sx, sy, size, size);
      ctx.globalAlpha *= sparkle ** 4;
      if (index % 3 === 0) {
        ctx.fillRect(sx - 2, sy + 1, 6, 1);
        ctx.fillRect(sx + 1, sy - 2, 1, 6);
      }
    });
    ctx.globalAlpha = 1 - night;
    const cloudColors = {
      ...CLOUD_COLORS,
      X: mixColor('#ffffff', '#ffc4b6', warmth),
      S: mixColor('#e6ecf7', '#d595ab', warmth),
    };
    clouds.forEach((c) => drawPixels(CLOUD, cloudColors, c.x, c.y, 4));
    ctx.restore();
    drawHills(scroll * 0.2, 10, 70, 22, 0.13, 0.7, '#cfe9e4', '#e2f4ef');
    drawHills(scroll * 0.45, 8, 38, 14, 0.21, 2.1, '#a8dcb4', '#c2ead0');
    drawGround();
    ctx.fillStyle = `rgba(255, 153, 117, ${warmth * 0.18})`;
    ctx.fillRect(0, GROUND_Y - 100, W, H - GROUND_Y + 100);
    if (night > 0) {
      ctx.fillStyle = `rgba(20, 22, 60, ${0.35 * night})`;
      ctx.fillRect(0, GROUND_Y - 100, W, H - GROUND_Y + 100);
    }
    obstacles.forEach(drawObstacle);
    drawCat();

    for (let i = 0; i < MAX_LIVES; i++) {
      drawPixels(HEART, i < lives ? HEART_FULL : HEART_EMPTY, 12 + i * 26, 34, 3);
    }

    ctx.fillStyle = mixColor(INK, '#f3efff', night);
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`HI ${String(hiScore).padStart(5, '0')}  ${String(Math.floor(score)).padStart(5, '0')}`, W - 12, 24);
    ctx.textAlign = 'left';
    ctx.fillText(`SPEED: ${SPEEDS[speedLevel].name.toUpperCase()}`, 12, 24);

    ctx.textAlign = 'center';
    if (state === 'ready') {
      ctx.fillText('Press 0 to start', W / 2, H / 2 - 20);
    } else if (state === 'paused') {
      ctx.font = 'bold 24px monospace';
      ctx.fillText('PAUSED', W / 2, H / 2 - 20);
      ctx.font = '14px monospace';
      ctx.fillText('Press P to resume', W / 2, H / 2 + 4);
    } else if (state === 'over') {
      ctx.font = 'bold 24px monospace';
      ctx.fillText('G A M E   O V E R', W / 2, H / 2 - 20);
      ctx.font = '14px monospace';
      ctx.fillText('Press 0 to restart', W / 2, H / 2 + 4);
    }
    ctx.textAlign = 'left';
  }

  // ---------- Corner spin cat ----------
  const spinCatBtn = document.getElementById('spinCat');
  const spinBody = spinCatBtn.querySelector('.spin-body');
  const TWO_PI = Math.PI * 2;
  const QUARTER = Math.PI / 2;
  const OIIA = ['o', 'i', 'i', 'a', 'o', 'o'];
  let spinAngle = 0, spinVel = 0, lastQuarter = 0, lastSyllable = 0, lastSpinFrame = -1;

  // Every other frame of oiia.gif (0, 2, … 92).
  const SPIN_FRAMES = 47;
  const SPIN_COLS = 10;
  const SPIN_CELL = 52;
  const FRAMES_PER_RAD = 1.6;
  new Image().src = 'oiia-spin.webp';

  // Disco ball: mosaic tiles on a sphere, drawn at 2x for crisp pixels.
  const discoCanvas = spinCatBtn.querySelector('.disco');
  const dctx = discoCanvas.getContext('2d');
  dctx.scale(2, 2);
  const DISCO_TINTS = ['#ffffff', '#ffd6e7', '#d6ecff', '#fff3c4', '#e6d9ff'];
  let discoPhase = 0;

  function drawDisco(now) {
    const cx = 32, cy = 50, r = 22;
    const spinning = spinVel > 0;
    dctx.clearRect(0, 0, 64, 84);

    dctx.fillStyle = '#8a8a9a';
    dctx.fillRect(cx - 1, 0, 2, cy - r + 1);
    dctx.fillStyle = '#6b6b7b';
    dctx.fillRect(cx - 4, cy - r - 2, 8, 4);

    const LAT = 9, LON = 18;
    for (let i = 0; i < LAT; i++) {
      const lat = -Math.PI / 2 + ((i + 0.5) / LAT) * Math.PI;
      const y = cy + r * Math.sin(lat);
      const h = Math.ceil(r * (Math.PI / LAT)) + 1;
      for (let j = 0; j < LON; j++) {
        const lon = (j / LON) * TWO_PI + discoPhase;
        const z = Math.cos(lon);
        if (z <= 0) continue;
        const x = cx + r * Math.cos(lat) * Math.sin(lon);
        const w = Math.max(1, Math.ceil(r * Math.cos(lat) * (TWO_PI / LON) * z) + 1);
        const light = Math.max(0, 0.35 + 0.65 * z * Math.cos(lat - 0.5));
        const seed = (i * 31 + j * 17) % 97;
        const glint = spinning && (seed + Math.floor(now / 90)) % 23 === 0;
        const rx = Math.round(x - w / 2), ry = Math.round(y - h / 2);
        dctx.globalAlpha = 1;
        dctx.fillStyle = glint ? '#ffffff' : DISCO_TINTS[seed % DISCO_TINTS.length];
        dctx.fillRect(rx, ry, w, h);
        if (!glint) {
          dctx.globalAlpha = 1 - light;
          dctx.fillStyle = '#4a4a66';
          dctx.fillRect(rx, ry, w, h);
        }
      }
    }
    dctx.globalAlpha = 1;

    // Twinkling 4-point sparkles while spinning
    if (spinning) {
      for (let k = 0; k < 4; k++) {
        if (Math.sin(now / 120 + k * 2.1) < 0.2) continue;
        const a = k * 1.7 + now / 400;
        const sx = Math.round(cx + Math.cos(a) * (r + 6));
        const sy = Math.round(cy + Math.sin(a) * (r + 4));
        dctx.fillStyle = DISCO_TINTS[(k + 1) % DISCO_TINTS.length];
        dctx.fillRect(sx - 1, sy - 3, 2, 6);
        dctx.fillRect(sx - 3, sy - 1, 6, 2);
      }
    }
  }

  spinCatBtn.addEventListener('click', () => {
    spinCatBtn.blur();
    getAudioCtx();
    // Capped so it doesn't strobe backwards at 60fps.
    spinVel = Math.min(spinVel + 5, 40);
  });

  function updateSpinCat(dt, now) {
    spinAngle += spinVel * dt;
    spinVel *= Math.exp(-1.1 * dt);
    if (spinVel < 1.5) spinVel = 0;

    // One syllable per quarter turn: O-I-I-A-O-O, faster spin = faster + higher.
    const q = Math.floor(spinAngle / QUARTER);
    if (q !== lastQuarter) {
      if (q > lastQuarter && spinVel > 0 && now - lastSyllable > 70) {
        lastSyllable = now;
        const dur = Math.min(0.25, Math.max(0.07, QUARTER / spinVel));
        const pitch = Math.min(700, 300 + spinVel * 9);
        const v = OIIA[((q % OIIA.length) + OIIA.length) % OIIA.length];
        playVowel(v, v === 'i' ? pitch * 1.12 : pitch, dur);
      }
      lastQuarter = q;
    }

    const spinning = spinVel > 0;
    spinBody.classList.toggle('spinning', spinning);
    if (spinning) discoPhase += spinVel * dt * 0.25;
    drawDisco(now);
    const f = spinning ? Math.floor(spinAngle * FRAMES_PER_RAD) % SPIN_FRAMES : -1;
    if (f !== lastSpinFrame) {
      lastSpinFrame = f;
      spinBody.style.backgroundPosition = spinning
        ? `${-(f % SPIN_COLS) * SPIN_CELL}px ${-Math.floor(f / SPIN_COLS) * SPIN_CELL}px`
        : '';
    }
  }

  // ---------- Loop ----------
  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    pollMic(now);
    updateSpinCat(dt, now);
    if (state === 'running') update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  setSpeed(0);
  reset();
  requestAnimationFrame(frame);
})();

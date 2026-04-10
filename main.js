/**
 * NEO SURVIVOR - Core Game Logic
 */

const CONFIG = {
  PLAYER_BASE_SPEED: 4,
  PLAYER_BASE_HEALTH: 120,
  ENEMY_BASE_HEALTH: 20,
  ENEMY_BASE_SPEED: 2.2,
  PROJECTILE_SPEED: 11,
  SPAWN_INTERVAL: 800,
  SPAWN_RADIUS: 700,
  GEM_VALUES: 10,
  XP_PER_LEVEL: 100,
  UPGRADES: [
    { id: 'damage', name: 'Zvýšení Síly', desc: 'Poškození x2', icon: '⚔️' },
    { id: 'speed', name: 'Rychlé Boty', desc: '+15% rychlost pohybu', icon: '👟' },
    { id: 'count', name: 'Více Střel', desc: '+1 projektil navíc', icon: '🌀' },
    { id: 'firerate', name: 'Rychlá Palba', desc: '-20% prodleva útoku', icon: '🔥' },
    { id: 'magnet', name: 'Magnet na XP', desc: '+50% dosah sběru', icon: '🧲' },
    { id: 'shield', name: 'Energetický Štít', desc: 'Snížení poškození o 20%', icon: '🛡️' },
    { id: 'regen', name: 'Regenerace', desc: 'Obnova 1 HP/s', icon: '💊' },
    { id: 'xpgen', name: 'Zkušenostní Pole', desc: 'Generuje 1 XP automaticky', icon: '💎' },
    { id: 'ultramagnet', name: 'Ultra Magnet', desc: 'Pomalý sběr z celé mapy', icon: '🌌' },
    { id: 'pierce', name: 'Průraznost', desc: 'Střely projdou více nepřáteli', icon: '🏹' },
    { id: 'size', name: 'Obří Střely', desc: '+30% velikost projektilu', icon: '🌕' },
    { id: 'crit', name: 'Kritické Zásahy', desc: '15% šance na 2x damage', icon: '💥' },
    { id: 'luck', name: 'Větší Výběr', desc: '4 možnosti při levelu', icon: '🍀' },
    { id: 'orbit', name: 'Orbitální Štít', desc: 'Vypustí rotující projektil', icon: '🪐' },
    { id: 'knockback', name: 'Silný Odhoz', desc: '+50% sýla odhozu', icon: '💢' },
    { id: 'xpboost', name: 'XP Multiplikátor', desc: '+20% bonus k XP', icon: '📈' },
    { id: 'lifesteal', name: 'Lifesteal', desc: '5% šance na heal při killu', icon: '🧛' },
    { id: 'aura', name: 'Mrazivá Aura', desc: 'Zpomaluje blízké nepřátele', icon: '❄️' },
    { id: 'bounce', name: 'Odraz', desc: 'Střely se odráží k dalšímu cíli', icon: '🪃' },
    { id: 'fire', name: 'Ohnivá Stopa', desc: 'Zanecháváš za sebou oheň', icon: '🔥' },
    { id: 'growth', name: 'Růst', desc: '+10% max HP a plný heal', icon: '🥗' }
  ],
  SCREEN_SHAKE: 0,
  BOSS_INTERVAL: 60,
  SNIPER_COOLDOWN: 15000,
};

const META = {
    currency: 0,
    upgrades: { hp: 0, speed: 0, luck: 0, hat: null }
};

const saveMeta = () => localStorage.setItem('neoSurvivor_meta', JSON.stringify(META));
const loadMeta = () => {
    const data = localStorage.getItem('neoSurvivor_meta');
    if (data) Object.assign(META, JSON.parse(data));
};

const GAME = {
  active: false,
  paused: false,
  score: 0,
  kills: 0,
  time: 0,
  lastBossTime: 0,
  speedFactor: 1.0,
  zoom: 1.0, 
  upgradeOptionsCount: 3,
  entities: {
    player: null,
    enemies: [],
    projectiles: [],
    gems: [],
    particles: [],
    fire: []
  },
  camera: { x: 0, y: 0 },
  input: { w: false, a: false, s: false, d: false },
  joystick: { 
      active: false, 
      startX: 80, 
      startY: 0,   
      currentX: 80, 
      currentY: 0,
      radius: 75
  },
  stars: [],
  orbiters: [],
  lastSniperTime: 0,
  canvas: null,
  ctx: null
};

const updateSpeedFactor = () => {
    const baseWidth = 1200;
    const isMobile = window.innerWidth < 850;
    GAME.speedFactor = Math.max(0.4, Math.min(1.2, window.innerWidth / baseWidth));
    GAME.zoom = isMobile ? 0.7 : 1.0;
    GAME.joystick.startX = 80;
    GAME.joystick.startY = window.innerHeight - 80;
    if (!GAME.joystick.active) {
        GAME.joystick.currentX = GAME.joystick.startX;
        GAME.joystick.currentY = GAME.joystick.startY;
    }
};

const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const randomRange = (min, max) => Math.random() * (max - min) + min;

function shakeScreen(amount = 5) {
    CONFIG.SCREEN_SHAKE = amount;
}

const AudioEngine = {
    ctx: null,
    musicStarted: false,
    init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch(e) { console.error("Audio init failed", e); }
    },
    play(type) {
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        const now = this.ctx.currentTime;
        switch(type) {
            case 'shoot':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.exponentialRampToValueAtTime(110, now + 0.1);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(); osc.stop(now + 0.1); break;
            case 'hit':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(100, now);
                osc.frequency.linearRampToValueAtTime(50, now + 0.1);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(); osc.stop(now + 0.1); break;
            case 'lvlup':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(220, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.5);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
                osc.start(); osc.stop(now + 0.5); break;
            case 'gem':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(660, now);
                osc.frequency.exponentialRampToValueAtTime(1320, now + 0.05);
                gain.gain.setValueAtTime(0.03, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(); osc.stop(now + 0.1); break;
        }
    },
    startMusic() {
        if (this.musicStarted || !this.ctx) return;
        this.musicStarted = true;
        
        const playSynth = (time, freq, vol, duration, type='square') => {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = type; osc.frequency.setValueAtTime(freq, time);
            g.gain.setValueAtTime(vol, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + duration);
            osc.connect(g); g.connect(this.ctx.destination);
            osc.start(time); osc.stop(time + duration);
        };
        
        const playNoise = (time, vol, duration) => {
            const bufferSize = this.ctx.sampleRate * duration;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const src = this.ctx.createBufferSource();
            src.buffer = buffer;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(vol, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + duration);
            src.connect(g); g.connect(this.ctx.destination);
            src.start(time); src.stop(time + duration);
        };

        let step = 0;
        const bassNotes = [55, 55, 62, 49, 55, 55, 73, 65, 55, 55, 62, 49, 55, 55, 82, 98];
        const melodyNotes = [110, 0, 165, 0, 110, 0, 220, 196, 110, 0, 165, 0, 110, 220, 330, 440];

        setInterval(() => {
            if (GAME.active && !GAME.paused) {
                const now = this.ctx.currentTime;
                
                // Bass Layer (Continuous drive)
                playSynth(now, bassNotes[step % 16], 0.03, 0.4, 'sawtooth');
                
                // Kick Drum (Every 1st and 3rd weight)
                if (step % 2 === 0) {
                    playSynth(now, 60, 0.08, 0.2, 'sine');
                }
                
                // Snare/Noise (Every 2nd and 4th weight)
                if (step % 4 === 2) {
                    playNoise(now, 0.02, 0.15);
                }

                // Hi-Hats (Offbeat)
                if (step % 2 === 1) {
                    playNoise(now, 0.008, 0.05);
                }

                // Melody (Pentatonic variations)
                if (step % 16 >= 8 && Math.random() > 0.4) {
                    playSynth(now, melodyNotes[step % 16] * 2, 0.015, 0.3, 'triangle');
                }
                
                // Cosmic Sparkle (Random high pitch)
                if (Math.random() > 0.95) {
                    playSynth(now, 1000 + Math.random() * 2000, 0.005, 1.0, 'sine');
                }

                step++;
            }
        }, 150); // Faster tempo (150ms ~= 100bpm with 16th feel)
    }
};

class Particle {
  constructor(x, y, color) {
    this.x = x; this.y = y; this.color = color;
    this.size = randomRange(2, 5);
    this.angle = Math.random() * Math.PI * 2;
    this.speed = randomRange(1, 3);
    this.life = 1.0; this.decay = randomRange(0.01, 0.03);
  }
  update() {
    this.x += Math.cos(this.angle) * this.speed * GAME.speedFactor;
    this.y += Math.sin(this.angle) * this.speed * GAME.speedFactor;
    this.life -= this.decay;
  }
  draw(ctx, cam) {
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.size, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1.0;
  }
}

class Fire {
    constructor(x, y, damage) {
        this.x = x; this.y = y; this.damage = damage;
        this.radius = 25; this.life = 1.5;
    }
    update() {
        this.life -= 1/60;
        GAME.entities.enemies.forEach(e => {
            if (dist(this.x, this.y, e.x, e.y) < this.radius + e.radius) {
                e.hp -= this.damage * (1/60);
            }
        });
    }
    draw(ctx, cam) {
        ctx.globalAlpha = this.life / 1.5;
        ctx.shadowBlur = 10; ctx.shadowColor = '#f59e0b';
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;
    }
}

class Projectile {
  constructor(x, y, targetX, targetY, damage, stats = {}) {
    this.x = x; this.y = y;
    const angle = Math.atan2(targetY - y, targetX - x);
    this.vx = Math.cos(angle) * CONFIG.PROJECTILE_SPEED;
    this.vy = Math.sin(angle) * CONFIG.PROJECTILE_SPEED;
    this.damage = damage;
    this.radius = stats.size || 6;
    this.life = 200; this.pierce = stats.pierce || 1;
    this.bounce = stats.bounce || 0;
    this.hitEnemies = new Set();
  }
  update() { 
    this.x += this.vx * GAME.speedFactor; 
    this.y += this.vy * GAME.speedFactor; 
    this.life--; 
  }
  draw(ctx, cam) {
    ctx.shadowBlur = 15; ctx.shadowColor = '#6366f1';
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
}

class Gem {
  constructor(x, y) { this.x = x; this.y = y; this.radius = 5; this.attracted = false; }
  update(player) {
    const d = dist(this.x, this.y, player.x, player.y);
    if (d < player.magnetRange) this.attracted = true;
    if (player.ultraMagnet) {
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        this.x += Math.cos(angle) * 0.8 * GAME.speedFactor; this.y += Math.sin(angle) * 0.8 * GAME.speedFactor;
    }
    if (this.attracted) {
      const angle = Math.atan2(player.y - this.y, player.x - this.x);
      this.x += Math.cos(angle) * 14 * GAME.speedFactor; this.y += Math.sin(angle) * 14 * GAME.speedFactor;
    }
  }
  draw(ctx, cam) {
    ctx.shadowBlur = 15; ctx.shadowColor = '#10b981';
    ctx.fillStyle = '#34d399';
    ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
}

class Orbiter {
    constructor(parent, index, count) {
        this.parent = parent; this.index = index;
        this.angle = (index / count) * Math.PI * 2;
        this.radius = 120; this.size = 12; this.speed = 0.06; this.damage = 75;
    }
    update() { this.angle += this.speed * GAME.speedFactor; }
    draw(ctx, cam) {
        const x = this.parent.x + Math.cos(this.angle) * this.radius;
        const y = this.parent.y + Math.sin(this.angle) * this.radius;
        ctx.shadowBlur = 20; ctx.shadowColor = '#8b5cf6';
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath(); ctx.arc(x - cam.x, y - cam.y, this.size, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        GAME.entities.enemies.forEach(enemy => {
            if (dist(x, y, enemy.x, enemy.y) < this.size + enemy.radius) {
                enemy.hp -= this.damage / 60;
                enemy.knockback.x = Math.cos(this.angle) * 3;
                enemy.knockback.y = Math.sin(this.angle) * 3;
            }
        });
    }
}

class Boss {
  constructor(x, y, level = 1) {
    this.x = x; this.y = y; this.radius = 50;
    this.maxHp = CONFIG.ENEMY_BASE_HEALTH * 30 * level; this.hp = this.maxHp;
    this.speed = CONFIG.ENEMY_BASE_SPEED * 0.8; this.isBoss = true;
    this.knockback = { x: 0, y: 0 };
  }
  update(player) {
    const angle = Math.atan2(player.y - this.y, player.x - this.x);
    let speedScale = player.level < 10 ? 0.8 : 1.0;
    if (player.aura && dist(this.x, this.y, player.x, player.y) < player.auraRange) speedScale *= 0.5;
    const currentSpeed = this.speed * speedScale * GAME.speedFactor;
    this.x += Math.cos(angle) * currentSpeed + this.knockback.x;
    this.y += Math.sin(angle) * currentSpeed + this.knockback.y;
    this.knockback.x *= 0.9; this.knockback.y *= 0.9;
  }
  draw(ctx, cam) {
    const ratio = this.hp / this.maxHp;
    ctx.shadowBlur = 40; ctx.shadowColor = '#ef4444'; ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + (Date.now() / 1000);
        const px = this.x - cam.x + Math.cos(a) * this.radius;
        const py = this.y - cam.y + Math.sin(a) * this.radius;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    const barW = 100; const barH = 10;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(this.x - cam.x - barW/2, this.y - cam.y - this.radius - 30, barW, barH);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(this.x - cam.x - barW/2, this.y - cam.y - this.radius - 30, barW * ratio, barH);
    ctx.shadowBlur = 0;
  }
}

class Enemy {
  constructor(x, y, level = 1) {
    this.x = x; this.y = y; this.radius = 18;
    this.maxHp = CONFIG.ENEMY_BASE_HEALTH * level; this.hp = this.maxHp;
    this.speed = CONFIG.ENEMY_BASE_SPEED + (level * 0.15);
    this.knockback = { x: 0, y: 0 };
  }
  update(player) {
    const angle = Math.atan2(player.y - this.y, player.x - this.x);
    let speedScale = player.level < 10 ? 0.8 : 1.0;
    if (player.aura && dist(this.x, this.y, player.x, player.y) < player.auraRange) speedScale *= 0.5;
    const currentSpeed = this.speed * speedScale * GAME.speedFactor;
    this.x += Math.cos(angle) * currentSpeed + this.knockback.x;
    this.y += Math.sin(angle) * currentSpeed + this.knockback.y;
    this.knockback.x *= 0.8; this.knockback.y *= 0.8;
  }
  draw(ctx, cam) {
    const ratio = this.hp / this.maxHp;
    const color = `rgb(255, ${Math.floor(255 * (1 - ratio))}, 80)`;
    ctx.shadowBlur = 15; ctx.shadowColor = color; ctx.fillStyle = color;
    const angle = Math.atan2(GAME.entities.player.y - this.y, GAME.entities.player.x - this.x);
    ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-12, 12); ctx.lineTo(-12, -12); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.shadowBlur = 0;
  }
}

class Player {
  constructor() {
    this.x = 0; this.y = 0; this.radius = 22;
    this.maxHp = CONFIG.PLAYER_BASE_HEALTH + (META.upgrades.hp * 10);
    this.hp = this.maxHp;
    this.speed = CONFIG.PLAYER_BASE_SPEED * (1 + (META.upgrades.speed * 0.02));
    this.damage = 10; this.projectileCount = 1; this.fireRate = 1000;
    this.magnetRange = 150; this.shield = 1.0; this.regen = 0;
    this.xpGenInterval = 0; this.lastXpGen = 0; this.ultraMagnet = false;
    this.pierceCount = 1; this.projSize = 6; this.critChance = 0;
    this.luckFactor = 1.0 + (META.upgrades.luck * 0.05);
    this.orbitals = 0; this.knockbackForce = 6; this.xpMultiplier = 1.0;
    this.lifestealChance = 0; this.aura = false; this.auraRange = 150;
    this.bounces = 0; this.fireTrail = false;
    this.lastFireTrail = 0; this.lastFired = 0; this.lastRegen = 0;
    this.level = 1; this.xp = 0; this.nextLevelXp = CONFIG.XP_PER_LEVEL;
  }
  update() {
    let dx = 0, dy = 0;
    if (GAME.joystick.active) {
        const jdx = GAME.joystick.currentX - GAME.joystick.startX;
        const jdy = GAME.joystick.currentY - GAME.joystick.startY;
        const d = dist(0, 0, jdx, jdy);
        if (d > 5) { dx = jdx / d; dy = jdy / d; }
    } else {
        if (GAME.input.w) dy -= 1; if (GAME.input.s) dy += 1;
        if (GAME.input.a) dx -= 1; if (GAME.input.d) dx += 1;
    }
    if (dx !== 0 || dy !== 0) {
      const angle = Math.atan2(dy, dx);
      this.x += Math.cos(angle) * this.speed * GAME.speedFactor; this.y += Math.sin(angle) * this.speed * GAME.speedFactor;
      
      const now = Date.now();
      if (this.fireTrail && now - this.lastFireTrail > 150) {
          GAME.entities.fire.push(new Fire(this.x, this.y, this.damage * 0.5));
          this.lastFireTrail = now;
      }
    }
    const now = Date.now();
    if (this.regen > 0 && now - this.lastRegen > 1000) {
        this.hp = Math.min(this.maxHp, this.hp + this.regen); this.lastRegen = now; updateUI();
    }
    if (this.xpGenInterval > 0 && now - this.lastXpGen > this.xpGenInterval) {
        this.addXp(1); this.lastXpGen = now;
    }
    if (now - this.lastFired > this.fireRate) { this.attack(); this.lastFired = now; }
  }
  attack() {
    const enemies = GAME.entities.enemies;
    if (enemies.length === 0) return;
    const sortedEnemies = [...enemies].sort((a,b) => dist(this.x,this.y,a.x,a.y) - dist(this.x,this.y,b.x,b.y));
    for (let i = 0; i < Math.min(this.projectileCount, sortedEnemies.length); i++) {
        const t = sortedEnemies[i];
        GAME.entities.projectiles.push(new Projectile(this.x, this.y, t.x, t.y, this.damage, {size:this.projSize, pierce:this.pierceCount, bounce:this.bounces}));
    }
    if (this.orbitals !== GAME.orbiters.length) {
        GAME.orbiters = []; for (let i = 0; i < this.orbitals; i++) GAME.orbiters.push(new Orbiter(this, i, this.orbitals));
    }
    AudioEngine.play('shoot');
  }
  draw(ctx, cam) {
    ctx.shadowBlur = 30; ctx.shadowColor = '#6366f1';
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
    if (META.upgrades.hat) {
        ctx.font = '28px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        const h = { 'crown': '👑', 'wizard': '🧙', 'ninja': '🥷', 'cap': '🧢' }[META.upgrades.hat];
        ctx.fillText(h || '🎩', this.x - cam.x, this.y - cam.y - this.radius + 8);
    }
    ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 4; ctx.stroke(); ctx.shadowBlur = 0;
  }
  addXp(amount) { this.xp += amount * this.xpMultiplier; if (this.xp >= this.nextLevelXp) this.levelUp(); updateUI(); }
  levelUp() { this.level++; this.xp -= this.nextLevelXp; this.nextLevelXp = Math.floor(this.nextLevelXp * 1.25); AudioEngine.play('lvlup'); showLevelUp(); }
}

function spawnEnemy() {
  if (!GAME.active || GAME.paused) { setTimeout(spawnEnemy, 500); return; }
  const a = Math.random() * Math.PI * 2;
  const x = GAME.entities.player.x + Math.cos(a) * CONFIG.SPAWN_RADIUS;
  const y = GAME.entities.player.y + Math.sin(a) * CONFIG.SPAWN_RADIUS;
  const mod = Math.floor(GAME.time / 60) + 1;
  if (GAME.entities.player.level >= 20 && (GAME.time - GAME.lastBossTime > CONFIG.BOSS_INTERVAL)) {
      showBossWarning(); GAME.entities.enemies.push(new Boss(x, y, mod)); GAME.lastBossTime = GAME.time;
  } else { GAME.entities.enemies.push(new Enemy(x, y, mod)); }
  setTimeout(spawnEnemy, Math.max(100, (CONFIG.SPAWN_INTERVAL / (1 + GAME.time / 60))));
}

function showBossWarning() {
    const el = document.getElementById('boss-warning'); if(el) el.style.display = 'block';
    setTimeout(() => { if(el) el.style.display = 'none'; }, 3000);
}

function updateUI() {
  const p = GAME.entities.player;
  if (!p) return;
  const xpStr = `LVL ${p.level}`;
  if (document.getElementById('level-display').innerText !== xpStr) document.getElementById('level-display').innerText = xpStr;
  document.getElementById('xp-bar-fill').style.width = `${(p.xp / p.nextLevelXp) * 100}%`;
  document.getElementById('hp-bar-fill').style.width = `${(p.hp / p.maxHp) * 100}%`;
  document.getElementById('kill-count').innerText = GAME.kills;
  const sRatio = Math.min(1, (Date.now() - GAME.lastSniperTime) / CONFIG.SNIPER_COOLDOWN);
  const sBar = document.getElementById('sniper-bar');
  if (sBar) sBar.style.width = `${sRatio * 100}%`;
}

function showLevelUp() {
    GAME.paused = true;
    const modal = document.getElementById('levelup-modal');
    const container = document.getElementById('upgrade-options');
    container.innerHTML = '';
    
    const selected = [...CONFIG.UPGRADES].sort(() => 0.5 - Math.random()).slice(0, GAME.upgradeOptionsCount);
    selected.forEach(u => {
        const card = document.createElement('div'); card.className = 'upgrade-card';
        card.innerHTML = `<div class="upgrade-icon">${u.icon}</div><h3>${u.name}</h3><p>${u.desc}</p>`;
        card.onclick = () => applyUpgrade(u.id); container.appendChild(card);
    });
    modal.classList.add('active');
}

function applyUpgrade(id) {
    const p = GAME.entities.player;
    switch(id) {
        case 'damage': p.damage *= 2.0; break;
        case 'speed': p.speed *= 1.15; break;
        case 'count': p.projectileCount += 1; break;
        case 'firerate': p.fireRate *= 0.8; break;
        case 'magnet': p.magnetRange *= 1.5; break;
        case 'shield': p.shield *= 0.8; break;
        case 'regen': p.regen += 1; break;
        case 'xpgen': 
            if (p.lastXpGen === 0) p.xpGenInterval = 60000;
            else p.xpGenInterval = Math.max(500, p.xpGenInterval / 2);
            p.lastXpGen = Date.now(); break;
        case 'ultramagnet': p.ultraMagnet = true; break;
        case 'pierce': p.pierceCount += 1; break;
        case 'size': p.projSize *= 1.3; break;
        case 'crit': p.critChance += 0.15; break;
        case 'luck': GAME.upgradeOptionsCount = 4; break;
        case 'orbit': p.orbitals += 1; break;
        case 'knockback': p.knockbackForce *= 1.5; break;
        case 'xpboost': p.xpMultiplier += 0.2; break;
        case 'lifesteal': p.lifestealChance += 0.05; break;
        case 'aura': p.aura = true; p.auraRange += 20; break;
        case 'bounce': p.bounces += 1; break;
        case 'fire': p.fireTrail = true; break;
        case 'growth': p.maxHp += Math.floor(p.maxHp * 0.1); p.hp = p.maxHp; break;
    }
    GAME.entities.enemies = GAME.entities.enemies.filter(e => e.isBoss);
    GAME.paused = false; document.getElementById('levelup-modal').classList.remove('active');
}

function gameOver() {
    GAME.active = false;
    META.currency += Math.floor(GAME.kills / 10); saveMeta();
    document.getElementById('gameover-modal').classList.add('active');
    document.getElementById('final-level').innerText = GAME.entities.player.level;
    document.getElementById('final-kills').innerText = GAME.kills;
}

function togglePause() {
    if (!GAME.active) return;
    GAME.paused = !GAME.paused;
    document.getElementById('pause-modal').classList.toggle('active', GAME.paused);
}

function toggleFullscreen(element, force = false) {
  const isFS = document.fullscreenElement || document.webkitFullscreenElement;
  if (!isFS || force) {
    if (element.requestFullscreen) element.requestFullscreen();
    else if (element.webkitRequestFullscreen) element.webkitRequestFullscreen();
  } else if (!force) {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
}

function init() {
  GAME.canvas = document.getElementById('game-canvas');
  GAME.ctx = GAME.canvas.getContext('2d');
  updateSpeedFactor();
  window.addEventListener('resize', () => { 
      GAME.canvas.width = window.innerWidth; GAME.canvas.height = window.innerHeight; 
      updateSpeedFactor();
  });
  GAME.canvas.width = window.innerWidth; GAME.canvas.height = window.innerHeight;
  resetGame();
  
  window.addEventListener('keydown', (e) => { 
      GAME.input[e.key.toLowerCase()] = true; 
      if (e.key === 'Escape') togglePause();
  });
  window.addEventListener('keyup', (e) => { GAME.input[e.key.toLowerCase()] = false; });
  
  GAME.canvas.addEventListener('mousedown', (e) => {
    if (!GAME.active || GAME.paused) return;
    const rect = GAME.canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / GAME.zoom;
    const sy = (e.clientY - rect.top) / GAME.zoom;
    if (Date.now() - GAME.lastSniperTime >= CONFIG.SNIPER_COOLDOWN) {
        fireSniper(sx, sy); GAME.lastSniperTime = Date.now();
    }
  });

  const handleStart = () => {
    const isMobile = window.innerWidth < 850;
    if (isMobile) toggleFullscreen(document.documentElement, true);
    AudioEngine.init(); AudioEngine.startMusic(); startGame();
  };

  const btnStart = document.getElementById('btn-start');
  if(btnStart) btnStart.onclick = handleStart;
  
  const btnMeta = document.getElementById('btn-meta-menu');
  if(btnMeta) btnMeta.onclick = () => { showMetaMenu(); document.getElementById('meta-modal').classList.add('active'); };
  
  const btnCloseMeta = document.getElementById('btn-close-meta');
  if(btnCloseMeta) btnCloseMeta.onclick = () => { 
      document.getElementById('meta-modal').classList.remove('active');
      if (window.innerWidth < 850) toggleFullscreen(document.documentElement, true);
  };
  
  const btnResume = document.getElementById('btn-resume');
  if(btnResume) btnResume.onclick = togglePause;
  
  const btnMobilePause = document.getElementById('mobile-pause');
  if(btnMobilePause) btnMobilePause.onclick = (e) => { e.stopPropagation(); togglePause(); };
  
  const fsToggle = document.getElementById('fs-toggle');
  if (fsToggle) fsToggle.onclick = (e) => { e.stopPropagation(); toggleFullscreen(document.documentElement); };
  
  const btnRestart = document.getElementById('btn-restart-game');
  if(btnRestart) btnRestart.onclick = () => { document.getElementById('gameover-modal').classList.remove('active'); AudioEngine.startMusic(); startGame(); };

  document.querySelectorAll('.btn-reload').forEach(btn => {
      btn.onclick = (e) => {
          e.stopPropagation();
          GAME.active = false; GAME.paused = false;
          document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
          document.getElementById('menu-modal').classList.add('active');
          resetGame();
      };
  });

  document.addEventListener('visibilitychange', () => {
      if (document.hidden && GAME.active && !GAME.paused) togglePause();
  });

  GAME.canvas.addEventListener('touchstart', (e) => {
      if (!GAME.active || GAME.paused) return;
      const t = e.touches[0];
      const rect = GAME.canvas.getBoundingClientRect();
      const sx = (t.clientX - rect.left) / GAME.zoom;
      const sy = (t.clientY - rect.top) / GAME.zoom;
      
      if (t.clientX > window.innerWidth / 2) {
          if (Date.now() - GAME.lastSniperTime >= CONFIG.SNIPER_COOLDOWN) {
              fireSniper(sx, sy); GAME.lastSniperTime = Date.now();
          }
          return;
      }
      
      const dFromCenter = dist(t.clientX, t.clientY, GAME.joystick.startX, GAME.joystick.startY);
      if (dFromCenter < 120) {
          GAME.joystick.active = true;
          GAME.joystick.currentX = t.clientX; GAME.joystick.currentY = t.clientY;
      }
  });
  
  GAME.canvas.addEventListener('touchmove', (e) => {
      if (!GAME.joystick.active) return;
      const t = e.touches[0];
      const dx = t.clientX - GAME.joystick.startX;
      const dy = t.clientY - GAME.joystick.startY;
      const d = Math.min(dist(0, 0, dx, dy), 100);
      const angle = Math.atan2(dy, dx);
      GAME.joystick.currentX = GAME.joystick.startX + Math.cos(angle) * d;
      GAME.joystick.currentY = GAME.joystick.startY + Math.sin(angle) * d;
  }, { passive: true });
  
  GAME.canvas.addEventListener('touchend', () => { 
      GAME.joystick.active = false; 
      GAME.joystick.currentX = GAME.joystick.startX;
      GAME.joystick.currentY = GAME.joystick.startY;
  });

  spawnEnemy(); loadMeta(); requestAnimationFrame(loop);
}

function fireSniper(cx, cy) {
  const p = GAME.entities.player, cam = GAME.camera;
  const worldTargetX = cx + (cam.x / GAME.zoom);
  const worldTargetY = cy + (cam.y / GAME.zoom);
  const proj = new Projectile(p.x, p.y, worldTargetX, worldTargetY, p.damage * 10, { size: 12, pierce: Infinity });
  GAME.entities.projectiles.push(proj); shakeScreen(15); AudioEngine.play('lvlup');
}

const META_UPGRADES = [
    { id: 'hp', name: 'Maximální HP', desc: '+10 HP za úroveň', icon: '❤️', cost: 5 },
    { id: 'speed', name: 'Rychlost', desc: '+2% k pohybu za úroveň', icon: '⚡', cost: 10 },
    { id: 'luck', name: 'Sběrač Dogecoinů', desc: '+5% DOGE bonus za úroveň', icon: '🪙', cost: 15 },
    { id: 'hat_crown', name: 'Koruna', desc: 'Zlatý vzhled', icon: '👑', isHat: true, hatId: 'crown', cost: 50 },
    { id: 'hat_wizard', name: 'Mág', desc: 'Klobouk', icon: '🧙', isHat: true, hatId: 'wizard', cost: 50 }
];

function showMetaMenu() {
    const container = document.getElementById('meta-options');
    if (!container) return;
    document.getElementById('meta-currency').innerText = META.currency;
    container.innerHTML = '';
    META_UPGRADES.forEach(m => {
        const level = m.isHat ? (META.upgrades.hat === m.hatId ? 'Vybaveno' : 'Koupit') : (META.upgrades[m.id] || 0);
        const cost = m.cost * ((META.upgrades[m.id] || 0) + 1);
        const card = document.createElement('div'); card.className = 'upgrade-card';
        card.innerHTML = `<div>${m.icon}</div><h3>${m.name}</h3><p>${m.desc}</p><p>Level: ${level}</p><p>Cena: ${cost} DOGE</p>`;
        card.onclick = () => {
            if (META.currency >= cost) {
                META.currency -= cost;
                if (m.isHat) META.upgrades.hat = m.hatId; else META.upgrades[m.id] = (META.upgrades[m.id] || 0) + 1;
                saveMeta(); showMetaMenu();
            }
        };
        container.appendChild(card);
    });
}

function startGame() { resetGame(); GAME.active = true; document.getElementById('menu-modal').classList.remove('active'); document.getElementById('pause-modal').classList.remove('active'); }

function resetGame() {
    GAME.time = 0; GAME.kills = 0; GAME.lastBossTime = 0; GAME.upgradeOptionsCount = 3;
    GAME.entities.player = new Player(); GAME.entities.enemies = []; GAME.entities.projectiles = []; GAME.entities.gems = []; GAME.entities.particles = []; GAME.entities.fire = [];
    GAME.stars = []; for (let i = 0; i < 150; i++) GAME.stars.push({ x: Math.random() * 2000, y: Math.random() * 2000, size: Math.random() * 2, opacity: Math.random() * 0.5 });
    updateSpeedFactor(); updateUI();
}

function loop() { if (GAME.active && !GAME.paused) update(); render(); requestAnimationFrame(loop); }

function update() {
  GAME.time += 1/60; const p = GAME.entities.player; p.update();
  GAME.camera.x = (p.x * GAME.zoom) - GAME.canvas.width / 2; GAME.camera.y = (p.y * GAME.zoom) - GAME.canvas.height / 2;
  if (CONFIG.SCREEN_SHAKE > 0) { GAME.camera.x += (Math.random()-0.5)*CONFIG.SCREEN_SHAKE; GAME.camera.y += (Math.random()-0.5)*CONFIG.SCREEN_SHAKE; CONFIG.SCREEN_SHAKE *= 0.9; }
  GAME.entities.enemies.forEach((e, i) => {
    e.update(p);
    if (dist(p.x, p.y, e.x, e.y) < p.radius + e.radius) { p.hp -= (e.isBoss ? 2 : 0.5) * p.shield; if (p.hp <= 0) gameOver(); updateUI(); }
  });
  
  GAME.orbiters.forEach(o => o.update());

  GAME.entities.fire.forEach((f, i) => {
      f.update(); if (f.life <= 0) GAME.entities.fire.splice(i, 1);
  });

  GAME.entities.projectiles.forEach((proj, pIndex) => {
    proj.update(); if (proj.life <= 0) { GAME.entities.projectiles.splice(pIndex, 1); return; }
    
    GAME.entities.enemies.forEach((enemy, eIndex) => {
        if (!proj.hitEnemies.has(enemy) && dist(proj.x, proj.y, enemy.x, enemy.y) < proj.radius + enemy.radius) {
            enemy.hp -= proj.damage; proj.hitEnemies.add(enemy);

            if (proj.bounce > 0) {
                const targets = GAME.entities.enemies.filter(e => e !== enemy && !proj.hitEnemies.has(e));
                if (targets.length > 0) {
                    const next = targets.sort((a,b) => dist(proj.x, proj.y, a.x, a.y) - dist(proj.x, proj.y, b.x, b.y))[0];
                    const angle = Math.atan2(next.y - proj.y, next.x - proj.x);
                    proj.vx = Math.cos(angle) * CONFIG.PROJECTILE_SPEED;
                    proj.vy = Math.sin(angle) * CONFIG.PROJECTILE_SPEED;
                    proj.bounce--;
                }
            }

            if (proj.pierce > 1) {
                proj.pierce--;
            } else if (proj.pierce !== Infinity && proj.bounce <= 0) {
                GAME.entities.projectiles.splice(pIndex, 1);
            }

            if (enemy.hp <= 0) {
                AudioEngine.play('hit'); GAME.entities.gems.push(new Gem(enemy.x, enemy.y)); GAME.entities.enemies.splice(eIndex, 1); GAME.kills++; updateUI();
            }
        }
    });
  });
  GAME.entities.gems.forEach((g, i) => { g.update(p); if (dist(p.x, p.y, g.x, g.y) < p.radius + g.radius) { AudioEngine.play('gem'); p.addXp(10 * p.luckFactor); GAME.entities.gems.splice(i, 1); } });
  GAME.entities.particles.forEach((part, i) => { part.update(); if (part.life <= 0) GAME.entities.particles.splice(i, 1); });
  updateUI();
}

function render() {
  const ctx = GAME.ctx, cam = GAME.camera;
  ctx.save();
  ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, GAME.canvas.width, GAME.canvas.height);
  ctx.scale(GAME.zoom, GAME.zoom);
  const camX = cam.x / GAME.zoom;
  const camY = cam.y / GAME.zoom;
  
  GAME.stars.forEach(s => {
      const sx = (s.x - camX * 0.1) % (GAME.canvas.width/GAME.zoom), sy = (s.y - camY * 0.1) % (GAME.canvas.height/GAME.zoom);
      ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`; ctx.beginPath(); ctx.arc(sx<0?sx+(GAME.canvas.width/GAME.zoom):sx, sy<0?sy+(GAME.canvas.height/GAME.zoom):sy, s.size, 0, Math.PI*2); ctx.fill();
  });
  
  const hexRadius = 60;
  const hexHeight = hexRadius * Math.sqrt(3);
  const startCol = Math.floor(camX / (hexRadius * 1.5)) - 1;
  const endCol = startCol + Math.ceil((GAME.canvas.width/GAME.zoom) / (hexRadius * 1.5)) + 2;
  const startRow = Math.floor(camY / hexHeight) - 1;
  const endRow = startRow + Math.ceil((GAME.canvas.height/GAME.zoom) / hexHeight) + 2;

  ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let col = startCol; col <= endCol; col++) {
      for (let row = startRow; row <= endRow; row++) {
          const cx = col * hexRadius * 1.5 - camX;
          const cy = (row * hexHeight + (Math.abs(col) % 2 === 0 ? 0 : hexHeight / 2)) - camY;
          
          for (let i = 0; i < 6; i++) {
              const a = (i / 6) * Math.PI * 2;
              const px = cx + Math.cos(a) * hexRadius;
              const py = cy + Math.sin(a) * hexRadius;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
          }
      }
  }
  ctx.stroke();

  GAME.entities.fire.forEach(f => f.draw(ctx, {x:camX, y:camY}));
  GAME.entities.particles.forEach(p => p.draw(ctx, {x:camX, y:camY}));
  GAME.entities.gems.forEach(g => g.draw(ctx, {x:camX, y:camY}));
  GAME.entities.projectiles.forEach(p => p.draw(ctx, {x:camX, y:camY}));
  if (GAME.orbiters) GAME.orbiters.forEach(o => o.draw(ctx, {x:camX, y:camY}));
  GAME.entities.enemies.forEach(e => e.draw(ctx, {x:camX, y:camY}));
  if (GAME.entities.player) GAME.entities.player.draw(ctx, {x:camX, y:camY});
  
  ctx.restore(); 
  
  const drawJ = window.innerWidth < 850;
  if (drawJ) {
      ctx.save(); 
      const sx = GAME.joystick.startX, sy = GAME.joystick.startY;
      const cx = GAME.joystick.currentX, cy = GAME.joystick.currentY;
      
      ctx.beginPath(); ctx.arc(sx, sy, 75, 0, Math.PI * 2); 
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.lineWidth = 2; ctx.stroke();
      
      ctx.beginPath(); ctx.arc(sx, sy, 70, 0, Math.PI * 2); 
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)'; ctx.lineWidth = 4; ctx.stroke();
      
      ctx.beginPath(); ctx.arc(cx, cy, 32, 0, Math.PI * 2); 
      ctx.fillStyle = 'rgba(99, 102, 241, 0.5)'; 
      ctx.shadowBlur = 20; ctx.shadowColor = '#6366f1'; 
      ctx.fill(); ctx.restore();
  }
}

init();

/**
 * NEO SURVIVOR - Core Game Logic
 */

// Error catching
window.onerror = function(msg, url, line, col, error) {
    alert("KRITICKÁ CHYBA: " + msg + "\nNa lince: " + line);
    console.error(error);
    return false;
};

console.warn("SCRIPT: Neo Survivor načten.");

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
    { id: 'damage', name: 'Zvýšení Síly', desc: 'Poškození x2', icon: '⚔️', rarity: 'common' },
    { id: 'speed', name: 'Rychlé Boty', desc: '+15% rychlost pohybu', icon: '👟', rarity: 'common' },
    { id: 'firerate', name: 'Rychlá Palba', desc: '-20% prodleva útoku', icon: '🔥', rarity: 'common' },
    { id: 'shield', name: 'Energetický Štít', desc: 'Snížení poškození o 20%', icon: '🛡️', rarity: 'common' },
    { id: 'growth', name: 'Růst', desc: '+10% max HP a plný heal', icon: '🥗', rarity: 'common' },
    
    { id: 'count', name: 'Více Střel', desc: '+1 projektil navíc', icon: '🌀', rarity: 'uncommon' },
    { id: 'pierce', name: 'Průraznost', desc: 'Střely projdou více nepřátely', icon: '🏹', rarity: 'uncommon' },
    { id: 'size', name: 'Obří Střely', desc: '+30% velikost projektilu', icon: '🌕', rarity: 'uncommon' },
    { id: 'xpboost', name: 'XP Multiplikátor', desc: '+20% bonus k XP', icon: '📈', rarity: 'uncommon' },
    { id: 'bounce', name: 'Odraz', desc: 'Střely se odráží k dalšímu cíli', icon: '🪃', rarity: 'uncommon' },
    
    { id: 'magnet', name: 'Magnet na XP', desc: '+50% dosah sběru', icon: '🧲', rarity: 'rare' },
    { id: 'crit', name: 'Kritické Zásahy', desc: '15% šance na 2x damage', icon: '💥', rarity: 'rare' },
    { id: 'knockback', name: 'Silný Odhoz', desc: '+50% sýla odhozu', icon: '💢', rarity: 'rare' },
    
    { id: 'regen', name: 'Regenerace', desc: 'Obnova 1 HP/s', icon: '💊', rarity: 'epic' },
    { id: 'ultramagnet', name: 'Ultra Magnet', desc: 'Pomalý sběr z celé mapy', icon: '🌌', rarity: 'epic' },
    { id: 'orbit', name: 'Orbitální Štít', desc: 'Vypustí rotující projektil', icon: '🪐', rarity: 'epic' },
    { id: 'lifesteal', name: 'Lifesteal', desc: '5% šance na heal při killu', icon: '🧛', rarity: 'epic' },
    { id: 'fire', name: 'Ohnivá Stopa', desc: 'Zanecháváš za sebou oheň', icon: '🔥', rarity: 'epic' },
    { id: 'kaktus', name: 'Kaktus', desc: 'Sáhni si a umřeš! (1x)', icon: '🌵', rarity: 'epic' },
    
    { id: 'xpgen', name: 'Zkušenostní Pole', desc: 'Generuje 1 XP automaticky', icon: '💎', rarity: 'legendary' },
    { id: 'luck', name: 'Větší Výběr', desc: '4 možnosti při levelu', icon: '🍀', rarity: 'legendary' },
    { id: 'aura', name: 'Mrazivá Aura', desc: 'Zpomaluje blízké nepřátele', icon: '❄️', rarity: 'legendary' },
    { id: 'bait', name: 'Návnada', desc: 'Vypouští chutné cíle pro ufony', icon: '🪤', rarity: 'legendary' }
  ],
  RARITIES: {
    common: { chance: 40, color: '#94a3b8', name: 'COMMON' },
    uncommon: { chance: 25, color: '#3b82f6', name: 'UNCOMMON' },
    rare: { chance: 20, color: '#22c55e', name: 'RARE' },
    epic: { chance: 10, color: '#a855f7', name: 'EPIC' },
    legendary: { chance: 5, color: '#eab308', name: 'LEGENDARY' }
  },
  SCREEN_SHAKE: 0,
  BOSS_INTERVAL: 60,
  SNIPER_COOLDOWN: 15000,
};

const NET = {
    peer: null,
    conn: null,
    isHost: false,
    others: {},
    roomId: null,
    lastSync: 0,
    playerSyncThrottle: 0,
    playersReady: new Set()
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
    fire: [],
    baits: []
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
    menuInterval: null,
    menuPlaying: false,
    droneNodes: null,
    init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch(e) { console.error("Audio init failed", e); }
    },
    startMenuMusic() {
        if (!this.ctx || this.menuPlaying) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.menuPlaying = true;
        this.menuDrone();
        const melody = [
            { n: 329.63, d: 0.15, r: 0.25 }, // E
            { n: 349.23, d: 0.15, r: 0.25 }, // F
            { n: 392.00, d: 0.20, r: 0.50 }, // G (quarter rest)
            { n: 329.63, d: 0.15, r: 0.25 }, // E
            { n: 349.23, d: 0.15, r: 0.25 }, // F
            { n: 392.00, d: 0.15, r: 0.25 }, // G
            { n: 293.66, d: 0.15, r: 0.25 }, // D
            { n: 261.63, d: 0.25, r: 0.60 }  // C (quarter rest)
        ];
        let idx = 0;
        const playNext = () => {
            if (!this.menuPlaying) return;
            const note = melody[idx];
            this.piano(note.n, note.d);
            idx = (idx + 1) % melody.length;
            this.menuInterval = setTimeout(playNext, note.r * 1000);
        };
        playNext();
    },
    menuDrone() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(55, this.ctx.currentTime);
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200, this.ctx.currentTime);
        
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.04, this.ctx.currentTime + 3);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start();
        this.droneNodes = [osc, gain];
    },
    stopMenuMusic() {
        this.menuPlaying = false;
        if (this.menuInterval) clearTimeout(this.menuInterval);
        if (this.droneNodes) {
            this.droneNodes.forEach(n => {
                try { if(n.stop) n.stop(); n.disconnect(); } catch(e) {}
            });
            this.droneNodes = null;
        }
    },
    piano(freq, dur) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, now);
        filter.frequency.exponentialRampToValueAtTime(400, now + dur + 0.5);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur + 1.2);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + dur + 1.5);
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
                playSynth(now, bassNotes[step % 16], 0.03, 0.4, 'sawtooth');
                if (step % 2 === 0) playSynth(now, 60, 0.08, 0.2, 'sine');
                if (step % 4 === 2) playNoise(now, 0.02, 0.15);
                if (step % 2 === 1) playNoise(now, 0.008, 0.05);
                if (step % 16 >= 8 && Math.random() > 0.4) playSynth(now, melodyNotes[step % 16] * 2, 0.015, 0.3, 'triangle');
                if (Math.random() > 0.95) playSynth(now, 1000 + Math.random() * 2000, 0.005, 1.0, 'sine');
                step++;
            }
        }, 150);
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
    const speed = stats.speed || CONFIG.PROJECTILE_SPEED;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.radius = stats.size || 6;
    this.life = stats.life || 200; 
    this.pierce = stats.pierce || 1;
    this.bounce = stats.bounce || 0;
    this.hitEnemies = new Set();
    this.ownerId = stats.ownerId || 'local';
    this.isEnemy = stats.isEnemy || false;
    this.color = stats.color || null;
  }
  update() { 
    this.x += this.vx * GAME.speedFactor; 
    this.y += this.vy * GAME.speedFactor; 
    this.life--; 
  }
  draw(ctx, cam) {
    ctx.shadowBlur = 15; 
    ctx.shadowColor = this.isEnemy ? (this.color || '#ff00ff') : (this.ownerId === 'local' ? '#6366f1' : '#f43f5e');
    ctx.fillStyle = this.isEnemy ? (this.color || '#ff00ff') : '#f8fafc';
    ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
}

class Gem {
  constructor(x, y, id = Math.random().toString(36).substr(2, 9)) { 
    this.x = x; this.y = y; this.radius = 5; this.attracted = false; this.id = id;
  }
  update(player) {
    if (player.dead) return;
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
  constructor(owner, index, total) {
    this.owner = owner; this.index = index; this.total = total;
    this.angle = (index / total) * Math.PI * 2; this.radius = 120; this.size = 15;
  }
  update() { this.angle += 0.05 * GAME.speedFactor; }
  draw(ctx, cam) {
    if (this.owner.dead) return;
    const x = this.owner.x + Math.cos(this.angle) * this.radius, y = this.owner.y + Math.sin(this.angle) * this.radius;
    ctx.shadowBlur = 20; ctx.shadowColor = '#fbbf24'; ctx.fillStyle = '#f59e0b';
    ctx.beginPath(); ctx.arc(x - cam.x, y - cam.y, this.size, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    GAME.entities.enemies.forEach(e => { if (dist(x, y, e.x, e.y) < this.size + e.radius) { e.hp -= this.owner.damage * 0.3 * (3); } });
  }
}

function getAllAlivePlayers() {
    const list = [];
    if (GAME.entities.player && !GAME.entities.player.dead) list.push(GAME.entities.player);
    for (const id in NET.others) {
        if (!NET.others[id].dead) list.push(NET.others[id]);
    }
    return list;
}

function getAllTargets() {
    const list = getAllAlivePlayers();
    GAME.entities.baits.forEach(b => {
        if (b.hp > 0) list.push({ x: b.x, y: b.y, radius: b.radius, isBait: true, obj: b });
    });
    return list;
}

class Bait {
    constructor(x, y, hp) {
        this.x = x; this.y = y; this.hp = hp; this.maxHp = hp; this.radius = 25;
    }
    update() {}
    draw(ctx, cam) {
        const r = Math.max(0.1, this.hp / this.maxHp);
        ctx.shadowBlur = 15; ctx.shadowColor = `rgba(255,255,255,${r})`;
        ctx.strokeStyle = `rgba(255,255,255,${r})`;
        ctx.lineWidth = 4;
        ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y);
        ctx.rotate(Math.PI / 4 + (Date.now() / 500));
        ctx.strokeRect(-20, -20, 40, 40);
        ctx.restore(); ctx.shadowBlur = 0;
    }
}

class Boss {
  constructor(x, y, level = 1, id = Math.random().toString(36).substr(2, 9)) {
    this.x = x; this.y = y; this.radius = 50; this.id = id;
    this.maxHp = CONFIG.ENEMY_BASE_HEALTH * 30 * level; this.hp = this.maxHp;
    this.speed = CONFIG.ENEMY_BASE_SPEED * 0.8; this.isBoss = true;
    this.knockback = { x: 0, y: 0 };
  }
  update() {
    const targets = getAllTargets();
    if (targets.length === 0) return;
    const baits = targets.filter(t => t.isBait);
    const target = baits.length > 0 
        ? baits.sort((a,b) => dist(this.x,this.y,a.x,a.y) - dist(this.x,this.y,b.x,b.y))[0]
        : targets.sort((a,b) => dist(this.x,this.y,a.x,a.y) - dist(this.x,this.y,b.x,b.y))[0];
    const angle = Math.atan2(target.y - this.y, target.x - this.x);
    let speedScale = 1.0;
    const players = getAllAlivePlayers();
    players.forEach(p => { if (p.aura && dist(this.x, this.y, p.x, p.y) < p.auraRange) speedScale *= 0.5; });
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
  constructor(x, y, level = 1, id = Math.random().toString(36).substr(2, 9), type = 1) {
    this.x = x; this.y = y; this.radius = 18; this.id = id; this.type = type;
    this.maxHp = CONFIG.ENEMY_BASE_HEALTH * level; 
    this.speed = CONFIG.ENEMY_BASE_SPEED + (level * 0.15);
    
    if (this.type === 2) {
        this.maxHp *= 0.5;
        this.speed *= 0.5;
        this.lastShot = Date.now();
        this.shotInterval = 5000;
    }
    
    this.hp = this.maxHp;
    this.knockback = { x: 0, y: 0 };
  }
  update() {
    const targets = getAllTargets();
    if (targets.length === 0) return;
    const baits = targets.filter(t => t.isBait);
    const target = baits.length > 0 
        ? baits.sort((a,b) => dist(this.x,this.y,a.x,a.y) - dist(this.x,this.y,b.x,b.y))[0]
        : targets.sort((a,b) => dist(this.x,this.y,a.x,a.y) - dist(this.x,this.y,b.x,b.y))[0];
    const angle = Math.atan2(target.y - this.y, target.x - this.x);
    let speedScale = 1.0;
    const players = getAllAlivePlayers();
    players.forEach(p => { if (p.aura && dist(this.x, this.y, p.x, p.y) < p.auraRange) speedScale *= 0.5; });
    const currentSpeed = this.speed * speedScale * GAME.speedFactor;
    this.x += Math.cos(angle) * currentSpeed + this.knockback.x;
    this.y += Math.sin(angle) * currentSpeed + this.knockback.y;
    this.knockback.x *= 0.8; this.knockback.y *= 0.8;

    // Type 2 Mechanics: Shooting
    if (this.type === 2 && Date.now() - this.lastShot > this.shotInterval) {
        const pSpeed = CONFIG.ENEMY_BASE_SPEED * 1.2;
        GAME.entities.projectiles.push(new Projectile(this.x, this.y, target.x, target.y, 10, {
            isEnemy: true,
            color: '#ff00ff',
            speed: pSpeed,
            size: 8
        }));
        this.lastShot = Date.now();
    }
  }
  draw(ctx, cam) {
    const ratio = this.hp / this.maxHp;
    if (this.type === 1) {
        const color = `rgb(255, ${Math.floor(255 * (1 - ratio))}, 80)`;
        ctx.shadowBlur = 15; ctx.shadowColor = color; ctx.fillStyle = color;
        const players = getAllAlivePlayers();
        const target = players.length > 0 ? players.sort((a,b) => dist(this.x,this.y,a.x,a.y) - dist(this.x,this.y,b.x,b.y))[0] : {x:0, y:0};
        const angle = Math.atan2(target.y - this.y, target.x - this.x);
        ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y); ctx.rotate(angle);
        ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-12, 12); ctx.lineTo(-12, -12); ctx.closePath(); ctx.fill();
        ctx.restore(); ctx.shadowBlur = 0;
    } else if (this.type === 2) {
        // Square shape, Purple (full) to Green (low)
        const r = Math.floor(168 * ratio + 34 * (1 - ratio));
        const g = Math.floor(85 * ratio + 197 * (1 - ratio));
        const b = Math.floor(247 * ratio + 94 * (1 - ratio));
        const color = `rgb(${r}, ${g}, ${b})`;
        
        ctx.shadowBlur = 20; ctx.shadowColor = color; ctx.fillStyle = color;
        ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y);
        ctx.rotate(Date.now() / 1000); // Rotating square for flair
        ctx.fillRect(-15, -15, 30, 30);
        ctx.restore(); ctx.shadowBlur = 0;
    }
  }
}

class Player {
  constructor(isLocal = true) {
    this.x = 0; this.y = 0; this.radius = 22; this.isLocal = isLocal;
    this.maxHp = CONFIG.PLAYER_BASE_HEALTH + (isLocal ? (META.upgrades.hp * 10) : 0);
    this.hp = this.maxHp;
    this.speed = CONFIG.PLAYER_BASE_SPEED * (isLocal ? (1 + (META.upgrades.speed * 0.02)) : 1);
    this.damage = 10; this.projectileCount = 1; this.fireRate = 1000;
    this.magnetRange = 150; this.shield = 1.0; this.regen = 0;
    this.xpGenInterval = 0; this.lastXpGen = 0; this.ultraMagnet = false;
    this.pierceCount = 1; this.projSize = 6; this.critChance = 0;
    this.luckFactor = 1.0 + (isLocal ? (META.upgrades.luck * 0.05) : 0);
    this.orbitals = 0; this.knockbackForce = 6; this.xpMultiplier = 1.0;
    this.lifestealChance = 0; this.aura = false; this.auraRange = 150;
    this.bounces = 0; this.fireTrail = false;
    this.kaktus = false; this.bait = false; this.lastBait = 0;
    this.lastFireTrail = 0; this.lastFired = 0; this.lastRegen = 0;
    this.level = 1; this.xp = 0; this.nextLevelXp = CONFIG.XP_PER_LEVEL;
    this.remoteHat = null;
    this.targetX = 0; this.targetY = 0;
    this.dead = false;
  }
  update() {
    if (this.dead) return;
    if (!this.isLocal) {
        this.x += (this.targetX - this.x) * 0.25;
        this.y += (this.targetY - this.y) * 0.25;
        return;
    }
    
    if (this.bait && Date.now() - this.lastBait > 10000) {
        GAME.entities.baits.push(new Bait(this.x, this.y, this.maxHp * 5));
        this.lastBait = Date.now();
    }
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
    if (this.dead) return;
    const enemies = GAME.entities.enemies;
    if (enemies.length === 0) return;
    const sortedEnemies = [...enemies].sort((a,b) => dist(this.x,this.y,a.x,a.y) - dist(this.x,this.y,b.x,b.y));
    const target = sortedEnemies[0];
    for (let i = 0; i < this.projectileCount; i++) {
        const proj = new Projectile(this.x, this.y, target.x, target.y, this.damage, {size:this.projSize, pierce:this.pierceCount, bounce:this.bounces});
        GAME.entities.projectiles.push(proj);
        if (NET.peer && (NET.conn || NET.isHost)) syncShot(proj);
    }
    if (this.orbitals !== GAME.orbiters.length) {
        GAME.orbiters = []; for (let i = 0; i < this.orbitals; i++) GAME.orbiters.push(new Orbiter(this, i, this.orbitals));
    }
    AudioEngine.play('shoot');
  }
  draw(ctx, cam) {
    if (this.dead) ctx.globalAlpha = 0.2;
    ctx.shadowBlur = 30; ctx.shadowColor = this.isLocal ? '#6366f1' : '#f43f5e';
    ctx.fillStyle = this.isLocal ? '#f8fafc' : '#fca5a5';
    ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
    const hat = this.isLocal ? META.upgrades.hat : this.remoteHat;
    if (hat) {
        ctx.font = '28px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        const h = { 'crown': '👑', 'wizard': '🧙', 'ninja': '🥷', 'cap': '🧢' }[hat];
        ctx.fillText(h || '🎩', this.x - cam.x, this.y - cam.y - this.radius + 8);
    }
    ctx.strokeStyle = this.isLocal ? '#6366f1' : '#f43f5e'; ctx.lineWidth = 4; ctx.stroke(); 
    ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;
  }
  addXp(amount) { 
      if (this.dead) return;
      if (NET.conn && !NET.isHost) {
          // Client: Just notify host, don't touch local XP
          NET.conn.send({ type: 'PICKUP_XP', amount: amount });
          return;
      }
      // Host or Solo logic
      const gain = Math.round(Number(amount) * this.xpMultiplier);
      if (isNaN(gain)) return;
      this.xp += gain; 
      while (this.xp >= this.nextLevelXp) {
          this.levelUp();
      }
      if (NET.isHost && NET.conn) syncState();
      updateUI(); 
  }
  levelUp() { 
      this.level++; 
      this.xp = Math.max(0, this.xp - this.nextLevelXp); 
      this.nextLevelXp = Math.floor(this.nextLevelXp * 1.25); 
      AudioEngine.play('lvlup'); 
      console.warn("TEAM LEVEL UP:", this.level);
      
      if (!NET.conn || NET.isHost) {
          GAME.paused = true;
          if (NET.isHost && NET.conn) {
              NET.playersReady.clear();
              NET.conn.send({ type: 'TRIGGER_LEVEL_UP' });
          }
          showLevelUp(); 
      }
  }
}

function spawnEnemy() {
  if (!GAME.active || GAME.paused) { setTimeout(spawnEnemy, 500); return; }
  if (NET.peer && !NET.isHost && NET.conn) { setTimeout(spawnEnemy, 1000); return; }
  const alive = getAllAlivePlayers();
  if (alive.length === 0) { setTimeout(spawnEnemy, 1000); return; }
  const a = Math.random() * Math.PI * 2;
  const pivot = alive[Math.floor(Math.random() * alive.length)];
  const x = pivot.x + Math.cos(a) * CONFIG.SPAWN_RADIUS;
  const y = pivot.y + Math.sin(a) * CONFIG.SPAWN_RADIUS;
  const mod = Math.floor(GAME.time / 60) + 1;
  
  let enemy;
  if (pivot.level >= 20 && (GAME.time - GAME.lastBossTime > CONFIG.BOSS_INTERVAL)) {
      enemy = new Boss(x, y, mod);
  } else {
      let type = 1;
      if (pivot.level >= 3 && Math.random() < 0.1) type = 2;
      enemy = new Enemy(x, y, mod, Math.random().toString(36).substr(2, 9), type);
  }

  if (enemy.isBoss) { showBossWarning(); GAME.lastBossTime = GAME.time; }
  GAME.entities.enemies.push(enemy);
  if (NET.isHost) syncWorld();
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
    GAME.entities.enemies = []; // Clear all enemies on level up
    if (NET.isHost) syncWorld();
    const modal = document.getElementById('levelup-modal');
    const container = document.getElementById('upgrade-options');
    container.innerHTML = '';
    
    const count = GAME.entities.player.level === 1 ? 3 : GAME.upgradeOptionsCount;
    const selected = [];
    const usedIds = new Set();
    
    while (selected.length < count && usedIds.size < CONFIG.UPGRADES.length) {
        // Weighted Random Rarity
        const rand = Math.random() * 100;
        let rarity = 'common';
        if (rand < 5) rarity = 'legendary';
        else if (rand < 15) rarity = 'epic';
        else if (rand < 35) rarity = 'rare';
        else if (rand < 60) rarity = 'uncommon';
        
        const possible = CONFIG.UPGRADES.filter(u => {
            if (u.id === 'kaktus' && GAME.entities.player.kaktus) return false;
            return u.rarity === rarity && !usedIds.has(u.id);
        });
        if (possible.length > 0) {
            const pick = possible[Math.floor(Math.random() * possible.length)];
            selected.push(pick);
            usedIds.add(pick.id);
        } else {
            // Fallback if no more items in this rarity
            const remaining = CONFIG.UPGRADES.filter(u => !usedIds.has(u.id));
            if (remaining.length === 0) break;
            const pick = remaining[Math.floor(Math.random() * remaining.length)];
            selected.push(pick);
            usedIds.add(pick.id);
        }
    }

    selected.forEach(u => {
        const rarityData = CONFIG.RARITIES[u.rarity];
        const card = document.createElement('div'); 
        card.className = 'upgrade-card';
        card.style.border = `2px solid ${rarityData.color}`;
        card.style.boxShadow = `0 10px 20px -10px ${rarityData.color}`;
        
        card.innerHTML = `
            <div style="font-size: 0.65rem; color: ${rarityData.color}; font-weight: 800; margin-bottom: 5px; letter-spacing: 1px;">${rarityData.name}</div>
            <div class="upgrade-icon">${u.icon}</div>
            <h3>${u.name}</h3>
            <p>${u.desc}</p>
        `;
        card.onclick = () => applyUpgrade(u.id); 
        container.appendChild(card);
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
        case 'xpgen': if (p.lastXpGen === 0) p.xpGenInterval = 60000; else p.xpGenInterval = Math.max(500, p.xpGenInterval / 2); p.lastXpGen = Date.now(); break;
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
        case 'kaktus': p.kaktus = true; break;
        case 'bait': p.bait = true; p.lastBait = Date.now(); break;
        case 'growth': p.maxHp += Math.floor(p.maxHp * 0.1); p.hp = p.maxHp; break;
    }
    document.getElementById('levelup-modal').classList.remove('active');
    
    if (NET.conn) {
        if (NET.isHost) {
            NET.playersReady.add('host');
            checkReadyState();
        } else {
            NET.conn.send({ type: 'PICKED_UPGRADE' });
        }
    } else {
        GAME.paused = false;
    }
}

function checkReadyState() {
    // Only host checks this
    if (NET.playersReady.has('host') && NET.playersReady.has('remote')) {
        GAME.paused = false;
        NET.playersReady.clear();
        syncState();
    }
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
    if (NET.conn && !NET.isHost) return; 
    GAME.paused = !GAME.paused;
    document.getElementById('pause-modal').classList.toggle('active', GAME.paused);
    if (NET.isHost && NET.conn) syncState();
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

function showMetaMenu() {
    const container = document.getElementById('meta-options');
    document.getElementById('meta-currency').innerText = META.currency;
    container.innerHTML = '';
    const items = [
        { id: 'hp', name: 'Extra HP', desc: 'Počáteční HP +10', cost: 10, val: META.upgrades.hp },
        { id: 'speed', name: 'Rychlost', desc: 'Pohyb +2%', cost: 15, val: META.upgrades.speed },
        { id: 'luck', name: 'Štěstí', desc: 'XP násobič +0.05', cost: 25, val: META.upgrades.luck },
        { id: 'hat_crown', name: 'Koruna', desc: 'Zlatá královská koruna', cost: 100, isHat: true, type: 'crown' },
        { id: 'hat_wizard', name: 'Mág', desc: 'Klobouk čaroděje', cost: 100, isHat: true, type: 'wizard' },
        { id: 'hat_ninja', name: 'Ninja', desc: 'Maska stínu', cost: 100, isHat: true, type: 'ninja' }
    ];
    items.forEach(item => {
        const card = document.createElement('div'); card.className = 'upgrade-card';
        const cost = item.isHat ? item.cost : Math.floor(item.cost * (1 + item.val * 0.5));
        const owned = item.isHat && META.upgrades.hat === item.type;
        card.innerHTML = `<h3>${item.name}</h3><p>${item.desc}</p><span class="cost">${owned ? 'VLASTNĚNO' : cost + ' DOGE'}</span>`;
        card.onclick = () => buyMetaUpgrade(item, cost);
        container.appendChild(card);
    });
}

function buyMetaUpgrade(item, cost) {
    if (META.currency < cost) { alert("Nemáš dost Dogecoinu!"); return; }
    if (item.isHat) { META.upgrades.hat = item.type; }
    else { META.upgrades[item.id]++; }
    META.currency -= cost; saveMeta(); showMetaMenu();
}

// MULTIPLAYER LOGIC
function generateShortId() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function initPeer(customId = null) {
    if (NET.peer) {
        if (customId && NET.peer.id !== customId) {
            NET.peer.destroy();
            NET.peer = null;
        } else {
            return;
        }
    }
    const shortId = customId || generateShortId();
    
    try {
        // High-performance Cloud Configuration
        const config = {
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun.anyfirewall.com:3478' }
                ],
                iceTransportPolicy: 'all'
            }
        };
        NET.peer = new Peer(shortId, config);
        
        NET.peer.on('open', (id) => {
            NET.roomId = id;
            console.warn("CLOUD: Připojeno k uzlu", id);
        });
        
        NET.peer.on('connection', (c) => {
            NET.conn = c; NET.isHost = true; setupConn();
            startGame();
        });
        
        NET.peer.on('error', (err) => {
            console.error("CLOUD Error:", err.type);
            if (err.type === 'peer-unavailable') {
                // Handled in joinCloudServer logic
            }
        });
    } catch(e) {
        console.error("Critical Cloud init fail", e);
    }
}

function setupConn() {
    NET.conn.on('data', (data) => {
        if (data.type === 'PLAYER_SYNC') {
            if (!NET.others[data.id]) NET.others[data.id] = new Player(false);
            const other = NET.others[data.id];
            other.targetX = data.x; other.targetY = data.y; other.remoteHat = data.hat;
            other.dead = data.dead;
        }
        if (data.type === 'SHOT') {
            const proj = new Projectile(data.x, data.y, data.tx, data.ty, data.dmg, { ownerId: 'remote' });
            GAME.entities.projectiles.push(proj);
        }
        if (data.type === 'PICKUP_XP' && NET.isHost) {
            GAME.entities.player.addXp(data.amount);
        }
        if (data.type === 'TRIGGER_LEVEL_UP') {
            GAME.paused = true;
            // Ensure local XP state is exactly what host has
            showLevelUp();
        }
        if (data.type === 'PICKED_UPGRADE' && NET.isHost) {
            NET.playersReady.add('remote');
            checkReadyState();
        }
        if (data.type === 'STATE_SYNC') {
            const p = GAME.entities.player;
            p.level = data.lvl; 
            p.xp = data.xp; 
            p.nextLevelXp = data.next;
            p.hp = data.hp;
            GAME.paused = data.paused; 
            GAME.time = data.time;
            updateUI();
        }
        if (data.type === 'WORLD_STATE' && !NET.isHost) {
            if (!GAME.active) startGame();
            if (data.enemies) {
                GAME.entities.enemies = data.enemies.map(he => {
                    const e = he.isBoss ? new Boss(he.x, he.y, 1, he.id) : new Enemy(he.x, he.y, 1, he.id);
                    e.hp = he.hp; return e;
                });
            }
            if (data.gems) {
                GAME.entities.gems = data.gems.map(hg => new Gem(hg.x, hg.y, hg.id));
            }
        }
    });
}

function syncPlayer() {
    if (!NET.conn) return;
    const now = Date.now();
    if (now - NET.playerSyncThrottle < 20) return; 
    NET.playerSyncThrottle = now;
    NET.conn.send({
        type: 'PLAYER_SYNC', id: NET.roomId,
        x: GAME.entities.player.x, y: GAME.entities.player.y, 
        hat: META.upgrades.hat, dead: GAME.entities.player.dead
    });
}

function syncShot(proj) {
    if (!NET.conn) return;
    const angle = Math.atan2(proj.vy, proj.vx);
    NET.conn.send({
        type: 'SHOT', x: proj.x, y: proj.y, tx: proj.x + Math.cos(angle)*100, ty: proj.y + Math.sin(angle)*100, dmg: proj.damage
    });
}

function syncState() {
    if (!NET.isHost || !NET.conn) return;
    const p = GAME.entities.player;
    NET.conn.send({
        type: 'STATE_SYNC', lvl: p.level, xp: p.xp, next: p.nextLevelXp, 
        paused: GAME.paused, time: GAME.time, hp: p.hp
    });
}

function syncWorld() {
    if (!NET.isHost || !NET.conn) return;
    const enemyData = GAME.entities.enemies.map(e => ({ 
        id: e.id, x: e.x, y: e.y, hp: e.hp, isBoss: e.isBoss 
    }));
    const gemData = GAME.entities.gems.map(g => ({ 
        id: g.id, x: g.x, y: g.y 
    }));
    NET.conn.send({
        type: 'WORLD_STATE',
        enemies: enemyData,
        gems: gemData
    });
}

window.joinCloudServer = (roomName) => {
    const publicId = "NEO_SERVER_" + roomName;
    console.warn("CLOUD: Připojuji se k uzlu", roomName);
    
    document.getElementById('room-' + roomName + '-status').innerText = 'SYNCHRONIZACE...';
    
    if (!NET.peer) initPeer();
    
    const conn = NET.peer.connect(publicId);
    let connectionTimeout = setTimeout(() => {
        if (!NET.conn) {
            console.warn("CLOUD: Uzel je neaktivní, spouštím instanci serveru...");
            conn.close();
            initPeer(publicId);
            setTimeout(() => {
                LOBBY.broadcast(publicId);
                NET.isHost = true;
                startGame();
            }, 800);
        }
    }, 1800);

    conn.on('open', () => {
        clearTimeout(connectionTimeout);
        console.warn("CLOUD: Spojení navázáno!");
        NET.conn = conn;
        NET.isHost = false;
        setupConn();
        startGame();
    });
};
const LOBBY = {
    gun: null, servers: {},
    init() {
        if (typeof Gun === 'undefined' || this.gun) return;
        this.gun = Gun(['https://gun-manhattan.herokuapp.com/gun', 'https://gun-sjc.herokuapp.com/gun']);
        this.scan();
    },
    broadcast(id) {
        if (!this.gun || !id || id === 'Načítám...') return;
        this.gun.get('neo-survivor-lobby-v3').get(id).put({ id: id, name: "Hra #" + id, time: Date.now() });
    },
    scan() {
        if (!this.gun) return;
        this.gun.get('neo-survivor-lobby-v3').map().on((data, id) => {
            if (!data || !data.id || Date.now() - data.time > 60000) return;
            this.servers[id] = data; this.updateUI();
        });
    },
    updateUI() {
        const container = document.getElementById('server-list'); if (!container) return;
        container.innerHTML = '';
        Object.values(this.servers).forEach(s => {
            if (Date.now() - s.time > 30000) return;
            const item = document.createElement('div');
            item.style = "display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,0.1); margin-bottom:5px;";
            item.innerHTML = `<div><b style="color:#a5b4fc">${s.id}</b></div><button onclick="connectToId('${s.id}')" style="background:var(--xp-color); border:none; border-radius:6px; color:white; padding:6px 12px; font-size:0.8rem; cursor:pointer;">PŘIPOJIT</button>`;
            container.appendChild(item);
        });
    }
};

window.connectToId = (id) => {
    document.getElementById('input-join-id').value = id;
    document.getElementById('btn-join-room').click();
};

function init() {
  GAME.canvas = document.getElementById('game-canvas');
  GAME.ctx = GAME.canvas.getContext('2d');
  updateSpeedFactor();
  window.addEventListener('resize', () => { GAME.canvas.width = window.innerWidth; GAME.canvas.height = window.innerHeight; updateSpeedFactor(); });
  GAME.canvas.width = window.innerWidth; GAME.canvas.height = window.innerHeight;
  resetGame();
  
  window.addEventListener('keydown', (e) => { GAME.input[e.key.toLowerCase()] = true; if (e.key === 'Escape') togglePause(); });
  window.addEventListener('keyup', (e) => { GAME.input[e.key.toLowerCase()] = false; });
  
  GAME.canvas.addEventListener('mousedown', (e) => {
    if (!GAME.active || GAME.paused || GAME.entities.player.dead) return;
    const rect = GAME.canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / GAME.zoom;
    const sy = (e.clientY - rect.top) / GAME.zoom;
    if (Date.now() - GAME.lastSniperTime >= CONFIG.SNIPER_COOLDOWN) { fireSniper(sx, sy); GAME.lastSniperTime = Date.now(); }
  });

  window.addEventListener('mousedown', () => { 
      AudioEngine.init(); 
      if (document.getElementById('menu-modal').classList.contains('active')) {
          AudioEngine.startMenuMusic();
      }
  }, { once: true });

  document.getElementById('btn-start').onclick = () => { 
      NET.conn = null; NET.isHost = false; 
      toggleFullscreen(document.documentElement, true);
      AudioEngine.init(); AudioEngine.stopMenuMusic(); AudioEngine.startMusic(); startGame(); 
  };
  document.getElementById('btn-multiplayer').onclick = (e) => { 
      if (e) e.preventDefault();
      document.getElementById('menu-modal').classList.remove('active'); 
      document.getElementById('multiplayer-modal').classList.add('active'); 
      AudioEngine.init(); // Stay in menu music for now
      setTimeout(() => {
          try { initPeer(); LOBBY.init(); } catch(err) { console.error("Cloud init delayed:", err); }
      }, 50);
  };
  document.getElementById('btn-close-mp').onclick = () => {
      document.getElementById('multiplayer-modal').classList.remove('active');
      document.getElementById('menu-modal').classList.add('active');
  };
  
  const btnMeta = document.getElementById('btn-meta-menu');
  if(btnMeta) btnMeta.onclick = () => { showMetaMenu(); document.getElementById('meta-modal').classList.add('active'); };
  
  const btnResume = document.getElementById('btn-resume');
  if(btnResume) btnResume.onclick = togglePause;
  
  const mobilePause = document.getElementById('mobile-pause');
  if(mobilePause) mobilePause.onclick = (e) => { e.stopPropagation(); togglePause(); };
  
  const fsToggle = document.getElementById('fs-toggle');
  if(fsToggle) fsToggle.onclick = (e) => { e.stopPropagation(); toggleFullscreen(document.documentElement); };
  
  const btnRestart = document.getElementById('btn-restart-game');
  if(btnRestart) btnRestart.onclick = () => { document.getElementById('gameover-modal').classList.remove('active'); startGame(); };
  document.querySelectorAll('.btn-reload').forEach(btn => btn.onclick = () => location.reload());

  GAME.canvas.addEventListener('touchstart', (e) => {
      if (!GAME.active || GAME.paused || GAME.entities.player.dead) return;
      const t = e.touches[0];
      const rect = GAME.canvas.getBoundingClientRect();
      const sx = (t.clientX - rect.left) / GAME.zoom;
      const sy = (t.clientY - rect.top) / GAME.zoom;
      if (t.clientX > window.innerWidth / 2) { if (Date.now() - GAME.lastSniperTime >= CONFIG.SNIPER_COOLDOWN) { fireSniper(sx, sy); GAME.lastSniperTime = Date.now(); } return; }
      const dFromCenter = dist(t.clientX, t.clientY, GAME.joystick.startX, GAME.joystick.startY);
      if (dFromCenter < 120) { GAME.joystick.active = true; GAME.joystick.currentX = t.clientX; GAME.joystick.currentY = t.clientY; }
  });
  GAME.canvas.addEventListener('touchmove', (e) => {
      if (!GAME.joystick.active) return;
      const t = e.touches[0];
      const dx = t.clientX - GAME.joystick.startX, dy = t.clientY - GAME.joystick.startY;
      const d = Math.min(dist(0, 0, dx, dy), 100), angle = Math.atan2(dy, dx);
      GAME.joystick.currentX = GAME.joystick.startX + Math.cos(angle) * d;
      GAME.joystick.currentY = GAME.joystick.startY + Math.sin(angle) * d;
  }, { passive: true });
  GAME.canvas.addEventListener('touchend', () => { GAME.joystick.active = false; GAME.joystick.currentX = GAME.joystick.startX; GAME.joystick.currentY = GAME.joystick.startY; });

  spawnEnemy(); loadMeta(); requestAnimationFrame(loop);
}

function fireSniper(cx, cy) {
  const p = GAME.entities.player, cam = GAME.camera;
  const worldTargetX = cx + (cam.x / GAME.zoom);
  const worldTargetY = cy + (cam.y / GAME.zoom);
  const proj = new Projectile(p.x, p.y, worldTargetX, worldTargetY, p.damage * 10, { size: 12, pierce: Infinity });
  GAME.entities.projectiles.push(proj); shakeScreen(15);
  if (NET.conn) syncShot(proj);
}

function startGame() { 
    resetGame(); 
    GAME.active = true; 
    AudioEngine.stopMenuMusic();
    AudioEngine.startMusic();
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); 
}

function resetGame() {
    GAME.time = 0; GAME.kills = 0; GAME.lastBossTime = 0;
    GAME.entities.player = new Player(true); GAME.entities.enemies = []; GAME.entities.projectiles = []; GAME.entities.gems = []; GAME.entities.particles = []; GAME.entities.fire = [];
    GAME.stars = []; for (let i = 0; i < 150; i++) GAME.stars.push({ x: Math.random() * 2000, y: Math.random() * 2000, size: Math.random() * 2, opacity: Math.random() * 0.5 });
    updateSpeedFactor(); updateUI();
}

function loop() { if (GAME.active) update(); render(); requestAnimationFrame(loop); }

function update() {
  if (GAME.paused) return;
  GAME.time += 1/60; const p = GAME.entities.player; p.update();
  GAME.camera.x = (p.x * GAME.zoom) - GAME.canvas.width / 2; GAME.camera.y = (p.y * GAME.zoom) - GAME.canvas.height / 2;
  if (CONFIG.SCREEN_SHAKE > 0) { GAME.camera.x += (Math.random()-0.5)*CONFIG.SCREEN_SHAKE; GAME.camera.y += (Math.random()-0.5)*CONFIG.SCREEN_SHAKE; CONFIG.SCREEN_SHAKE *= 0.9; }
  
  if (NET.conn) syncPlayer();
  if (NET.isHost && Date.now() - NET.lastSync > 50) { syncWorld(); syncState(); NET.lastSync = Date.now(); LOBBY.broadcast(NET.roomId); }

  for (const id in NET.others) NET.others[id].update();

  if (!NET.peer || NET.isHost || !NET.conn) {
    const targets = getAllTargets();
    const alivePlayers = getAllAlivePlayers();
    if (alivePlayers.length === 0 && GAME.active) gameOver();
    
    GAME.entities.enemies.forEach((e) => {
        e.update();
        targets.forEach(t => {
            if (dist(t.x, t.y, e.x, e.y) < t.radius + e.radius) {
                if (t.isBait) {
                    t.obj.hp -= (e.isBoss ? 5 : 1) * GAME.speedFactor;
                } else {
                    if (t.kaktus) e.hp = 0; // Kaktus instant kill
                    t.hp -= (e.isBoss ? 2 : 0.5) * (t.shield || 1);
                    if (t.hp <= 0) t.dead = true;
                }
                updateUI();
            }
        });
    });
  }
  
  GAME.entities.baits = GAME.entities.baits.filter(b => b.hp > 0);
  GAME.entities.baits.forEach(b => b.update());
  
  GAME.orbiters.forEach(o => o.update());
  GAME.entities.fire.forEach((f, i) => { f.update(); if (f.life <= 0) GAME.entities.fire.splice(i, 1); });

  const enemies = GAME.entities.enemies;
  GAME.entities.projectiles.forEach((proj, pIndex) => {
    proj.update(); 
    if (proj.life <= 0) { GAME.entities.projectiles.splice(pIndex, 1); return; }
    
    if (proj.isEnemy) {
        // Enemy projectiles hit players
        const alivePlayers = getAllAlivePlayers();
        alivePlayers.forEach(p => {
            if (dist(proj.x, proj.y, p.x, p.y) < proj.radius + p.radius) {
                p.hp -= 10 * (p.shield || 1);
                if (p.hp <= 0) p.dead = true;
                GAME.entities.projectiles.splice(pIndex, 1);
                updateUI();
            }
        });
    } else {
        // Player projectiles hit enemies
        enemies.forEach((enemy, eIndex) => {
            if (!proj.hitEnemies.has(enemy) && dist(proj.x, proj.y, enemy.x, enemy.y) < proj.radius + enemy.radius) {
                enemy.hp -= proj.damage; proj.hitEnemies.add(enemy);
                if (proj.bounce > 0) {
                    const targets = enemies.filter(e => e !== enemy && !proj.hitEnemies.has(e));
                    if (targets.length > 0) {
                        const next = targets.sort((a,b) => dist(proj.x, proj.y, a.x, a.y) - dist(proj.x, proj.y, b.x, b.y))[0];
                        const angle = Math.atan2(next.y - proj.y, next.x - proj.x);
                        proj.vx = Math.cos(angle) * CONFIG.PROJECTILE_SPEED; proj.vy = Math.sin(angle) * CONFIG.PROJECTILE_SPEED; proj.bounce--;
                    }
                }
                if (proj.pierce > 1) proj.pierce--; else if (proj.pierce !== Infinity && proj.bounce <= 0) GAME.entities.projectiles.splice(pIndex, 1);
                if (enemy.hp <= 0) { AudioEngine.play('hit'); if(!NET.peer || NET.isHost) GAME.entities.gems.push(new Gem(enemy.x, enemy.y)); enemies.splice(eIndex, 1); GAME.kills++; updateUI(); }
            }
        });
    }
  });
  
  const pForGems = GAME.entities.player;
  for (let i = GAME.entities.gems.length - 1; i >= 0; i--) {
      const g = GAME.entities.gems[i];
      g.update(pForGems); 
      if (!pForGems.dead && dist(pForGems.x, pForGems.y, g.x, g.y) < pForGems.radius + g.radius) { 
          AudioEngine.play('gem'); 
          pForGems.addXp(Math.round(10 * (pForGems.luckFactor || 1))); 
          GAME.entities.gems.splice(i, 1); 
      }
  }
  updateUI();
}

function render() {
  const ctx = GAME.ctx, cam = GAME.camera;
  ctx.save(); ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, GAME.canvas.width, GAME.canvas.height); ctx.scale(GAME.zoom, GAME.zoom);
  const camX = cam.x / GAME.zoom, camY = cam.y / GAME.zoom;
  GAME.stars.forEach(s => {
      const sx = (s.x - camX * 0.1) % (GAME.canvas.width/GAME.zoom), sy = (s.y - camY * 0.1) % (GAME.canvas.height/GAME.zoom);
      ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`; ctx.beginPath(); ctx.arc(sx<0?sx+(GAME.canvas.width/GAME.zoom):sx, sy<0?sy+(GAME.canvas.height/GAME.zoom):sy, s.size, 0, Math.PI*2); ctx.fill();
  });
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)'; ctx.lineWidth = 1; ctx.beginPath();
  const hexRadius = 60, hexHeight = hexRadius * Math.sqrt(3);
  const startCol = Math.floor(camX / (hexRadius * 1.5)) - 1, endCol = startCol + Math.ceil((GAME.canvas.width/GAME.zoom) / (hexRadius * 1.5)) + 2;
  const startRow = Math.floor(camY / hexHeight) - 1, endRow = startRow + Math.ceil((GAME.canvas.height/GAME.zoom) / hexHeight) + 2;
  for (let col = startCol; col <= endCol; col++) {
      for (let row = startRow; row <= endRow; row++) {
          const cx = col * hexRadius * 1.5 - camX, cy = (row * hexHeight + (Math.abs(col) % 2 === 0 ? 0 : hexHeight / 2)) - camY;
          for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const px = cx + Math.cos(a) * hexRadius, py = cy + Math.sin(a) * hexRadius; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      }
  }
  ctx.stroke();
  GAME.entities.fire.forEach(f => f.draw(ctx, {x:camX, y:camY}));
  GAME.entities.baits.forEach(b => b.draw(ctx, {x:camX, y:camY}));
  GAME.entities.gems.forEach(g => g.draw(ctx, {x:camX, y:camY}));
  GAME.entities.projectiles.forEach(p => p.draw(ctx, {x:camX, y:camY}));
  GAME.orbiters.forEach(o => o.draw(ctx, {x:camX, y:camY}));
  GAME.entities.enemies.forEach(e => e.draw(ctx, {x:camX, y:camY}));
  for (const id in NET.others) NET.others[id].draw(ctx, {x:camX, y:camY});
  if (GAME.entities.player) GAME.entities.player.draw(ctx, {x:camX, y:camY});
  ctx.restore(); 
  if (window.innerWidth < 850) {
      ctx.save(); const sx = GAME.joystick.startX, sy = GAME.joystick.startY, cx = GAME.joystick.currentX, cy = GAME.joystick.currentY;
      ctx.beginPath(); ctx.arc(sx, sy, 75, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 32, 0, Math.PI * 2); ctx.fillStyle = 'rgba(99, 102, 241, 0.5)'; ctx.shadowBlur = 20; ctx.shadowColor = '#6366f1'; ctx.fill(); ctx.restore();
  }
}

init();

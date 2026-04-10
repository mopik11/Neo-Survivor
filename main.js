/**
 * NEO SURVIVOR - Core Game Logic
 */

// Error catching
window.onerror = function(msg, url, line, col, error) {
    console.error(error);
    return false;
};

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

const NET = {
    peer: null,
    conn: null,
    isHost: false,
    others: {},
    roomId: null,
    lastSync: 0,
    playerSyncThrottle: 0
};

const META = { currency: 0, upgrades: { hp: 0, speed: 0, luck: 0, hat: null } };
const saveMeta = () => localStorage.setItem('neoSurvivor_meta', JSON.stringify(META));
const loadMeta = () => {
    const data = localStorage.getItem('neoSurvivor_meta');
    if (data) Object.assign(META, JSON.parse(data));
};

const GAME = {
  active: false, paused: false, score: 0, kills: 0, time: 0, lastBossTime: 0,
  speedFactor: 1.0, zoom: 1.0, upgradeOptionsCount: 3,
  entities: { player: null, enemies: [], projectiles: [], gems: [], particles: [], fire: [] },
  camera: { x: 0, y: 0 }, input: { w: false, a: false, s: false, d: false },
  joystick: { active: false, startX: 80, startY: 0, currentX: 80, currentY: 0, radius: 75 },
  stars: [], orbiters: [], lastSniperTime: 0, canvas: null, ctx: null
};

const updateSpeedFactor = () => {
    const baseWidth = 1200;
    const isMobile = window.innerWidth < 850;
    GAME.speedFactor = Math.max(0.4, Math.min(1.2, window.innerWidth / baseWidth));
    GAME.zoom = isMobile ? 0.7 : 1.0;
    GAME.joystick.startX = 80; GAME.joystick.startY = window.innerHeight - 80;
    if (!GAME.joystick.active) { GAME.joystick.currentX = GAME.joystick.startX; GAME.joystick.currentY = GAME.joystick.startY; }
};

const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const randomRange = (min, max) => Math.random() * (max - min) + min;

function shakeScreen(amount = 5) { CONFIG.SCREEN_SHAKE = amount; }

const AudioEngine = {
    ctx: null, musicStarted: false, menuMelodyInterval: null,
    init() { if (this.ctx) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {} },
    playSynth(time, freq, vol, duration, type='square') {
        const osc = this.ctx.createOscillator(); const g = this.ctx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(freq, time);
        g.gain.setValueAtTime(vol, time); g.gain.exponentialRampToValueAtTime(0.001, time + duration);
        osc.connect(g); g.connect(this.ctx.destination);
        osc.start(time); osc.stop(time + duration);
    },
    play(type) {
        if (!this.ctx) return; if (this.ctx.state === 'suspended') this.ctx.resume();
        const now = this.ctx.currentTime;
        if (type === 'shoot') { this.playSynth(now, 440, 0.05, 0.1, 'triangle'); }
        else if (type === 'hit') { this.playSynth(now, 100, 0.05, 0.1, 'sawtooth'); }
        else if (type === 'lvlup') { this.playSynth(now, 220, 0.1, 0.5, 'sine'); }
        else if (type === 'gem') { this.playSynth(now, 660, 0.03, 0.1, 'sine'); }
    },
    startMenuMusic() {
        if (this.menuMelodyInterval) return;
        this.init();
        const notes = { 'C': 261.63, 'D': 293.66, 'E': 329.63, 'F': 349.23, 'G': 392.00 };
        const melody = [
            'E', null, 'F', null, 'G', null, null, 'E', 
            null, 'F', null, 'G', null, 'D', null, 'C'
        ];
        let step = 0;
        this.menuMelodyInterval = setInterval(() => {
            if (!GAME.active && this.ctx) {
                const now = this.ctx.currentTime;
                const note = melody[step % melody.length];
                if (note) this.playSynth(now, notes[note], 0.05, 0.3, 'sine');
                step++;
            }
        }, 150); // Eighth note speed
    },
    stopMenuMusic() { clearInterval(this.menuMelodyInterval); this.menuMelodyInterval = null; },
    startMusic() {
        if (this.musicStarted || !this.ctx) return;
        this.musicStarted = true; this.stopMenuMusic();
        const playNoise = (time, vol, duration) => {
            const bufferSize = this.ctx.sampleRate * duration; const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const src = this.ctx.createBufferSource(); src.buffer = buffer;
            const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, time); g.gain.exponentialRampToValueAtTime(0.001, time + duration);
            src.connect(g); g.connect(this.ctx.destination); src.start(time); src.stop(time + duration);
        };
        let step = 0;
        const bass = [55, 55, 62, 49, 55, 55, 73, 65];
        setInterval(() => {
            if (GAME.active && !GAME.paused && this.ctx) {
                const now = this.ctx.currentTime;
                this.playSynth(now, bass[step % 8], 0.03, 0.4, 'sawtooth');
                if (step % 2 === 0) this.playSynth(now, 60, 0.08, 0.2, 'sine');
                if (step % 4 === 2) playNoise(now, 0.02, 0.15);
                step++;
            }
        }, 150);
    }
};

class Fire {
    constructor(x, y, damage) { this.x = x; this.y = y; this.damage = damage; this.radius = 25; this.life = 1.5; }
    update() {
        this.life -= 1/60;
        GAME.entities.enemies.forEach(e => { if (dist(this.x, this.y, e.x, e.y) < this.radius + e.radius) e.hp -= this.damage * (1/60); });
    }
    draw(ctx, cam) {
        ctx.globalAlpha = this.life / 1.5; ctx.shadowBlur = 10; ctx.shadowColor = '#f59e0b'; ctx.fillStyle = '#f59e0b';
        ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;
    }
}

class Projectile {
  constructor(x, y, targetX, targetY, damage, stats = {}) {
    this.x = x; this.y = y;
    const a = Math.atan2(targetY - y, targetX - x);
    this.vx = Math.cos(a) * CONFIG.PROJECTILE_SPEED; this.vy = Math.sin(a) * CONFIG.PROJECTILE_SPEED;
    this.damage = damage; this.radius = stats.size || 6; this.life = 200; this.pierce = stats.pierce || 1;
    this.bounce = stats.bounce || 0; this.hitEnemies = new Set(); this.ownerId = stats.ownerId || 'local';
  }
  update() { this.x += this.vx * GAME.speedFactor; this.y += this.vy * GAME.speedFactor; this.life--; }
  draw(ctx, cam) {
    ctx.shadowBlur = 15; ctx.shadowColor = this.ownerId === 'local' ? '#6366f1' : '#f43f5e'; ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }
}

class Gem {
  constructor(x, y, id = Math.random().toString(36).substr(2, 9)) { this.x = x; this.y = y; this.radius = 5; this.attracted = false; this.id = id; }
  update(player) {
    if (player.dead) return;
    const d = dist(this.x, this.y, player.x, player.y);
    if (d < player.magnetRange) this.attracted = true;
    if (this.attracted) {
      const a = Math.atan2(player.y - this.y, player.x - this.x);
      this.x += Math.cos(a) * 14 * GAME.speedFactor; this.y += Math.sin(a) * 14 * GAME.speedFactor;
    }
  }
  draw(ctx, cam) {
    ctx.shadowBlur = 15; ctx.shadowColor = '#10b981'; ctx.fillStyle = '#34d399';
    ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
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
    ctx.beginPath(); ctx.arc(x - cam.x, y - cam.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    GAME.entities.enemies.forEach(e => { if (dist(x, y, e.x, e.y) < this.size + e.radius) e.hp -= this.owner.damage * 0.9; });
  }
}

function getAllAlivePlayers() {
    const list = []; if (GAME.entities.player && !GAME.entities.player.dead) list.push(GAME.entities.player);
    for (const id in NET.others) { if (!NET.others[id].dead) list.push(NET.others[id]); }
    return list;
}

class Boss {
  constructor(x, y, level = 1, id = Math.random().toString(36).substr(2, 9)) {
    this.x = x; this.y = y; this.radius = 50; this.id = id; this.maxHp = CONFIG.ENEMY_BASE_HEALTH * 30 * level; this.hp = this.maxHp;
    this.speed = CONFIG.ENEMY_BASE_SPEED * 0.8; this.isBoss = true; this.knockback = { x: 0, y: 0 };
    this.targetX = x; this.targetY = y;
  }
  update() {
    if (!NET.peer || NET.isHost) {
        const players = getAllAlivePlayers(); if (players.length === 0) return;
        const target = players.sort((a,b) => dist(this.x,this.y,a.x,a.y) - dist(this.x,this.y,b.x,b.y))[0];
        const a = Math.atan2(target.y - this.y, target.x - this.x);
        let ss = 1.0; players.forEach(p => { if (p.aura && dist(this.x, this.y, p.x, p.y) < p.auraRange) ss *= 0.5; });
        const curSp = this.speed * ss * GAME.speedFactor;
        this.x += Math.cos(a) * curSp + this.knockback.x; this.y += Math.sin(a) * curSp + this.knockback.y;
        this.knockback.x *= 0.9; this.knockback.y *= 0.9;
    } else {
        this.x += (this.targetX - this.x) * 0.2; this.y += (this.targetY - this.y) * 0.2;
    }
  }
  draw(ctx, cam) {
    const ratio = this.hp / this.maxHp; ctx.shadowBlur = 40; ctx.shadowColor = '#ef4444'; ctx.fillStyle = '#ef4444';
    ctx.beginPath(); for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + (Date.now() / 1000); const px = this.x - cam.x + Math.cos(a) * this.radius, py = this.y - cam.y + Math.sin(a) * this.radius;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(this.x - cam.x - 50, this.y - cam.y - 80, 100, 10);
    ctx.fillStyle = '#ef4444'; ctx.fillRect(this.x - cam.x - 50, this.y - cam.y - 80, 100 * ratio, 10);
    ctx.shadowBlur = 0;
  }
}

class Enemy {
  constructor(x, y, level = 1, id = Math.random().toString(36).substr(2, 9)) {
    this.x = x; this.y = y; this.radius = 18; this.id = id; this.maxHp = CONFIG.ENEMY_BASE_HEALTH * level; this.hp = this.maxHp;
    this.speed = CONFIG.ENEMY_BASE_SPEED + (level * 0.15); this.knockback = { x: 0, y: 0 };
    this.targetX = x; this.targetY = y;
  }
  update() {
    if (!NET.peer || NET.isHost) {
        const p = getAllAlivePlayers(); if (p.length === 0) return;
        const target = p.sort((a,b) => dist(this.x,this.y,a.x,a.y) - dist(this.x,this.y,b.x,b.y))[0];
        const a = Math.atan2(target.y - this.y, target.x - this.x);
        let ss = 1.0; p.forEach(pl => { if (pl.aura && dist(this.x, this.y, pl.x, pl.y) < pl.auraRange) ss *= 0.5; });
        const curSp = this.speed * ss * GAME.speedFactor;
        this.x += Math.cos(a) * curSp + this.knockback.x; this.y += Math.sin(a) * curSp + this.knockback.y;
        this.knockback.x *= 0.8; this.knockback.y *= 0.8;
    } else {
        this.x += (this.targetX - this.x) * 0.2; this.y += (this.targetY - this.y) * 0.2;
    }
  }
  draw(ctx, cam) {
    const pl = getAllAlivePlayers(); const target = pl.length > 0 ? pl.sort((a,b) => dist(this.x,this.y,a.x,a.y) - dist(this.x,this.y,b.x,b.y))[0] : {x:0, y:0};
    const a = Math.atan2(target.y - this.y, target.x - this.x);
    ctx.shadowBlur = 15; ctx.shadowColor = '#ef4444'; ctx.fillStyle = '#ef4444';
    ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-12, 12); ctx.lineTo(-12, -12); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.shadowBlur = 0;
  }
}

class Player {
  constructor(isLocal = true) {
    this.x = 0; this.y = 0; this.radius = 22; this.isLocal = isLocal;
    this.maxHp = CONFIG.PLAYER_BASE_HEALTH + (isLocal ? (META.upgrades.hp * 10) : 0); this.hp = this.maxHp;
    this.speed = CONFIG.PLAYER_BASE_SPEED * (isLocal ? (1 + (META.upgrades.speed * 0.02)) : 1);
    this.damage = 10; this.projectileCount = 1; this.fireRate = 1000; this.magnetRange = 150; this.shield = 1.0; this.regen = 0;
    this.level = 1; this.xp = 0; this.nextLevelXp = CONFIG.XP_PER_LEVEL; this.dead = false; this.targetX = 0; this.targetY = 0;
  }
  update() {
    if (this.dead) return;
    if (!this.isLocal) { this.x += (this.targetX - this.x) * 0.25; this.y += (this.targetY - this.y) * 0.25; return; }
    let dx = 0, dy = 0;
    if (GAME.joystick.active) {
        const jdx = GAME.joystick.currentX - GAME.joystick.startX, jdy = GAME.joystick.currentY - GAME.joystick.startY;
        const d = dist(0, 0, jdx, jdy); if (d > 5) { dx = jdx / d; dy = jdy / d; }
    } else { if (GAME.input.w) dy -= 1; if (GAME.input.s) dy += 1; if (GAME.input.a) dx -= 1; if (GAME.input.d) dx += 1; }
    if (dx !== 0 || dy !== 0) {
      const a = Math.atan2(dy, dx); this.x += Math.cos(a) * this.speed * GAME.speedFactor; this.y += Math.sin(a) * this.speed * GAME.speedFactor;
    }
    const now = Date.now();
    if (this.regen > 0 && now - this.lastRegen > 1000) { this.hp = Math.min(this.maxHp, this.hp + this.regen); this.lastRegen = now; updateUI(); }
    if (now - this.lastFired > this.fireRate) { this.attack(); this.lastFired = now; }
  }
  attack() {
    if (this.dead) return; const enemies = GAME.entities.enemies; if (enemies.length === 0) return;
    const target = enemies.sort((a,b) => dist(this.x,this.y,a.x,a.y) - dist(this.x,this.y,b.x,b.y))[0];
    for (let i = 0; i < this.projectileCount; i++) {
        const proj = new Projectile(this.x, this.y, target.x, target.y, this.damage); GAME.entities.projectiles.push(proj);
        if (NET.conn) syncShot(proj);
    }
    AudioEngine.play('shoot');
  }
  draw(ctx, cam) {
    if (this.dead) ctx.globalAlpha = 0.2;
    ctx.shadowBlur = 30; ctx.shadowColor = this.isLocal ? '#6366f1' : '#f43f5e'; ctx.fillStyle = this.isLocal ? '#f8fafc' : '#fca5a5';
    ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = this.isLocal ? '#6366f1' : '#f43f5e'; ctx.lineWidth = 4; ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;
  }
  addXp(amount) { 
      if (NET.conn && !NET.isHost) { NET.conn.send({ type: 'PICKUP_XP', amount: amount }); return; }
      this.xp += amount; if (this.xp >= this.nextLevelXp) this.levelUp(); updateUI(); 
  }
  levelUp() { 
      this.level++; this.xp -= this.nextLevelXp; this.nextLevelXp = Math.floor(this.nextLevelXp * 1.25); AudioEngine.play('lvlup'); 
      if (NET.isHost) { GAME.paused = true; if (NET.conn) { NET.conn.send({ type: 'SHOW_UPGRADES' }); syncState(); } showLevelUp(); }
  }
}

function updateUI() {
  const p = GAME.entities.player; if (!p) return;
  document.getElementById('level-display').innerText = `LVL ${p.level}`;
  document.getElementById('xp-bar-fill').style.width = `${(p.xp / p.nextLevelXp) * 100}%`;
  document.getElementById('hp-bar-fill').style.width = `${(p.hp / p.maxHp) * 100}%`;
  document.getElementById('kill-count').innerText = GAME.kills;
}

function showLevelUp() {
    GAME.paused = true; const modal = document.getElementById('levelup-modal'); const container = document.getElementById('upgrade-options');
    container.innerHTML = ''; const selected = [...CONFIG.UPGRADES].sort(() => 0.5 - Math.random()).slice(0, 3);
    selected.forEach(u => {
        const card = document.createElement('div'); card.className = 'upgrade-card';
        card.innerHTML = `<div class="upgrade-icon">${u.icon}</div><h3>${u.name}</h3><p>${u.desc}</p>`;
        card.onclick = () => { applyUpgrade(u.id); }; container.appendChild(card);
    });
    modal.classList.add('active');
}

function applyUpgrade(id) {
    const p = GAME.entities.player;
    if (id === 'damage') p.damage *= 2; else if (id === 'speed') p.speed *= 1.15; else if (id === 'count') p.projectileCount++;
    document.getElementById('levelup-modal').classList.remove('active');
    if (NET.isHost) { GAME.paused = false; if (NET.conn) syncState(); }
}

function spawnEnemy() {
  if (!GAME.active || GAME.paused || (NET.conn && !NET.isHost)) { setTimeout(spawnEnemy, 500); return; }
  const alive = getAllAlivePlayers(); if (alive.length === 0) { setTimeout(spawnEnemy, 1000); return; }
  const a = Math.random()*2*Math.PI, pivot = alive[Math.floor(Math.random()*alive.length)];
  const x = pivot.x + Math.cos(a)*700, y = pivot.y + Math.sin(a)*700;
  GAME.entities.enemies.push(new Enemy(x, y, Math.floor(GAME.time/60)+1));
  if (NET.isHost) syncWorld();
  setTimeout(spawnEnemy, 800);
}

function initPeer() {
    if (NET.peer) return; const id = Math.random().toString(36).substr(2, 6).toUpperCase();
    NET.peer = new Peer(id);
    NET.peer.on('open', (v) => { NET.roomId = v; document.getElementById('my-id-display').innerText = v; });
    NET.peer.on('connection', (c) => { NET.conn = c; NET.isHost = true; setupConn(); startGame(); });
}

function setupConn() {
    NET.conn.on('data', (d) => {
        if (d.type === 'PLAYER_SYNC') {
            if (!NET.others[d.id]) NET.others[d.id] = new Player(false);
            const o = NET.others[d.id]; o.targetX = d.x; o.targetY = d.y; o.dead = d.dead;
        }
        else if (d.type === 'PICKUP_XP' && NET.isHost) GAME.entities.player.addXp(d.amount);
        else if (d.type === 'SHOW_UPGRADES') showLevelUp();
        else if (d.type === 'STATE_SYNC') {
            const p = GAME.entities.player; p.level = d.lvl; p.xp = d.xp; p.nextLevelXp = d.next; p.hp = d.hp;
            GAME.paused = d.paused; GAME.time = d.time; updateUI(); 
        }
        else if (d.type === 'WORLD_STATE') {
            if (!GAME.active) startGame();
            d.enemies.forEach(he => {
                let e = GAME.entities.enemies.find(le => le.id === he.id);
                if (!e) { e = new Enemy(he.x, he.y, 1, he.id); GAME.entities.enemies.push(e); }
                e.targetX = he.x; e.targetY = he.y; e.hp = he.hp;
            });
            GAME.entities.enemies = GAME.entities.enemies.filter(le => d.enemies.some(he => he.id === le.id));
            GAME.entities.gems = d.gems.map(hg => new Gem(hg.x, hg.y, hg.id));
        }
        else if (d.type === 'SHOT') { GAME.entities.projectiles.push(new Projectile(d.x, d.y, d.tx, d.ty, d.dmg, {ownerId:'remote'})); }
    });
}

function syncPlayer() {
    if (!NET.conn) return; const now = Date.now(); if (now - NET.playerSyncThrottle < 20) return;
    NET.playerSyncThrottle = now; NET.conn.send({ type: 'PLAYER_SYNC', id: NET.roomId, x: GAME.entities.player.x, y: GAME.entities.player.y, dead: GAME.entities.player.dead });
}

function syncShot(p) { if (NET.conn) { const a = Math.atan2(p.vy, p.vx); NET.conn.send({ type: 'SHOT', x: p.x, y: p.y, tx: p.x + Math.cos(a)*100, ty: p.y + Math.sin(a)*100, dmg: p.damage }); } }
function syncState() { if (NET.isHost && NET.conn) { const p = GAME.entities.player; NET.conn.send({ type: 'STATE_SYNC', lvl: p.level, xp: p.xp, next: p.nextLevelXp, paused: GAME.paused, time: GAME.time, hp: p.hp }); } }
function syncWorld() { if (NET.isHost && NET.conn) NET.conn.send({ type: 'WORLD_STATE', enemies: GAME.entities.enemies.map(e => ({ id: e.id, x: e.x, y: e.y, hp: e.hp })), gems: GAME.entities.gems.map(g => ({ id: g.id, x: g.x, y: g.y })) }); }

function init() {
  GAME.canvas = document.getElementById('game-canvas'); GAME.ctx = GAME.canvas.getContext('2d'); updateSpeedFactor();
  window.addEventListener('resize', () => { GAME.canvas.width = window.innerWidth; GAME.canvas.height = window.innerHeight; updateSpeedFactor(); });
  GAME.canvas.width = window.innerWidth; GAME.canvas.height = window.innerHeight; resetGame();
  window.addEventListener('keydown', (e) => { GAME.input[e.key.toLowerCase()] = true; if (e.key === 'Escape') togglePause(); });
  window.addEventListener('keyup', (e) => { GAME.input[e.key.toLowerCase()] = false; });
  document.getElementById('btn-start').onclick = () => { AudioEngine.init(); AudioEngine.startMusic(); startGame(); };
  document.getElementById('btn-multiplayer').onclick = () => { initPeer(); AudioEngine.startMenuMusic(); document.getElementById('multiplayer-modal').classList.add('active'); };
  document.getElementById('btn-create-host').onclick = () => { if (NET.roomId) { NET.isHost = true; startGame(); } };
  document.getElementById('btn-join-room').onclick = () => { const id = document.getElementById('input-join-id').value.trim().toUpperCase(); if (id) { if (!NET.peer) initPeer(); NET.conn = NET.peer.connect(id); NET.isHost = false; setupConn(); } };
  document.querySelectorAll('.btn-reload').forEach(btn => btn.onclick = () => location.reload());
  AudioEngine.startMenuMusic(); spawnEnemy(); requestAnimationFrame(loop);
}

function startGame() { resetGame(); GAME.active = true; document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); AudioEngine.startMusic(); }
function resetGame() { GAME.entities.player = new Player(true); GAME.entities.enemies = []; GAME.entities.projectiles = []; updateUI(); }
function loop() { if (GAME.active) update(); render(); requestAnimationFrame(loop); }
function togglePause() { if (GAME.active && (!NET.conn || NET.isHost)) { GAME.paused = !GAME.paused; if(NET.isHost) syncState(); } }

function update() {
  if (GAME.paused) return; GAME.time += 1/60; const p = GAME.entities.player; p.update();
  GAME.camera.x = (p.x * GAME.zoom) - GAME.canvas.width/2; GAME.camera.y = (p.y * GAME.zoom) - GAME.canvas.height/2;
  if (NET.conn) syncPlayer(); if (NET.isHost && Date.now() - NET.lastSync > 80) { syncWorld(); syncState(); NET.lastSync = Date.now(); }
  for (const id in NET.others) NET.others[id].update();
  if (!NET.peer || NET.isHost) {
    const ap = getAllAlivePlayers(); GAME.entities.enemies.forEach(e => { e.update(); ap.forEach(p => { if (dist(p.x,p.y,e.x,e.y) < p.radius+e.radius) { p.hp -= 0.5; if (p.hp<=0) p.dead=true; updateUI(); } }); });
  } else { GAME.entities.enemies.forEach(e => e.update()); }
  GAME.entities.projectiles.forEach((pr, i) => { pr.update(); if (pr.life<=0) GAME.entities.projectiles.splice(i,1); });
  GAME.entities.gems.forEach((g, i) => { g.update(p); if (dist(p.x,p.y,g.x,g.y) < p.radius+g.radius) { AudioEngine.play('gem'); p.addXp(10); GAME.entities.gems.splice(i,1); } });
}

function render() {
  const ctx = GAME.ctx, cam = GAME.camera; ctx.save(); ctx.fillStyle = '#020617'; ctx.fillRect(0,0,GAME.canvas.width,GAME.canvas.height); ctx.scale(GAME.zoom, GAME.zoom);
  const cx = cam.x/GAME.zoom, cy = cam.y/GAME.zoom; ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = (cx % 60); x < GAME.canvas.width/GAME.zoom; x += 60) { ctx.moveTo(x, 0); ctx.lineTo(x, GAME.canvas.height/GAME.zoom); }
  for (let y = (cy % 60); y < GAME.canvas.height/GAME.zoom; y += 60) { ctx.moveTo(0, y); ctx.lineTo(GAME.canvas.width/GAME.zoom, y); }
  ctx.stroke();
  GAME.entities.gems.forEach(g => g.draw(ctx, {x:cx, y:cy})); GAME.entities.projectiles.forEach(p => p.draw(ctx, {x:cx, y:cy}));
  GAME.entities.enemies.forEach(e => e.draw(ctx, {x:cx, y:cy})); for (const id in NET.others) NET.others[id].draw(ctx, {x:cx, y:cy});
  if (GAME.entities.player) GAME.entities.player.draw(ctx, {x:cx, y:cy}); ctx.restore();
}

init();

/**
 * NEO SURVIVOR - Core Game Logic
 */

// Error catching
window.onerror = function(msg, url, line, col, error) {
    alert("KRITICKÁ CHYBA: " + msg + "\nNa lince: " + line);
    console.error(error); return false;
};

const CONFIG = {
  PLAYER_BASE_SPEED: 4, PLAYER_BASE_HEALTH: 120, ENEMY_BASE_HEALTH: 20, ENEMY_BASE_SPEED: 2.2,
  PROJECTILE_SPEED: 11, SPAWN_INTERVAL: 800, SPAWN_RADIUS: 700, GEM_VALUES: 10, XP_PER_LEVEL: 100,
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
    { id: 'pierce', name: 'Průraznost', desc: 'Střely projdou více nepřátely', icon: '🏹' },
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
  SCREEN_SHAKE: 0, BOSS_INTERVAL: 60, SNIPER_COOLDOWN: 15000,
};

const NET = { peer: null, conn: null, isHost: false, others: {}, roomId: null, lastSync: 0, playerSyncThrottle: 0, worldSyncThrottle: 0 };
const META = { currency: 0, upgrades: { hp: 0, speed: 0, luck: 0, hat: null } };
const saveMeta = () => localStorage.setItem('neoSurvivor_meta', JSON.stringify(META));
const loadMeta = () => { const data = localStorage.getItem('neoSurvivor_meta'); if (data) Object.assign(META, JSON.parse(data)); };

const GAME = {
  active: false, paused: false, score: 0, kills: 0, time: 0, lastBossTime: 0, speedFactor: 1.0, zoom: 1.0, 
  upgradeOptionsCount: 3, entities: { player: null, enemies: [], projectiles: [], gems: [], particles: [], fire: [] },
  camera: { x: 0, y: 0 }, input: { w: false, a: false, s: false, d: false },
  joystick: { active: false, startX: 80, startY: 0, currentX: 80, currentY: 0, radius: 75 },
  stars: [], orbiters: [], lastSniperTime: 0, canvas: null, ctx: null
};

const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const randomRange = (min, max) => Math.random() * (max - min) + min;

const AudioEngine = {
    ctx: null, musicStarted: false, menuMelodyStarted: false,
    init() { if (this.ctx) return; this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
    play(type) {
        if (!this.ctx) return; if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
        osc.connect(gain); gain.connect(this.ctx.destination);
        const now = this.ctx.currentTime;
        if (type === 'shoot') { osc.type = 'triangle'; osc.frequency.setValueAtTime(440, now); osc.frequency.exponentialRampToValueAtTime(110, now + 0.1); gain.gain.setValueAtTime(0.05, now); osc.start(); osc.stop(now + 0.1); }
        else if (type === 'hit') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, now); gain.gain.setValueAtTime(0.05, now); osc.start(); osc.stop(now + 0.1); }
        else if (type === 'lvlup') { osc.type = 'sine'; osc.frequency.setValueAtTime(220, now); osc.frequency.exponentialRampToValueAtTime(880, now + 0.5); gain.gain.setValueAtTime(0.1, now); osc.start(); osc.stop(now + 0.5); }
        else if (type === 'gem') { osc.type = 'sine'; osc.frequency.setValueAtTime(660, now); gain.gain.setValueAtTime(0.03, now); osc.start(); osc.stop(now + 0.1); }
    },
    playNote(freq, start, duration, vol = 0.05) {
        const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(freq, start);
        g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(g); g.connect(this.ctx.destination);
        osc.start(start); osc.stop(start + duration);
    },
    startMenuMelody() {
        if (this.menuMelodyStarted || !this.ctx) return; this.menuMelodyStarted = true;
        const notes = { 'c': 261.6, 'd': 293.7, 'e': 329.6, 'f': 349.2, 'g': 392.0 };
        const melody = ['e','f','g','rest','e','f','g','d','c'];
        let step = 0;
        setInterval(() => {
            if (!GAME.active) {
                const now = this.ctx.currentTime;
                const note = melody[step % melody.length];
                if (note !== 'rest') this.playNote(notes[note], now, 0.4);
                step++;
            }
        }, 300); // 8th rests approx
    },
    startMusic() {
        if (this.musicStarted || !this.ctx) return; this.musicStarted = true;
        let step = 0;
        setInterval(() => {
            if (GAME.active && !GAME.paused) {
                const now = this.ctx.currentTime;
                const bass = [55, 55, 62, 49][step % 4];
                this.playNote(bass, now, 0.4, 0.02);
                if (step % 2 === 1) this.playNote(110, now, 0.1, 0.01);
                step++;
            }
        }, 150);
    }
};

class Projectile {
  constructor(x, y, targetX, targetY, damage, stats = {}) {
    this.x = x; this.y = y; const angle = Math.atan2(targetY - y, targetX - x);
    this.vx = Math.cos(angle) * CONFIG.PROJECTILE_SPEED; this.vy = Math.sin(angle) * CONFIG.PROJECTILE_SPEED;
    this.damage = damage; this.radius = stats.size || 6; this.life = 200; this.pierce = stats.pierce || 1; this.bounce = stats.bounce || 0;
    this.hitEnemies = new Set(); this.ownerId = stats.ownerId || 'local';
  }
  update() { this.x += this.vx * GAME.speedFactor; this.y += this.vy * GAME.speedFactor; this.life--; }
  draw(ctx, cam) { ctx.shadowBlur = 15; ctx.shadowColor = this.ownerId === 'local' ? '#6366f1' : '#f43f5e'; ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
}

class Gem {
  constructor(x, y, id = Math.random().toString(36).substr(2,9)) { this.x = x; this.y = y; this.radius = 5; this.attracted = false; this.id = id; }
  update(player) {
      if (player.dead) return; const d = dist(this.x, this.y, player.x, player.y); if (d < player.magnetRange) this.attracted = true;
      if (this.attracted) { const angle = Math.atan2(player.y - this.y, player.x - this.x); this.x += Math.cos(angle) * 14 * GAME.speedFactor; this.y += Math.sin(angle) * 14 * GAME.speedFactor; }
  }
  draw(ctx, cam) { ctx.shadowBlur = 15; ctx.shadowColor = '#10b981'; ctx.fillStyle = '#34d399'; ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
}

class Orbiter {
  constructor(owner, index, total) { this.owner = owner; this.index = index; this.total = total; this.angle = (index / total) * Math.PI * 2; this.radius = 120; this.size = 15; }
  update() { this.angle += 0.05 * GAME.speedFactor; }
  draw(ctx, cam) {
    if (this.owner.dead) return; const x = this.owner.x + Math.cos(this.angle) * this.radius, y = this.owner.y + Math.sin(this.angle) * this.radius;
    ctx.shadowBlur = 20; ctx.shadowColor = '#fbbf24'; ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(x - cam.x, y - cam.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    GAME.entities.enemies.forEach(e => { if (dist(x, y, e.x, e.y) < this.size + e.radius) { e.hp -= this.owner.damage * 0.9; } });
  }
}

function getAllAlivePlayers() { const list = []; if (GAME.entities.player && !GAME.entities.player.dead) list.push(GAME.entities.player); for (const id in NET.others) if (!NET.others[id].dead) list.push(NET.others[id]); return list; }

class Enemy {
  constructor(x, y, level = 1, id = Math.random().toString(36).substr(2, 9), isBoss = false) {
    this.x = x; this.y = y; this.radius = isBoss ? 50 : 18; this.id = id; this.isBoss = isBoss;
    this.maxHp = CONFIG.ENEMY_BASE_HEALTH * (isBoss ? 30 : 1) * level; this.hp = this.maxHp;
    this.speed = (CONFIG.ENEMY_BASE_SPEED + (level * 0.15)) * (isBoss ? 0.8 : 1); this.knockback = { x: 0, y: 0 };
  }
  update() {
    const players = getAllAlivePlayers(); if (players.length === 0) return;
    const target = players.sort((a,b) => dist(this.x,this.y,a.x,a.y) - dist(this.x,this.y,b.x,b.y))[0];
    const angle = Math.atan2(target.y - this.y, target.x - this.x);
    let ss = 1.0; players.forEach(p => { if (p.aura && dist(this.x, this.y, p.x, p.y) < p.auraRange) ss *= 0.5; });
    this.x += Math.cos(angle) * this.speed * ss * GAME.speedFactor + this.knockback.x;
    this.y += Math.sin(angle) * this.speed * ss * GAME.speedFactor + this.knockback.y;
    this.knockback.x *= 0.8; this.knockback.y *= 0.8;
  }
  draw(ctx, cam) {
    const players = getAllAlivePlayers(); if (players.length === 0) return;
    const target = players.sort((a,b) => dist(this.x,this.y,a.x,a.y) - dist(this.x,this.y,b.x,b.y))[0];
    const angle = Math.atan2(target.y - this.y, target.x - this.x);
    ctx.shadowBlur = this.isBoss ? 40 : 15; ctx.shadowColor = '#ef4444'; ctx.fillStyle = '#ef4444';
    ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y); ctx.rotate(angle);
    if(this.isBoss){ ctx.beginPath(); for(let i=0;i<6;i++){ const a=(i/6)*Math.PI*2; ctx.lineTo(Math.cos(a)*50, Math.sin(a)*50); } ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-12, 12); ctx.lineTo(-12, -12); ctx.fill(); }
    ctx.restore(); ctx.shadowBlur = 0;
  }
}

class Player {
  constructor(isLocal = true) {
    this.x = 0; this.y = 0; this.radius = 22; this.isLocal = isLocal;
    this.maxHp = CONFIG.PLAYER_BASE_HEALTH + (isLocal ? (META.upgrades.hp * 10) : 0); this.hp = this.maxHp;
    this.speed = CONFIG.PLAYER_BASE_SPEED * (isLocal ? (1 + (META.upgrades.speed * 0.02)) : 1);
    this.damage = 10; this.projectileCount = 1; this.fireRate = 1000; this.magnetRange = 150; this.shield = 1.0; this.regen = 0;
    this.xpGenInterval = 0; this.lastXpGen = 0; this.ultraMagnet = false; this.pierceCount = 1; this.projSize = 6; this.critChance = 0;
    this.luckFactor = 1.0 + (isLocal ? (META.upgrades.luck * 0.05) : 0); this.orbitals = 0; this.xpMultiplier = 1.0; this.aura = false; this.auraRange = 150;
    this.dead = false; this.level = 1; this.xp = 0; this.nextLevelXp = CONFIG.XP_PER_LEVEL; this.targetX = 0; this.targetY = 0;
  }
  update() {
    if (this.dead) return;
    if (!this.isLocal) { this.x += (this.targetX - this.x) * 0.25; this.y += (this.targetY - this.y) * 0.25; return; }
    let dx = 0, dy = 0;
    if (GAME.joystick.active) { const j = GAME.joystick; const d = dist(j.startX, j.startY, j.currentX, j.currentY); if (d > 5) { dx = (j.currentX - j.startX)/d; dy = (j.currentY - j.startY)/d; } }
    else { if (GAME.input.w) dy -= 1; if (GAME.input.s) dy += 1; if (GAME.input.a) dx -= 1; if (GAME.input.d) dx += 1; }
    if (dx !== 0 || dy !== 0) { const a = Math.atan2(dy, dx); this.x += Math.cos(a) * this.speed * GAME.speedFactor; this.y += Math.sin(a) * this.speed * GAME.speedFactor; }
    const now = Date.now(); if (this.regen > 0 && now - this.lastRegen > 1000) { this.hp = Math.min(this.maxHp, this.hp + this.regen); this.lastRegen = now; updateUI(); }
    if (now - this.lastFired > this.fireRate) { this.attack(); this.lastFired = now; }
  }
  attack() {
    if (this.dead) return; const enemies = GAME.entities.enemies; if (enemies.length === 0) return;
    const target = [...enemies].sort((a,b) => dist(this.x,this.y,a.x,a.y) - dist(this.x,this.y,b.x,b.y))[0];
    for (let i = 0; i < this.projectileCount; i++) {
        const proj = new Projectile(this.x, this.y, target.x, target.y, this.damage, {size:this.projSize, pierce:this.pierceCount});
        GAME.entities.projectiles.push(proj); if (NET.conn) syncShot(proj);
    }
    if (this.orbitals !== GAME.orbiters.length) { GAME.orbiters = []; for (let i = 0; i < this.orbitals; i++) GAME.orbiters.push(new Orbiter(this, i, this.orbitals)); }
    AudioEngine.play('shoot');
  }
  draw(ctx, cam) {
    if (this.dead) ctx.globalAlpha = 0.2; ctx.shadowBlur = 30; ctx.shadowColor = this.isLocal ? '#6366f1' : '#f43f5e'; ctx.fillStyle = this.isLocal ? '#f8fafc' : '#fca5a5';
    ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
    const hat = this.isLocal ? META.upgrades.hat : this.remoteHat; if (hat) { ctx.font='28px serif'; ctx.textAlign='center'; ctx.textBaseline='bottom'; ctx.fillText({'crown':'👑','wizard':'🧙','ninja':'🥷'}[hat]||'🎩', this.x-cam.x, this.y-cam.y-this.radius+8); }
    ctx.strokeStyle = this.isLocal ? '#6366f1' : '#f43f5e'; ctx.lineWidth = 4; ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;
  }
  addXp(amount) {
    if (NET.conn && !NET.isHost) { NET.conn.send({ type: 'PICKUP_XP', amount }); return; }
    this.xp += amount * this.xpMultiplier; if (this.xp >= this.nextLevelXp) this.levelUp(); if (NET.isHost && NET.conn) syncState(); updateUI();
  }
  levelUp() {
    this.level++; this.xp -= this.nextLevelXp; this.nextLevelXp = Math.floor(this.nextLevelXp * 1.25); AudioEngine.play('lvlup');
    if (NET.isHost) { GAME.paused = true; if (NET.conn) { NET.conn.send({ type: 'SHOW_UPGRADES' }); syncState(); } showLevelUp(); }
  }
}

function spawnEnemy() {
  if (!GAME.active || GAME.paused) { setTimeout(spawnEnemy, 500); return; }
  const alive = getAllAlivePlayers(); if (alive.length === 0) { setTimeout(spawnEnemy, 1000); return; }
  const a = Math.random() * Math.PI * 2, pivot = alive[Math.floor(Math.random() * alive.length)];
  const x = pivot.x+Math.cos(a)*CONFIG.SPAWN_RADIUS, y = pivot.y+Math.sin(a)*CONFIG.SPAWN_RADIUS;
  const mod = Math.floor(GAME.time / 60) + 1;
  const enemy = (pivot.level >= 20 && (GAME.time-GAME.lastBossTime>CONFIG.BOSS_INTERVAL)) ? new Enemy(x,y,mod,Math.random().toString(36).substr(2,9),true) : new Enemy(x,y,mod);
  GAME.entities.enemies.push(enemy); setTimeout(spawnEnemy, Math.max(100, (CONFIG.SPAWN_INTERVAL / (1 + GAME.time / 60))));
}

function updateUI() {
  const p = GAME.entities.player; if (!p) return;
  document.getElementById('level-display').innerText = `LVL ${p.level}`;
  document.getElementById('xp-bar-fill').style.width = `${(p.xp/p.nextLevelXp)*100}%`;
  document.getElementById('hp-bar-fill').style.width = `${(p.hp/p.maxHp)*100}%`;
  document.getElementById('kill-count').innerText = GAME.kills;
}

function showLevelUp() {
  GAME.paused = true; const modal = document.getElementById('levelup-modal'), container = document.getElementById('upgrade-options');
  container.innerHTML = ''; const selected = [...CONFIG.UPGRADES].sort(()=>0.5-Math.random()).slice(0, GAME.upgradeOptionsCount);
  selected.forEach(u => { const card = document.createElement('div'); card.className = 'upgrade-card'; card.innerHTML = `<h3>${u.name}</h3><p>${u.desc}</p>`; card.onclick = () => applyUpgrade(u.id); container.appendChild(card); });
  modal.classList.add('active');
}

function applyUpgrade(id) {
  const p = GAME.entities.player;
  if(id==='damage') p.damage*=2; else if(id==='speed') p.speed*=1.15; else if(id==='count') p.projectileCount+=1;
  document.getElementById('levelup-modal').classList.remove('active');
  if(NET.isHost) { GAME.paused = false; if(NET.conn) syncState(); }
}

function gameOver() {
  GAME.active = false; document.getElementById('gameover-modal').classList.add('active');
  document.getElementById('final-level').innerText = GAME.entities.player.level; document.getElementById('final-kills').innerText = GAME.kills;
}

function togglePause() { if(!GAME.active || (NET.conn && !NET.isHost)) return; GAME.paused=!GAME.paused; document.getElementById('pause-modal').classList.toggle('active', GAME.paused); if(NET.isHost && NET.conn) syncState(); }

function setupConn() {
    NET.conn.on('data', (data) => {
        if (data.type === 'P_SYNC') { if(!NET.others[data.id]) NET.others[data.id]=new Player(false); const o=NET.others[data.id]; o.targetX=data.x; o.targetY=data.y; o.dead=data.dead; }
        if (data.type === 'SHOT') { const proj = new Projectile(data.x, data.y, data.tx, data.ty, data.dmg, { ownerId: 'remote' }); GAME.entities.projectiles.push(proj); }
        if (data.type === 'PICKUP_XP' && NET.isHost) GAME.entities.player.addXp(data.amount);
        if (data.type === 'SHOW_UPGRADES' && !NET.isHost) showLevelUp();
        if (data.type === 'S_SYNC') { const p=GAME.entities.player; p.level=data.l; p.xp=data.x; p.nextLevelXp=data.n; p.hp=data.h; GAME.paused=data.p; GAME.time=data.t; updateUI(); }
        if (data.type === 'W_SYNC' && !NET.isHost) {
            GAME.entities.enemies = data.e.map(he => { const e = new Enemy(he.x, he.y, 1, he.i, he.b); e.hp = he.h; return e; });
            GAME.entities.gems = data.g.map(hg => new Gem(hg.x, hg.y, hg.i));
        }
    });
}

function syncPlayer() { if(!NET.conn) return; const now=Date.now(); if(now-NET.pThrottle<20) return; NET.pThrottle=now; NET.conn.send({ type:'P_SYNC', id:NET.roomId, x:GAME.entities.player.x, y:GAME.entities.player.y, dead:GAME.entities.player.dead }); }
function syncShot(proj) { if(!NET.conn) return; const a=Math.atan2(proj.vy, proj.vx); NET.conn.send({ type:'SHOT', x:proj.x, y:proj.y, tx:proj.x+Math.cos(a)*100, ty:proj.y+Math.sin(a)*100, dmg:proj.damage }); }
function syncState() { if(!NET.isHost||!NET.conn) return; const p=GAME.entities.player; NET.conn.send({ type:'S_SYNC', l:p.level, x:p.xp, n:p.nextLevelXp, p:GAME.paused, t:GAME.time, h:p.hp }); }
function syncWorld() {
    if(!NET.isHost||!NET.conn) return; const now=Date.now(); if(now-NET.wThrottle<100) return; NET.wThrottle=now;
    const p=GAME.entities.player; 
    const enemies = GAME.entities.enemies.filter(e => dist(e.x, e.y, p.x, p.y) < 1200).slice(0, 40);
    NET.conn.send({ type:'W_SYNC', e:enemies.map(e=>({i:e.id, x:e.x, y:e.y, h:e.hp, b:e.isBoss})), g:GAME.entities.gems.slice(0,20).map(g=>({i:g.id, x:g.x, y:g.y})) });
}

function init() {
  GAME.canvas = document.getElementById('game-canvas'); GAME.ctx = GAME.canvas.getContext('2d');
  window.addEventListener('resize', () => { GAME.canvas.width = window.innerWidth; GAME.canvas.height = window.innerHeight; });
  GAME.canvas.width = window.innerWidth; GAME.canvas.height = window.innerHeight;
  AudioEngine.init(); AudioEngine.startMenuMelody();
  document.getElementById('btn-start').onclick = () => { AudioEngine.startMusic(); startGame(); };
  document.getElementById('btn-multiplayer').onclick = () => { 
      const id = prompt("Tvoje ID:"); 
      NET.peer = new Peer(id); 
      NET.peer.on('open', (rid) => { 
          NET.roomId = rid; 
          const target = prompt("ID kámoše (nech prázdné pro Host):");
          if(target){ NET.conn = NET.peer.connect(target); NET.isHost=false; setupConn(); AudioEngine.startMusic(); }
          else { NET.peer.on('connection', (c) => { NET.conn=c; NET.isHost=true; setupConn(); AudioEngine.startMusic(); startGame(); }); }
      });
  };
  document.querySelectorAll('.btn-reload').forEach(btn => btn.onclick = () => location.reload());
  spawnEnemy(); loadMeta(); requestAnimationFrame(loop);
}

function startGame() { GAME.active = true; document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); }
function loop() { update(); render(); requestAnimationFrame(loop); }
function update() {
  if (GAME.paused || !GAME.active) return;
  GAME.time += 1/60; const p = GAME.entities.player; p.update();
  GAME.camera.x = (p.x * GAME.zoom) - GAME.canvas.width / 2; GAME.camera.y = (p.y * GAME.zoom) - GAME.canvas.height / 2;
  if(NET.conn) syncPlayer(); if(NET.isHost && NET.conn) { syncWorld(); syncState(); }
  for(const id in NET.others) NET.others[id].update();
  GAME.entities.enemies.forEach(e => { e.update(); getAllAlivePlayers().forEach(ap => { if(dist(ap.x, ap.y, e.x, e.y) < ap.radius + e.radius){ ap.hp -= 0.5; if(ap.hp <= 0) ap.dead = true; } }); });
  GAME.entities.projectiles.forEach((proj, pi) => { proj.update(); if(proj.life<=0) GAME.entities.projectiles.splice(pi,1); GAME.entities.enemies.forEach((e, ei) => { if(dist(proj.x, proj.y, e.x, e.y) < proj.radius + e.radius){ e.hp -= proj.damage; if(e.hp<=0){ GAME.entities.enemies.splice(ei, 1); if(NET.isHost) GAME.entities.gems.push(new Gem(e.x, e.y)); GAME.kills++; } } }); });
  GAME.entities.gems.forEach((g, i) => { g.update(p); if(!p.dead && dist(p.x, p.y, g.x, g.y) < p.radius + g.radius){ AudioEngine.play('gem'); p.addXp(10); GAME.entities.gems.splice(i, 1); } });
  updateUI();
}

function render() {
  const ctx = GAME.ctx, cam = GAME.camera; ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, GAME.canvas.width, GAME.canvas.height);
  ctx.save(); ctx.translate(-cam.x, -cam.y);
  GAME.entities.enemies.forEach(e => e.draw(ctx, {x:0, y:0}));
  for(const id in NET.others) NET.others[id].draw(ctx, {x:0, y:0});
  GAME.entities.player.draw(ctx, {x:0, y:0}); ctx.restore();
}

init();

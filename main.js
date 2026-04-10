/**
 * NEO SURVIVOR - Core Game Logic
 */

// Error catching
window.onerror = function(msg, url, line, col, error) {
    console.warn("Chyba zachycena:", msg);
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
    const isMobile = window.innerWidth < 850;
    GAME.speedFactor = isMobile ? 0.8 : 1.0;
    GAME.zoom = isMobile ? 0.7 : 1.0;
    GAME.joystick.startX = 80; GAME.joystick.startY = window.innerHeight - 80;
};

const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const randomRange = (min, max) => Math.random() * (max - min) + min;

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
        if (type === 'shoot') this.playSynth(now, 440, 0.05, 0.1, 'triangle');
        else if (type === 'hit') this.playSynth(now, 100, 0.08, 0.1, 'sawtooth');
        else if (type === 'lvlup') this.playSynth(now, 220, 0.1, 0.5, 'sine');
        else if (type === 'gem') this.playSynth(now, 660, 0.03, 0.1, 'sine');
    },
    startMenuMusic() {
        if (this.menuMelodyInterval) return; this.init();
        const notes = { 'C': 261.63, 'D': 293.66, 'E': 329.63, 'F': 349.23, 'G': 392.00 };
        const melody = ['E', null, 'F', null, 'G', null, null, 'E', null, 'F', null, 'G', null, 'D', null, 'C'];
        let step = 0;
        this.menuMelodyInterval = setInterval(() => {
            if (!GAME.active && this.ctx) {
                const note = melody[step % melody.length];
                if (note) this.playSynth(this.ctx.currentTime, notes[note], 0.04, 0.3, 'sine');
                step++;
            }
        }, 150);
    },
    stopMenuMusic() { clearInterval(this.menuMelodyInterval); this.menuMelodyInterval = null; },
    startMusic() {
        if (this.musicStarted || !this.ctx) return; this.musicStarted = true; this.stopMenuMusic();
        const bass = [55, 55, 62, 49]; let step = 0;
        setInterval(() => {
            if (GAME.active && !GAME.paused && this.ctx) {
                this.playSynth(this.ctx.currentTime, bass[step % 4], 0.03, 0.4, 'sawtooth');
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
        ctx.globalAlpha = this.life / 1.5; ctx.fillStyle = '#f59e0b';
        ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

class Projectile {
    constructor(x, y, tx, ty, dmg, s = {}) {
        this.x = x; this.y = y; const a = Math.atan2(ty - y, tx - x);
        this.vx = Math.cos(a) * 11; this.vy = Math.sin(a) * 11;
        this.dmg = dmg; this.radius = 6; this.life = 200; this.ownerId = s.ownerId || 'local';
    }
    update() { this.x += this.vx; this.y += this.vy; this.life--; }
    draw(ctx, cam) {
        ctx.fillStyle = this.ownerId === 'local' ? '#6366f1' : '#f43f5e';
        ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
    }
}

class Gem {
    constructor(x, y, id) { this.x = x; this.y = y; this.radius = 5; this.id = id; this.attracted = false; }
    update(p) {
        if (p.dead) return; const d = dist(this.x, this.y, p.x, p.y);
        if (d < 150) this.attracted = true;
        if (this.attracted) {
            const a = Math.atan2(p.y - this.y, p.x - this.x);
            this.x += Math.cos(a) * 12; this.y += Math.sin(a) * 12;
        }
    }
    draw(ctx, cam) {
        ctx.fillStyle = '#34d399'; ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
    }
}

class Enemy {
    constructor(x, y, lvl, id) {
        this.x = x; this.y = y; this.radius = 18; this.id = id || Math.random().toString(36).substr(2, 9);
        this.hp = 20 * lvl; this.targetX = x; this.targetY = y;
    }
    update() {
        if (NET.isHost || !NET.peer) {
            const pl = getAllAlivePlayers(); if (pl.length === 0) return;
            const t = pl.sort((a,b) => dist(this.x,this.y,a.x,a.y) - dist(this.x,this.y,b.x,b.y))[0];
            const a = Math.atan2(t.y - this.y, t.x - this.x);
            this.x += Math.cos(a) * 2.2; this.y += Math.sin(a) * 2.2;
        } else {
            this.x += (this.targetX - this.x) * 0.2; this.y += (this.targetY - this.y) * 0.2;
        }
    }
    draw(ctx, cam) {
        ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
    }
}

class Player {
    constructor(isLocal) {
        this.x = 0; this.y = 0; this.radius = 22; this.isLocal = isLocal;
        this.hp = 120; this.level = 1; this.xp = 0; this.nextXp = 100; this.dead = false;
        this.targetX = 0; this.targetY = 0; this.magnetRange = 150;
    }
    update() {
        if (this.dead) return;
        if (this.isLocal) {
            let dx=0, dy=0; if (GAME.input.w) dy--; if (GAME.input.s) dy++; if (GAME.input.a) dx--; if (GAME.input.d) dx++;
            if (dx || dy) { const a = Math.atan2(dy, dx); this.x += Math.cos(a)*4; this.y += Math.sin(a)*4; }
            if (Date.now() - (this.lastFire || 0) > 1000) { this.attack(); this.lastFire = Date.now(); }
        } else {
            this.x += (this.targetX - this.x) * 0.25; this.y += (this.targetY - this.y) * 0.25;
        }
    }
    attack() {
        const en = GAME.entities.enemies; if (en.length === 0) return;
        const t = en.sort((a,b) => dist(this.x,this.y,a.x,a.y) - dist(this.x,this.y,b.x,b.y))[0];
        const pr = new Projectile(this.x, this.y, t.x, t.y, 10); GAME.entities.projectiles.push(pr);
        if (NET.conn) syncShot(pr); AudioEngine.play('shoot');
    }
    draw(ctx, cam) {
        if (this.dead) ctx.globalAlpha = 0.3;
        ctx.fillStyle = this.isLocal ? '#6366f1' : '#fca5a5';
        ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1.0;
    }
    addXp(v) {
        if (NET.peer && !NET.isHost) { NET.conn.send({ type: 'PICKUP_XP', amount: v }); return; }
        this.xp += v; if (this.xp >= this.nextXp) this.levelUp(); updateUI();
    }
    levelUp() {
        this.level++; this.xp -= this.nextXp; this.nextXp = Math.floor(this.nextXp * 1.25);
        AudioEngine.play('lvlup');
        if (NET.isHost || !NET.peer) {
            GAME.paused = true; if (NET.conn) { NET.conn.send({ type: 'SHOW_UPGRADES' }); syncState(); }
            showLevelUp();
        }
    }
}

function getAllAlivePlayers() {
    const l = []; if (GAME.entities.player && !GAME.entities.player.dead) l.push(GAME.entities.player);
    for (const id in NET.others) if (!NET.others[id].dead) l.push(NET.others[id]);
    return l;
}

function updateUI() {
    const p = GAME.entities.player; if (!p) return;
    document.getElementById('level-display').innerText = `LVL ${p.level}`;
    document.getElementById('xp-bar-fill').style.width = `${(p.xp / p.nextXp) * 100}%`;
    document.getElementById('hp-bar-fill').style.width = `${(p.hp / 120) * 100}%`;
    document.getElementById('kill-count').innerText = GAME.kills;
}

function showLevelUp() {
    const modal = document.getElementById('levelup-modal'); const container = document.getElementById('upgrade-options');
    container.innerHTML = ''; const upgs = [...CONFIG.UPGRADES].sort(() => 0.5 - Math.random()).slice(0, 3);
    upgs.forEach(u => {
        const card = document.createElement('div'); card.className = 'upgrade-card';
        card.innerHTML = `<div class="upgrade-icon">${u.icon}</div><h3>${u.name}</h3><p>${u.desc}</p>`;
        card.onclick = () => { applyUpgrade(u.id); modal.classList.remove('active'); };
        container.appendChild(card);
    });
    modal.classList.add('active');
}

function applyUpgrade(id) {
    if (NET.isHost || !NET.peer) { GAME.paused = false; if (NET.conn) syncState(); }
}

function showMetaMenu() {
    const container = document.getElementById('meta-options');
    document.getElementById('meta-currency').innerText = META.currency;
    container.innerHTML = '';
    const items = [
        { id: 'hp', name: 'Extra HP', desc: 'Počáteční HP +10', cost: 10, val: META.upgrades.hp },
        { id: 'speed', name: 'Rychlost', desc: 'Pohyb +2%', cost: 15, val: META.upgrades.speed },
        { id: 'hat_crown', name: 'Koruna', desc: 'Královská koruna', cost: 100, isHat: true, type: 'crown' }
    ];
    items.forEach(item => {
        const card = document.createElement('div'); card.className = 'upgrade-card';
        const cost = item.isHat ? item.cost : Math.floor(item.cost * (1 + item.val * 0.5));
        card.innerHTML = `<h3>${item.name}</h3><p>${item.desc}</p><span class="cost">${cost} DOGE</span>`;
        card.onclick = () => { if (META.currency >= cost) { META.currency -= cost; if(item.isHat) META.upgrades.hat = item.type; else META.upgrades[item.id]++; saveMeta(); showMetaMenu(); } };
        container.appendChild(card);
    });
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
            const p = GAME.entities.player; p.level = d.lvl; p.xp = d.xp; p.nextXp = d.next; p.hp = d.hp;
            GAME.paused = d.paused; updateUI();
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
function syncShot(p) { if (NET.conn) { const a = Math.atan2(p.vy, p.vx); NET.conn.send({ type: 'SHOT', x: p.x, y: p.y, tx: p.x + Math.cos(a)*100, ty: p.y + Math.sin(a)*100, dmg: p.dmg }); } }
function syncState() { if (NET.isHost && NET.conn) { const p = GAME.entities.player; NET.conn.send({ type: 'STATE_SYNC', lvl: p.level, xp: p.xp, next: p.nextXp, paused: GAME.paused, hp: p.hp }); } }
function syncWorld() { if (NET.isHost && NET.conn) NET.conn.send({ type: 'WORLD_STATE', enemies: GAME.entities.enemies.map(e => ({ id: e.id, x: e.x, y: e.y, hp: e.hp })), gems: GAME.entities.gems.map(g => ({ id: g.id, x: g.x, y: g.y })) }); }

function init() {
    GAME.canvas = document.getElementById('game-canvas'); GAME.ctx = GAME.canvas.getContext('2d'); updateSpeedFactor();
    window.addEventListener('resize', () => { GAME.canvas.width = window.innerWidth; GAME.canvas.height = window.innerHeight; updateSpeedFactor(); });
    GAME.canvas.width = window.innerWidth; GAME.canvas.height = window.innerHeight;
    
    window.addEventListener('keydown', (e) => { GAME.input[e.key.toLowerCase()] = true; if (e.key === 'Escape') togglePause(); });
    window.addEventListener('keyup', (e) => { GAME.input[e.key.toLowerCase()] = false; });

    document.getElementById('btn-start').onclick = () => { AudioEngine.init(); startGame(); };
    document.getElementById('btn-multiplayer').onclick = () => { initPeer(); document.getElementById('multiplayer-modal').classList.add('active'); };
    document.getElementById('btn-close-mp').onclick = () => document.getElementById('multiplayer-modal').classList.remove('active');
    document.getElementById('btn-create-host').onclick = () => { if (NET.roomId) { NET.isHost = true; startGame(); } };
    document.getElementById('btn-join-room').onclick = () => { const id = document.getElementById('input-join-id').value.trim().toUpperCase(); if (id) { if (!NET.peer) initPeer(); NET.conn = NET.peer.connect(id); NET.isHost = false; setupConn(); } };
    
    document.getElementById('btn-meta-menu').onclick = () => { showMetaMenu(); document.getElementById('meta-modal').classList.add('active'); };
    document.getElementById('btn-close-meta').onclick = () => document.getElementById('meta-modal').classList.remove('active');
    document.getElementById('btn-copy-id').onclick = () => { navigator.clipboard.writeText(NET.roomId); };
    document.getElementById('btn-resume').onclick = () => togglePause();
    document.getElementById('mobile-pause').onclick = () => togglePause();
    
    document.querySelectorAll('.btn-reload').forEach(btn => btn.onclick = () => location.reload());
    
    loadMeta(); AudioEngine.startMenuMusic(); spawnEnemy(); requestAnimationFrame(loop);
}

function startGame() { GAME.active = true; document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); AudioEngine.startMusic(); }
function loop() { if (GAME.active) update(); render(); requestAnimationFrame(loop); }
function togglePause() { if (GAME.active && (!NET.conn || NET.isHost)) { GAME.paused = !GAME.paused; document.getElementById('pause-modal').classList.toggle('active', GAME.paused); if(NET.isHost) syncState(); } }

function update() {
    if (GAME.paused) return; GAME.time += 1/60; const p = GAME.entities.player; p.update();
    GAME.camera.x = p.x - GAME.canvas.width/2; GAME.camera.y = p.y - GAME.canvas.height/2;
    if (NET.conn) syncPlayer(); if (NET.isHost && Date.now() - NET.lastSync > 100) { syncWorld(); syncState(); NET.lastSync = Date.now(); }
    for (const id in NET.others) NET.others[id].update();
    if (!NET.peer || NET.isHost) {
        const ap = getAllAlivePlayers(); GAME.entities.enemies.forEach(e => { e.update(); ap.forEach(p => { if (dist(p.x,p.y,e.x,e.y) < p.radius+e.radius) { p.hp -= 0.5; if (p.hp<=0) p.dead=true; updateUI(); } }); });
    } else { GAME.entities.enemies.forEach(e => e.update()); }
    GAME.entities.projectiles.forEach((pr, i) => { pr.update(); if (pr.life<=0) GAME.entities.projectiles.splice(i,1); });
    GAME.entities.gems.forEach((g, i) => { g.update(p); if (dist(p.x,p.y,g.x,g.y) < p.radius+g.radius) { AudioEngine.play('gem'); p.addXp(10); GAME.entities.gems.splice(i,1); } });
}

function render() {
    const ctx = GAME.ctx; ctx.fillStyle = '#020617'; ctx.fillRect(0,0,GAME.canvas.width,GAME.canvas.height);
    const cam = GAME.camera;
    GAME.entities.gems.forEach(g => g.draw(ctx, cam)); GAME.entities.projectiles.forEach(p => p.draw(ctx, cam));
    GAME.entities.enemies.forEach(e => e.draw(ctx, cam)); for (const id in NET.others) NET.others[id].draw(ctx, cam);
    if (GAME.entities.player) GAME.entities.player.draw(ctx, cam);
}

init();

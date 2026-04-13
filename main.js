/**
 * NEO SURVIVOR - Core Game Logic
 */

window.onerror = function (msg, url, line, col, error) {
    console.error("Chyba:", msg, line, error);
    return false;
};

console.warn("SCRIPT: Neo Survivor načten.");

const CONFIG = {
    PLAYER_BASE_SPEED: 4.5,
    PLAYER_BASE_HEALTH: 120,
    ENEMY_BASE_HEALTH: 20,
    ENEMY_BASE_SPEED: 4.5, // ZRYCHLENO NA PC ÚROVEŇ (4.5)
    PROJECTILE_SPEED: 11,
    SPAWN_INTERVAL: 800,
    SPAWN_RADIUS: 700,
    GEM_VALUES: 10,
    XP_PER_LEVEL: 100,
    BOSS_INTERVAL: 60,
    SNIPER_COOLDOWN: 15000,
    UPGRADES: [
        { id: 'damage', name: 'Zvýšení Síly', desc: 'Poškození x2', icon: '⚔️', rarity: 'common' },
        { id: 'speed', name: 'Rychlé Boty', desc: '+15% rychlost pohybu', icon: '👟', rarity: 'common' },
        { id: 'firerate', name: 'Rychlá Palba', desc: '-20% prodleva útoku', icon: '🔥', rarity: 'common' },
        { id: 'shield', name: 'Energetický Štít', desc: 'Snížení poškození o 20%', icon: '🛡️', rarity: 'common' },
        { id: 'growth', name: 'Růst', desc: '+10% max HP a plný heal', icon: '🥗', rarity: 'common' },

        { id: 'count', name: 'Více Střel', desc: '+1 projektil navíc', icon: '🌀', rarity: 'uncommon' },
        { id: 'pierce', name: 'Průraznost', desc: 'Paprsek/Střela projde více nepřátely', icon: '🏹', rarity: 'uncommon' },
        { id: 'wall_range', name: 'Dosah Zdi', desc: '+25% dolet a životnost tvé zdi', icon: '🌊', rarity: 'uncommon' }, 
        { id: 'laser_range', name: 'Zaměřovač', desc: '+150 dosah laseru', icon: '🔭', rarity: 'uncommon' },
        { id: 'wall_width', name: 'Širší Zeď', desc: '+25% šířka zdi', icon: '📏', rarity: 'uncommon' },
        { id: 'size', name: 'Obří Střely', desc: '+30% velikost projektilu', icon: '🌕', rarity: 'uncommon' },
        { id: 'xpboost', name: 'XP Multiplikátor', desc: '+20% bonus k XP', icon: '📈', rarity: 'uncommon' },
        { id: 'bounce', name: 'Odraz', desc: 'Střely se odráží k dalšímu cíli', icon: '🪃', rarity: 'uncommon' },

        { id: 'magnet', name: 'Magnet na XP', desc: '+50% dosah sběru', icon: '🧲', rarity: 'rare' },
        { id: 'crit_chance', name: 'Zlepšená Muška', desc: '+15% šance na kritický zásah', icon: '🎯', rarity: 'rare' },
        { id: 'crit_dmg', name: 'Kritické Poškození', desc: 'Zvyšuje násobič krit. zásahu (+1x)', icon: '💥', rarity: 'rare' },
        { id: 'knockback', name: 'Silný Odhoz', desc: '+50% síla odhozu', icon: '💢', rarity: 'rare' },

        { id: 'regen', name: 'Regenerace', desc: 'Obnova 1 HP/s', icon: '💊', rarity: 'epic' },
        { id: 'ultramagnet', name: 'Ultra Magnet', desc: 'Pomalý sběr z celé mapy', icon: '🌌', rarity: 'epic' },
        { id: 'orbit', name: 'Orbitální Štít', desc: 'Vypustí rotující projektil', icon: '🪐', rarity: 'epic' },
        { id: 'lifesteal', name: 'Lifesteal', desc: '5% šance na heal při killu', icon: '🧛', rarity: 'epic' },
        { id: 'fire', name: 'Ohnivá Stopa', desc: 'Zanecháváš za sebou oheň', icon: '🔥', rarity: 'epic' },
        { id: 'kaktus', name: 'Kaktus', desc: 'Zabíjí dotykem (10s on, 30s off)', icon: '🌵', rarity: 'epic' },

        { id: 'xpgen', name: 'Zkušenostní Pole', desc: 'Generuje 1 XP automaticky', icon: '💎', rarity: 'legendary' },
        { id: 'luck', name: 'Větší Výběr', desc: '+1 možnost při levelu', icon: '🍀', rarity: 'legendary' },
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
    SCREEN_SHAKE: 0
};

const NET = {
    socket: null,
    roomId: null,
    isMultiplayer: false,
    others: {},
    serverPollingInterval: null
};

let myPlayerId = localStorage.getItem('neoSurvivor_pid');
if (!myPlayerId) {
    myPlayerId = Math.random().toString(36).substr(2, 9);
    localStorage.setItem('neoSurvivor_pid', myPlayerId);
}

const META = {
    playerName: null,
    maxLevel: 1,
    currency: 0,
    upgrades: { hp: 0, speed: 0, luck: 0, hat: null },
    ships: { 1: true, 2: false, 3: false },
    selectedShip: 1
};

// Správná synchronizace účtu se serverem pomocí uloženého hesla
const saveMetaLocalOnly = () => localStorage.setItem('neoSurvivor_meta', JSON.stringify(META));
const saveMeta = () => {
    saveMetaLocalOnly();
    const savedUser = localStorage.getItem('neoSurvivor_user');
    const savedPass = localStorage.getItem('neoSurvivor_pass');
    
    if (savedUser && savedPass && NET.socket && NET.socket.connected) {
        NET.socket.emit('syncAccount', { user: savedUser, pass: savedPass, meta: META });
        NET.socket.emit('submitScore', { name: savedUser, level: META.maxLevel });
    }
};

const loadMeta = () => {
    const data = localStorage.getItem('neoSurvivor_meta');
    if (data) {
        const parsed = JSON.parse(data);
        Object.assign(META, parsed);
        if (!META.ships) META.ships = { 1: true, 2: false, 3: false };
        if (!META.selectedShip) META.selectedShip = 1;
        if (!META.playerName) META.playerName = null;
        if (!META.maxLevel) META.maxLevel = 1;
    }
};

const GAME = {
    active: false,
    paused: false,
    score: 0,
    kills: 0,
    time: 0,
    lastBossTime: 0,
    lastSpawnTime: 0,
    speedFactor: 1.0,
    zoom: 1.0,
    upgradeOptionsCount: 3,
    loopStarted: false,
    entities: {
        player: null,
        enemies: [],
        projectiles: [],
        gems: [],
        pickedGems: new Set(),
        particles: [],
        fire: [],
        baits: [],
        floatingTexts: []
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
    lastSniperTime: 0,
    canvas: null,
    ctx: null
};

const updateSpeedFactor = () => {
    const isMobile = window.innerWidth < 850;
    GAME.speedFactor = 1.0; 
    GAME.zoom = isMobile ? 0.6 : 1.0; 
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

function updateKaktusUI(isActive, pct) {
    const ui = document.getElementById('kaktus-ui');
    const bar = document.getElementById('kaktus-bar');
    if (!ui || !bar) return;
    
    if (!GAME.entities.player || !GAME.entities.player.hasKaktus) {
        ui.style.display = 'none';
        return;
    }
    
    ui.style.display = 'flex';
    bar.style.width = `${pct}%`;
    if (isActive) {
        bar.style.background = '#22c55e'; 
    } else {
        bar.style.background = '#f59e0b'; 
    }
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
        } catch (e) { console.error("Audio init failed", e); }
    },
    startMenuMusic() {
        if (!this.ctx || this.menuPlaying) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.menuPlaying = true;

        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        const bassFilter = this.ctx.createBiquadFilter();

        bassOsc.type = 'sawtooth';
        bassOsc.frequency.setValueAtTime(55, this.ctx.currentTime); 

        bassFilter.type = 'lowpass';
        bassFilter.frequency.setValueAtTime(300, this.ctx.currentTime);

        bassGain.gain.setValueAtTime(0, this.ctx.currentTime);
        bassGain.gain.linearRampToValueAtTime(0.06, this.ctx.currentTime + 2);

        bassOsc.connect(bassFilter);
        bassFilter.connect(bassGain);
        bassGain.connect(this.ctx.destination);

        bassOsc.start();
        this.droneNodes = [bassOsc, bassGain, bassFilter];

        const notes = [220, 261.63, 329.63, 440, 329.63, 261.63, 164.81, 196.00]; 
        let step = 0;

        const playArp = () => {
            if (!this.menuPlaying) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            osc.type = 'square';
            osc.frequency.setValueAtTime(notes[step % notes.length], now);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(2500, now);
            filter.frequency.exponentialRampToValueAtTime(200, now + 0.15);

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.04, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.2);

            step++;
            this.menuInterval = setTimeout(playArp, 140); 
        };
        playArp();
    },
    stopMenuMusic() {
        this.menuPlaying = false;
        if (this.menuInterval) clearTimeout(this.menuInterval);
        if (this.droneNodes) {
            this.droneNodes.forEach(n => {
                try { if (n.stop) n.stop(); n.disconnect(); } catch (e) { }
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
        switch (type) {
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

        const playSynth = (time, freq, vol, duration, type = 'square') => {
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

class FloatingText {
    constructor(x, y, text, color) {
        this.x = x; this.y = y; this.text = text; this.color = color;
        this.life = 1.0;
        this.vy = -1;
    }
    update() {
        this.y += this.vy;
        this.life -= 0.02;
    }
    draw(ctx, cam) {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.font = 'bold 16px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.text, this.x - cam.x, this.y - cam.y);
        ctx.globalAlpha = 1.0;
    }
}

class Fire {
    constructor(x, y, damage, isLocal = true) {
        this.x = x; this.y = y; this.damage = damage;
        this.radius = 25; this.life = 1.5;
        this.isLocal = isLocal;
    }
    update() {
        this.life -= 1 / 60;
        if (this.isLocal && GAME.entities && GAME.entities.enemies) {
            GAME.entities.enemies.forEach(e => {
                if (e && e.hp > 0 && dist(this.x, this.y, e.x, e.y) < this.radius + e.radius) {
                    const dmg = this.damage * (1 / 60);
                    e.hp -= dmg;
                    if (NET.isMultiplayer) NET.socket.emit('enemyHit', { id: e.id, damage: dmg });
                    
                    if (e.hp <= 0) {
                        AudioEngine.play('hit');
                        if (!NET.isMultiplayer && GAME.entities.gems) GAME.entities.gems.push(new Gem(e.x, e.y));
                        GAME.kills++;
                        updateUI();
                    }
                }
            });
        }
    }
    draw(ctx, cam) {
        ctx.globalAlpha = Math.max(0, this.life / 1.5);
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
        this.isCrit = stats.isCrit || false;
        
        this.type = stats.type || 'default';
        
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
        if (this.isEnemy) {
            ctx.shadowColor = this.color || '#ff00ff';
            ctx.fillStyle = this.color || '#ff00ff';
            ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.shadowColor = this.isCrit ? '#fbbf24' : (this.ownerId === 'local' ? '#6366f1' : '#f43f5e');
            ctx.fillStyle = this.isCrit ? '#fbbf24' : '#f8fafc';
            ctx.strokeStyle = ctx.fillStyle;

            if (this.type === 'laser') {
                ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
            } else if (this.type === 'wall') {
                ctx.lineCap = 'round';
                ctx.lineWidth = 16; 
                ctx.shadowBlur = 20;
                
                ctx.save();
                ctx.translate(this.x - cam.x, this.y - cam.y);
                ctx.rotate(Math.atan2(this.vy, this.vx));
                ctx.beginPath();
                ctx.moveTo(0, -this.radius); 
                ctx.lineTo(0, this.radius);
                ctx.stroke();
                ctx.restore();
            } else {
                ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.shadowBlur = 0;
    }
}

class Gem {
    constructor(x, y, id = Math.random().toString(36).substr(2, 9)) {
        this.x = x; this.y = y; this.radius = 5; this.attracted = false; this.ultraAttracted = false; this.id = id;
    }
    update(player) {
        if (player.dead) return;
        const d = dist(this.x, this.y, player.x, player.y);
        if (d < player.magnetRange) this.attracted = true;
        else if (player.ultraMagnet) this.ultraAttracted = true;
        
        if (this.attracted) {
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            this.x += Math.cos(angle) * 14 * GAME.speedFactor; 
            this.y += Math.sin(angle) * 14 * GAME.speedFactor;
        } else if (this.ultraAttracted) {
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            const umSpeed = 0.8 * (player.ultraMagnetPower || 1);
            this.x += Math.cos(angle) * umSpeed * GAME.speedFactor; 
            this.y += Math.sin(angle) * umSpeed * GAME.speedFactor;
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
        
        if (this.owner.isLocal && GAME.entities && GAME.entities.enemies) {
            GAME.entities.enemies.forEach(e => { 
                if (e && e.hp > 0 && dist(x, y, e.x, e.y) < this.size + e.radius) { 
                    const dmg = this.owner.damage * 0.3 * 3;
                    e.hp -= dmg; 
                    if (NET.isMultiplayer) {
                        NET.socket.emit('enemyHit', { id: e.id, damage: dmg });
                    }
                    if (e.hp <= 0) {
                        AudioEngine.play('hit');
                        if (!NET.isMultiplayer && GAME.entities.gems) GAME.entities.gems.push(new Gem(e.x, e.y));
                        GAME.kills++;
                        updateUI();
                    }
                } 
            });
        }
    }
}

function getAllAlivePlayers() {
    const list = [];
    if (GAME.entities && GAME.entities.player && !GAME.entities.player.dead) list.push(GAME.entities.player);
    for (const id in NET.others) {
        if (NET.others[id] && !NET.others[id].dead) list.push(NET.others[id]);
    }
    return list;
}

function getAllTargets() {
    const list = getAllAlivePlayers();
    if (GAME.entities && GAME.entities.baits) {
        GAME.entities.baits.forEach(b => {
            if (b && b.hp > 0) list.push({ x: b.x, y: b.y, radius: b.radius, isBait: true, obj: b });
        });
    }
    return list;
}

class Bait {
    constructor(x, y, hp) {
        this.x = x; this.y = y; this.hp = hp; this.maxHp = hp; this.radius = 25;
    }
    update() { }
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
        if (NET.isMultiplayer) {
            if (this.targetX !== undefined && this.targetY !== undefined) {
                this.x += (this.targetX - this.x) * 0.3;
                this.y += (this.targetY - this.y) * 0.3;
            }
            return;
        }
        
        const targets = getAllTargets();
        if (targets.length === 0) return;
        const baits = targets.filter(t => t.isBait);
        const target = baits.length > 0
            ? baits.sort((a, b) => dist(this.x, this.y, a.x, a.y) - dist(this.x, this.y, b.x, b.y))[0]
            : targets.sort((a, b) => dist(this.x, this.y, a.x, a.y) - dist(this.x, this.y, b.x, b.y))[0];
        const angle = Math.atan2(target.y - this.y, target.x - this.x);
        let speedScale = 1.0;
        const players = getAllAlivePlayers();
        players.forEach(p => { 
            if (p.aura && dist(this.x, this.y, p.x, p.y) < (p.auraRange || 150)) {
                speedScale *= (p.auraPower || 0.5); 
            } 
        });
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
        ctx.fillRect(this.x - cam.x - barW / 2, this.y - cam.y - this.radius - 30, barW, barH);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(this.x - cam.x - barW / 2, this.y - cam.y - this.radius - 30, barW * ratio, barH);
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
        if (NET.isMultiplayer) {
            if (this.targetX !== undefined && this.targetY !== undefined) {
                this.x += (this.targetX - this.x) * 0.3;
                this.y += (this.targetY - this.y) * 0.3;
            }
            return; 
        }
        
        const targets = getAllTargets();
        if (targets.length === 0) return;
        const baits = targets.filter(t => t.isBait);
        const target = baits.length > 0
            ? baits.sort((a, b) => dist(this.x, this.y, a.x, a.y) - dist(this.x, this.y, b.x, b.y))[0]
            : targets.sort((a, b) => dist(this.x, this.y, a.x, a.y) - dist(this.x, this.y, b.x, b.y))[0];
        const angle = Math.atan2(target.y - this.y, target.x - this.x);
        let speedScale = 1.0;
        const players = getAllAlivePlayers();
        players.forEach(p => { 
            if (p.aura && dist(this.x, this.y, p.x, p.y) < (p.auraRange || 150)) {
                speedScale *= (p.auraPower || 0.5);
            } 
        });
        const currentSpeed = this.speed * speedScale * GAME.speedFactor;
        this.x += Math.cos(angle) * currentSpeed + this.knockback.x;
        this.y += Math.sin(angle) * currentSpeed + this.knockback.y;
        this.knockback.x *= 0.8; this.knockback.y *= 0.8;

        if (this.type === 2 && Date.now() - this.lastShot > this.shotInterval) {
            const pSpeed = CONFIG.ENEMY_BASE_SPEED * 1.2;
            if (GAME.entities.projectiles) GAME.entities.projectiles.push(new Projectile(this.x, this.y, target.x, target.y, 10, {
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
            const target = players.length > 0 ? players.sort((a, b) => dist(this.x, this.y, a.x, a.y) - dist(this.x, this.y, b.x, b.y))[0] : { x: 0, y: 0 };
            const angle = Math.atan2(target.y - this.y, target.x - this.x);
            ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y); ctx.rotate(angle);
            ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-12, 12); ctx.lineTo(-12, -12); ctx.closePath(); ctx.fill();
            ctx.restore(); ctx.shadowBlur = 0;
        } else if (this.type === 2) {
            const r = Math.floor(168 * ratio + 34 * (1 - ratio));
            const g = Math.floor(85 * ratio + 197 * (1 - ratio));
            const b = Math.floor(247 * ratio + 94 * (1 - ratio));
            const color = `rgb(${r}, ${g}, ${b})`;

            ctx.shadowBlur = 20; ctx.shadowColor = color; ctx.fillStyle = color;
            ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y);
            ctx.rotate(Date.now() / 1000); 
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
        this.pierceCount = 1; this.projSize = 6; 
        
        this.critChance = 0;
        this.critMultiplier = 3; 
        
        this.luckFactor = 1.0 + (isLocal ? (META.upgrades.luck * 0.05) : 0);
        this.orbitals = 0; this.knockbackForce = 6; this.xpMultiplier = 1.0;
        this.aura = false; this.auraRange = 150;
        this.bounces = 0; this.fireTrail = false;
        
        this.hasKaktus = false; 
        this.kaktus = false; 
        this.lastKaktusToggle = 0;
        
        this.bait = false; this.lastBait = 0;
        this.lastFireTrail = 0; this.lastFired = 0; this.lastRegen = 0;
        this.level = 1; this.xp = 0; this.nextLevelXp = CONFIG.XP_PER_LEVEL;
        this.remoteHat = null;
        this.remoteName = null; 
        this.targetX = 0; this.targetY = 0;
        this.dead = false;
        
        this.ultraMagnetPower = 1;
        this.fireDamageMult = 0.5;
        this.baitHpMult = 5;
        this.auraPower = 0.5; 
        
        this.orbitersList = [];
        
        this.shipType = META.selectedShip || 1;
        this.wallRangeBonus = 0;
        this.wallWidthBonus = 0;
        this.laserRangeBonus = 0;
        
        this.laserTargets = []; 
        this.laserTargetsIds = [];
    }
    update(dt) {
        if (this.dead) return;
        
        if (this.orbitals !== this.orbitersList.length) {
            this.orbitersList = [];
            for (let i = 0; i < this.orbitals; i++) this.orbitersList.push(new Orbiter(this, i, this.orbitals));
        }
        this.orbitersList.forEach(o => o.update());

        if (this.hasKaktus) {
            const now = Date.now();
            if (this.kaktus) {
                const elapsed = now - this.lastKaktusToggle;
                if (elapsed > 10000) { 
                    this.kaktus = false;
                    this.lastKaktusToggle = now;
                }
                const pct = Math.max(0, 100 - (elapsed / 10000) * 100);
                if(this.isLocal) updateKaktusUI(true, pct);
            } else {
                const elapsed = now - this.lastKaktusToggle;
                if (elapsed > 30000) { 
                    this.kaktus = true;
                    this.lastKaktusToggle = now;
                }
                const pct = Math.min(100, (elapsed / 30000) * 100);
                if(this.isLocal) updateKaktusUI(false, pct);
            }
        }

        if (!this.isLocal) {
            const oldX = this.x;
            const oldY = this.y;
            this.x += (this.targetX - this.x) * 0.25;
            this.y += (this.targetY - this.y) * 0.25;
            
            if (this.fireTrail) {
                const now = Date.now();
                if (now - (this.lastFireTrail || 0) > 150 && dist(oldX, oldY, this.x, this.y) > 0.5) {
                    if (GAME.entities.fire) GAME.entities.fire.push(new Fire(this.x, this.y, 0, false));
                    this.lastFireTrail = now;
                }
            }
            return;
        }

        if (this.shipType === 2) {
            this.laserTargets = [];
            const enemies = GAME.entities.enemies;
            if (enemies && enemies.length > 0) {
                const range = 400 + this.laserRangeBonus;
                const inRange = enemies.filter(e => e && e.hp > 0 && dist(this.x, this.y, e.x, e.y) < range);
                inRange.sort((a, b) => dist(this.x, this.y, a.x, a.y) - dist(this.x, this.y, b.x, b.y));
                
                const primaryTargets = inRange.slice(0, this.projectileCount);
                const hitSet = new Set(primaryTargets.map(t => t.id));
                
                primaryTargets.forEach(target => {
                    const chain = [target];
                    let current = target;
                    let jumpsLeft = this.pierceCount - 1; 
                    
                    while(jumpsLeft > 0) {
                        const nextTargets = enemies.filter(e => e && e.hp > 0 && !hitSet.has(e.id) && dist(current.x, current.y, e.x, e.y) < 300);
                        if (nextTargets.length === 0) break;
                        nextTargets.sort((a, b) => dist(current.x, current.y, a.x, a.y) - dist(current.x, current.y, b.x, b.y));
                        const next = nextTargets[0];
                        chain.push(next);
                        hitSet.add(next.id);
                        current = next;
                        jumpsLeft--;
                    }
                    this.laserTargets.push(chain);
                });

                const now = Date.now();
                if (now - this.lastFired > (this.fireRate / 2) && this.laserTargets.length > 0) {
                    let isCrit = Math.random() < this.critChance;
                    const finalDamage = isCrit ? this.damage * this.critMultiplier : this.damage;
                    
                    this.laserTargets.forEach(chain => {
                        chain.forEach(target => {
                            if(!target) return;
                            target.hp -= finalDamage;
                            
                            if (isCrit) {
                                if (!GAME.entities.floatingTexts) GAME.entities.floatingTexts = [];
                                GAME.entities.floatingTexts.push(new FloatingText(target.x, target.y - 25, "CRITICAL!", "#ef4444"));
                            }
                            
                            if (NET.isMultiplayer) {
                                NET.socket.emit('enemyHit', { id: target.id, damage: finalDamage });
                            }
                            if (target.hp <= 0) {
                                AudioEngine.play('hit');
                                if (!NET.isMultiplayer && GAME.entities.gems) GAME.entities.gems.push(new Gem(target.x, target.y));
                                GAME.kills++;
                                updateUI();
                            }
                        });
                    });
                    this.lastFired = now;
                }
            }
        }

        if (this.bait && Date.now() - this.lastBait > 10000) {
            const baitHp = this.maxHp * this.baitHpMult;
            if (NET.isMultiplayer) {
                NET.socket.emit('spawnBait', { x: this.x, y: this.y, hp: baitHp });
            } else {
                if (GAME.entities.baits) GAME.entities.baits.push(new Bait(this.x, this.y, baitHp));
            }
            this.lastBait = Date.now();
        }

        let dx = 0, dy = 0;
        if (GAME.joystick.active) {
            const jdx = GAME.joystick.currentX - GAME.joystick.startX;
            const jdy = GAME.joystick.currentY - GAME.joystick.startY;
            const distJoy = dist(0, 0, jdx, jdy);
            if (distJoy > 5) { dx = jdx / distJoy; dy = jdy / distJoy; }
        } else {
            if (GAME.input.w) dy -= 1; if (GAME.input.s) dy += 1;
            if (GAME.input.a) dx -= 1; if (GAME.input.d) dx += 1;
        }

        if (dx !== 0 || dy !== 0) {
            const angle = Math.atan2(dy, dx);
            this.x += Math.cos(angle) * this.speed * GAME.speedFactor; 
            this.y += Math.sin(angle) * this.speed * GAME.speedFactor;
            
            const now = Date.now();
            if (this.fireTrail && now - this.lastFireTrail > 150) {
                if (GAME.entities.fire) GAME.entities.fire.push(new Fire(this.x, this.y, this.damage * this.fireDamageMult, true));
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
        
        if (this.shipType !== 2 && now - this.lastFired > this.fireRate) { 
            this.attack(); 
            this.lastFired = now; 
        }
    }
    attack() {
        if (this.dead) return;
        const enemies = GAME.entities.enemies;
        if (!enemies || enemies.length === 0) return;
        const sortedEnemies = [...enemies].filter(e => e && e.hp > 0).sort((a, b) => dist(this.x, this.y, a.x, a.y) - dist(this.x, this.y, b.x, b.y));
        if (sortedEnemies.length === 0) return;
        const target = sortedEnemies[0];
        
        if (this.shipType === 1) {
            for (let i = 0; i < this.projectileCount; i++) {
                const isCrit = Math.random() < this.critChance;
                const finalDamage = isCrit ? this.damage * this.critMultiplier : this.damage;
                
                const proj = new Projectile(this.x, this.y, target.x, target.y, finalDamage, { 
                    size: this.projSize, 
                    pierce: this.pierceCount, 
                    bounce: this.bounces, 
                    isCrit: isCrit,
                    type: 'default',
                    life: 200,
                    speed: CONFIG.PROJECTILE_SPEED
                });
                if (GAME.entities.projectiles) GAME.entities.projectiles.push(proj);
                if (NET.isMultiplayer) syncShot(proj);
            }
        }
        
        if (this.shipType === 3) {
            const isCrit = Math.random() < this.critChance;
            const finalDamage = isCrit ? this.damage * this.critMultiplier : this.damage;
            const widthMult = 4 * (1 + this.wallWidthBonus);
            
            const wallRadius = this.projSize * 8 * (1 + this.wallWidthBonus);
            
            const wall = new Projectile(this.x, this.y, target.x, target.y, finalDamage, {
                size: wallRadius, 
                pierce: Infinity, 
                bounce: 0, 
                isCrit: isCrit,
                type: 'wall', 
                life: 15 * (1 + this.wallRangeBonus), 
                speed: CONFIG.PROJECTILE_SPEED
            });
            if (GAME.entities.projectiles) GAME.entities.projectiles.push(wall);
            if (NET.isMultiplayer) syncShot(wall);
        }
        
        AudioEngine.play('shoot');
    }
    draw(ctx, cam) {
        if (this.dead) ctx.globalAlpha = 0.2;
        
        if (this.aura) {
            const range = this.auraRange || 150;
            ctx.fillStyle = 'rgba(165, 243, 252, 0.1)';
            ctx.strokeStyle = 'rgba(165, 243, 252, 0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x - cam.x, this.y - cam.y, range, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        if (this.kaktus) {
            ctx.fillStyle = '#22c55e';
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2 + (Date.now() / 1000);
                ctx.beginPath();
                ctx.arc(this.x - cam.x + Math.cos(a) * (this.radius + 5), this.y - cam.y + Math.sin(a) * (this.radius + 5), 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        ctx.shadowBlur = 30; ctx.shadowColor = this.isLocal ? '#6366f1' : '#f43f5e';
        ctx.fillStyle = this.isLocal ? '#f8fafc' : '#fca5a5';
        ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
        
        const displayName = this.isLocal ? META.playerName : this.remoteName;
        const hat = this.isLocal ? META.upgrades.hat : this.remoteHat;

        if (displayName) {
            ctx.fillStyle = this.isLocal ? '#818cf8' : '#fb7185';
            ctx.font = 'bold 12px Outfit, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const yOffset = hat ? 40 : 15; 
            ctx.fillText(displayName, this.x - cam.x, this.y - cam.y - this.radius - yOffset);
        }

        if (hat) {
            ctx.font = '28px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            const h = { 'crown': '👑', 'wizard': '🧙', 'ninja': '🥷', 'cap': '🧢' }[hat];
            ctx.fillText(h || '🎩', this.x - cam.x, this.y - cam.y - this.radius + 8);
        }
        
        ctx.strokeStyle = this.isLocal ? '#6366f1' : '#f43f5e'; ctx.lineWidth = 4; ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;
        
        if (this.shipType === 2) {
            let chainsToDraw = [];
            if (this.isLocal && this.laserTargets && this.laserTargets.length > 0) {
                chainsToDraw = this.laserTargets;
            } else if (!this.isLocal && this.laserTargetsIds && this.laserTargetsIds.length > 0 && GAME.entities.enemies) {
                chainsToDraw = this.laserTargetsIds.map(chainIds => {
                    return chainIds.map(eid => GAME.entities.enemies.find(e => e && e.id === eid)).filter(e => e);
                }).filter(chain => chain && chain.length > 0);
            }

            if (chainsToDraw.length > 0) {
                chainsToDraw.forEach(chain => {
                    if (!chain || chain.length === 0) return;
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(this.x - cam.x, this.y - cam.y);
                    chain.forEach(target => {
                        if (target) ctx.lineTo(target.x - cam.x, target.y - cam.y);
                    });
                    ctx.strokeStyle = '#ef4444';
                    ctx.lineWidth = 6 + (this.projSize - 6);
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = '#ef4444';
                    ctx.stroke();
                    
                    ctx.beginPath();
                    ctx.moveTo(this.x - cam.x, this.y - cam.y);
                    chain.forEach(target => {
                        if (target) ctx.lineTo(target.x - cam.x, target.y - cam.y);
                    });
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2 + (this.projSize - 6) * 0.3;
                    ctx.shadowBlur = 0;
                    ctx.stroke();
                    ctx.restore();
                });
            }
        }
        
        this.orbitersList.forEach(o => o.draw(ctx, cam));
    }
    addXp(amount) {
        if (this.dead) return;
        if (NET.isMultiplayer) return;

        const gain = Math.round(Number(amount) * this.xpMultiplier);
        if (isNaN(gain)) return;
        this.xp += gain;
        while (this.xp >= this.nextLevelXp) {
            this.levelUp();
        }
        updateUI();
    }
    levelUp() {
        this.level++;
        if (this.level > META.maxLevel) {
            META.maxLevel = this.level;
            saveMeta();
        }
        
        this.xp = Math.max(0, this.xp - this.nextLevelXp);
        this.nextLevelXp = Math.floor(this.nextLevelXp * 1.25);
        AudioEngine.play('lvlup');
        GAME.paused = true;
        showLevelUp();
    }
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

    if (!p.hasKaktus) {
        const kUI = document.getElementById('kaktus-ui');
        if (kUI) kUI.style.display = 'none';
    }
}

function showLevelUp() {
    if (!NET.isMultiplayer) GAME.entities.enemies = []; 
    const modal = document.getElementById('levelup-modal');
    const container = document.getElementById('upgrade-options');
    container.innerHTML = '';

    const count = GAME.entities.player.level === 1 ? 3 : GAME.upgradeOptionsCount;
    const selected = [];
    const usedIds = new Set();

    const isUpgradeValid = (u) => {
        const pShip = GAME.entities.player.shipType;
        if (u.id === 'kaktus' && GAME.entities.player.hasKaktus) return false;
        
        if (pShip === 1) {
            if (['wall_range', 'wall_width', 'laser_range'].includes(u.id)) return false; 
        } else if (pShip === 2) {
            if (['wall_range', 'wall_width', 'bounce'].includes(u.id)) return false;
        } else if (pShip === 3) {
            if (['count', 'pierce', 'bounce', 'laser_range'].includes(u.id)) return false;
        }
        return true;
    };

    while (selected.length < count && usedIds.size < CONFIG.UPGRADES.length) {
        const rand = Math.random() * 100;
        let rarity = 'common';
        if (rand < 5) rarity = 'legendary';
        else if (rand < 15) rarity = 'epic';
        else if (rand < 35) rarity = 'rare';
        else if (rand < 60) rarity = 'uncommon';

        const possible = CONFIG.UPGRADES.filter(u => isUpgradeValid(u) && u.rarity === rarity && !usedIds.has(u.id));
        
        if (possible.length > 0) {
            const pick = possible[Math.floor(Math.random() * possible.length)];
            selected.push(pick);
            usedIds.add(pick.id);
        } else {
            const remaining = CONFIG.UPGRADES.filter(u => isUpgradeValid(u) && !usedIds.has(u.id));
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
    try {
        switch (id) {
            case 'damage': p.damage *= 2.0; break;
            case 'speed': p.speed *= 1.15; break;
            case 'count': p.projectileCount += 1; break;
            case 'firerate': p.fireRate *= 0.8; break;
            case 'magnet': p.magnetRange *= 1.5; break;
            case 'shield': p.shield *= 0.8; break;
            case 'regen': p.regen += 1; break;
            case 'xpgen': if (!p.lastXpGen) p.xpGenInterval = 60000; else p.xpGenInterval = Math.max(500, p.xpGenInterval / 2); p.lastXpGen = Date.now(); break;
            case 'ultramagnet': p.ultraMagnet = true; p.ultraMagnetPower += 1; break;
            case 'pierce': p.pierceCount += 1; break;
            case 'wall_range': p.wallRangeBonus += 0.25; break; 
            case 'laser_range': p.laserRangeBonus += 150; break;
            case 'wall_width': p.wallWidthBonus += 0.25; break;
            case 'size': p.projSize *= 1.3; break;
            case 'crit_chance': p.critChance += 0.15; break;
            case 'crit_dmg': p.critMultiplier += 1; break;
            case 'luck': GAME.upgradeOptionsCount += 1; break;
            case 'orbit': p.orbitals += 1; break;
            case 'knockback': p.knockbackForce *= 1.5; break;
            case 'xpboost': p.xpMultiplier += 0.2; break;
            case 'lifesteal': p.lifestealChance += 0.05; break;
            case 'aura': p.aura = true; p.auraRange += 20; p.auraPower *= 0.8; break;
            case 'bounce': p.bounces += 1; break;
            case 'fire': p.fireTrail = true; p.fireDamageMult += 0.5; break;
            case 'kaktus': p.hasKaktus = true; p.kaktus = true; p.lastKaktusToggle = Date.now(); break;
            case 'bait': p.bait = true; p.baitHpMult += 5; p.lastBait = Date.now(); break;
            case 'growth': p.maxHp += Math.floor(p.maxHp * 0.1); p.hp = p.maxHp; break;
        }
    } catch (e) { console.error("Upgrade error:", e); }

    document.getElementById('levelup-modal').classList.remove('active');
    
    if (NET.isMultiplayer) {
        const waitModal = document.getElementById('waiting-modal');
        if (waitModal) waitModal.classList.add('active');
        NET.socket.emit('upgradePicked');
    } else {
        GAME.paused = false;
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
    
    GAME.paused = !GAME.paused;
    
    if (GAME.paused) {
        const p = GAME.entities.player;
        document.getElementById('stat-hp').innerText = Math.floor(p.hp) + ' / ' + p.maxHp;
        document.getElementById('stat-dmg').innerText = p.damage.toFixed(1);
        document.getElementById('stat-speed').innerText = p.speed.toFixed(1);
        document.getElementById('stat-count').innerText = p.projectileCount;
        document.getElementById('stat-firerate').innerText = (p.fireRate / 1000).toFixed(2) + 's';
        document.getElementById('stat-crit-chance').innerText = Math.floor(p.critChance * 100) + '%';
        document.getElementById('stat-crit-dmg').innerText = p.critMultiplier + 'x';
        document.getElementById('stat-shield').innerText = Math.floor((1 - p.shield) * 100) + '%';
        document.getElementById('stat-regen').innerText = p.regen + ' HP/s';
        document.getElementById('stat-lifesteal').innerText = Math.floor(p.lifestealChance * 100) + '%';
    }
    
    document.getElementById('pause-modal').classList.toggle('active', GAME.paused);
    
    if (NET.isMultiplayer) {
        if (GAME.paused) {
            if (NET.socket) NET.socket.disconnect();
        } else {
            if (NET.socket) {
                NET.socket.connect();
                NET.socket.emit('joinRoom', { roomId: NET.roomId, playerId: myPlayerId });
            }
        }
    }
}

let fullscreenAttempted = false;
function tryFullscreen() {
    if (fullscreenAttempted) return;
    const isFS = document.fullscreenElement || document.webkitFullscreenElement;
    if (!isFS) {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(e=>{});
        } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen();
        }
    }
    fullscreenAttempted = true;
}

function toggleFullscreen(element, force = false) {
    const isFS = document.fullscreenElement || document.webkitFullscreenElement;
    if (!isFS || force) {
        if (element.requestFullscreen) {
            element.requestFullscreen().catch(e => console.warn("FS error:", e));
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen();
        }
    } else if (!force) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
}

window.softResetToMenu = () => {
    GAME.active = false;
    GAME.paused = false;
    if (NET.socket) NET.socket.disconnect();
    NET.isMultiplayer = false;
    NET.roomId = null;
    NET.others = {};
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    document.getElementById('menu-modal').classList.add('active');
    resetGame();
};

function showShipsMenu() {
    const container = document.getElementById('ships-options');
    if(!container) return; 

    document.getElementById('ships-currency').innerText = META.currency;
    container.innerHTML = '';
    const items = [
        { id: 1, name: 'Základní Loď', desc: 'Spolehlivý standardní model', cost: 0, icon: '🚀' },
        { id: 2, name: 'Laserová Loď', desc: 'Automatický paprsek, nestřílí', cost: 500, icon: '🩸' },
        { id: 3, name: 'Drtivá Zeď', desc: 'Průrazná vlna bez základní palby.', cost: 1000, icon: '🌊' }
    ];

    items.forEach(item => {
        const card = document.createElement('div'); 
        const owned = META.ships[item.id];
        const selected = META.selectedShip === item.id;
        
        card.className = 'upgrade-card' + (selected ? ' selected' : '');
        card.innerHTML = `
            <div class="upgrade-icon">${item.icon}</div>
            <h3>${item.name}</h3>
            <p>${item.desc}</p>
            <span class="cost" style="margin-top:10px; display:inline-block">${selected ? 'VYBRÁNO' : (owned ? 'VLASTNĚNO (Klikni)' : item.cost + ' DOGE')}</span>
        `;
        card.onclick = () => {
            if (owned) {
                META.selectedShip = item.id;
                saveMeta();
                window.showShipsMenu();
            } else if (META.currency >= item.cost) {
                META.currency -= item.cost;
                META.ships[item.id] = true;
                META.selectedShip = item.id;
                saveMeta();
                window.showShipsMenu();
            } else {
                alert("Nemáš dost Dogecoinu!");
            }
        };
        container.appendChild(card);
    });
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
        card.onclick = () => {
            if (META.currency < cost) { alert("Nemáš dost Dogecoinu!"); return; }
            if (item.isHat) { META.upgrades.hat = item.type; }
            else { META.upgrades[item.id]++; }
            META.currency -= cost; saveMeta(); window.showMetaMenu();
        };
        container.appendChild(card);
    });
}

function initSocket() {
    if (NET.socket && NET.socket.connected) return;
    const SERVER_URL = "https://neo-survivor-server.onrender.com"; 
    try {
        NET.socket = io(SERVER_URL);
        
        NET.socket.on('connect', () => {
            console.warn("CLOUD: Připojeno k hernímu serveru!");
            
            if (META.playerName) {
                NET.socket.emit('submitScore', { name: META.playerName, level: META.maxLevel });
            }
            
            NET.socket.emit('requestLeaderboard');
            window.requestServerList();
        });
        
        NET.socket.on('leaderboardData', (data) => {
            const list = document.getElementById('leaderboard-list');
            if(!list) return;
            list.innerHTML = '';
            
            if(data.length === 0) {
                list.innerHTML = '<div style="text-align: center; color: gray; padding: 20px;">Zatím žádné záznamy. Buď první!</div>';
                return;
            }
            
            data.forEach((p, index) => {
                let medalClass = '';
                let rank = index + 1 + '.';
                if (index === 0) { medalClass = 'gold'; rank = '🥇'; }
                if (index === 1) { medalClass = 'silver'; rank = '🥈'; }
                if (index === 2) { medalClass = 'bronze'; rank = '🥉'; }
                
                const row = document.createElement('div');
                row.className = `lb-row ${medalClass}`;
                row.innerHTML = `
                    <span><span style="display:inline-block; width: 30px;">${rank}</span> ${p.name}</span>
                    <span>LVL ${p.level}</span>
                `;
                list.appendChild(row);
            });
        });

        NET.socket.on('roomList', (rooms) => {
            const container = document.getElementById('server-list-container');
            if (!container) return;
            container.innerHTML = '';
            if (rooms.length === 0) {
                container.innerHTML = '<div style="text-align: center; color: gray; font-size: 0.9rem; padding: 10px 0;">Žádné aktivní servery</div>';
                return;
            }
            rooms.forEach(room => {
                const btn = document.createElement('div');
                btn.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.4); padding: 10px 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);";
                btn.innerHTML = `
                    <div>
                        <strong style="color: #a5b4fc; font-size: 1.1rem; letter-spacing: 2px;">${room.id}</strong>
                        <div style="font-size: 0.75rem; color: gray; margin-top: 4px;">LVL ${room.level} | Hráči: ${room.players}</div>
                    </div>
                    <button class="btn-restart" style="padding: 8px 15px; font-size: 0.8rem; background: #10b981; margin: 0;" onclick="window.joinCloudServer('${room.id}')">HRÁT</button>
                `;
                container.appendChild(btn);
            });
        });

        NET.socket.on('joined', (data) => {
            const { roomId, playerState } = data;
            NET.roomId = roomId;
            NET.isMultiplayer = true;
            document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
            clearInterval(NET.serverPollingInterval);
            
            if (!GAME.active) {
                startGame();
                if (playerState && (playerState.x !== 0 || playerState.y !== 0)) {
                    GAME.entities.player.x = playerState.x;
                    GAME.entities.player.y = playerState.y;
                    GAME.entities.player.hp = playerState.hp;
                    GAME.entities.player.maxHp = playerState.maxHp;
                    GAME.entities.player.level = playerState.level;
                }
            }
        });

        NET.socket.on('stateUpdate', (data) => {
            if (!GAME.active) return;
            if (data.roomInfo) {
                GAME.entities.player.level = data.roomInfo.level;
                GAME.entities.player.xp = data.roomInfo.xp;
                GAME.entities.player.nextLevelXp = data.roomInfo.nextLevelXp;
            }
            const currentEnemies = new Map(GAME.entities.enemies.map(e => [e.id, e]));
            GAME.entities.enemies = data.enemies.map(he => {
                let e = currentEnemies.get(he.id);
                if (!e) {
                    e = he.isBoss ? new Boss(he.x, he.y, 1, he.id) : new Enemy(he.x, he.y, 1, he.id, he.type);
                    e.x = he.x; e.y = he.y;
                }
                e.targetX = he.x; e.targetY = he.y;
                e.hp = he.hp; e.maxHp = he.maxHp;
                return e;
            });

            const currentGems = new Map(GAME.entities.gems.map(g => [g.id, g]));
            GAME.entities.gems = data.gems
                .filter(hg => !GAME.entities.pickedGems.has(hg.id))
                .map(hg => {
                    let g = currentGems.get(hg.id);
                    if (!g) {
                        g = new Gem(hg.x, hg.y, hg.id);
                    } else if (!g.attracted && !g.ultraAttracted) {
                        g.x = hg.x;
                        g.y = hg.y;
                    }
                    return g;
                });
                
            if (data.baits) {
                GAME.entities.baits = data.baits.map(b => {
                    let bait = new Bait(b.x, b.y, b.hp);
                    bait.id = b.id; bait.maxHp = b.maxHp; return bait;
                });
            }

            const newOthers = {};
            for(let pId in data.players) {
                if(pId === myPlayerId) continue;
                if(data.players[pId].disconnected) continue;
                
                if(!NET.others[pId]) newOthers[pId] = new Player(false);
                else newOthers[pId] = NET.others[pId];
                
                newOthers[pId].targetX = data.players[pId].x;
                newOthers[pId].targetY = data.players[pId].y;
                newOthers[pId].dead = data.players[pId].dead;
                newOthers[pId].remoteHat = data.players[pId].hat;
                newOthers[pId].aura = data.players[pId].aura;
                newOthers[pId].auraRange = data.players[pId].auraRange;
                newOthers[pId].orbitals = data.players[pId].orbitals || 0;
                newOthers[pId].fireTrail = data.players[pId].fireTrail;
                newOthers[pId].hasKaktus = data.players[pId].kaktus; 
                newOthers[pId].kaktus = data.players[pId].kaktus;
                newOthers[pId].shipType = data.players[pId].shipType || 1;
                newOthers[pId].laserTargetsIds = data.players[pId].laserTargetsIds || [];
                newOthers[pId].remoteName = data.players[pId].name || "Hráč";
            }
            NET.others = newOthers;
            GAME.time = data.time;
        });

        NET.socket.on('enemyShoot', (data) => {
            const proj = new Projectile(data.x, data.y, data.tx, data.ty, data.dmg, { 
                ownerId: 'remote', speed: data.speed, size: data.size, pierce: data.pierce,
                bounce: data.bounce, isCrit: data.isCrit, type: data.type, life: data.life
            });
            if (GAME.entities.projectiles) GAME.entities.projectiles.push(proj);
        });

        NET.socket.on('gemCollected', (data) => {
            if (GAME.entities.gems) {
                GAME.entities.gems = GAME.entities.gems.filter(g => g.id !== data.gemId);
            }
        });
        
        NET.socket.on('teamLevelUp', (data) => {
            if (!GAME.entities.player) return;
            GAME.entities.player.level = data.level; 
            if (GAME.entities.player.level > META.maxLevel) {
                META.maxLevel = GAME.entities.player.level;
                saveMetaLocalOnly();
                if (NET.socket && NET.socket.connected && META.playerName) {
                    NET.socket.emit('submitScore', { name: META.playerName, level: META.maxLevel });
                }
            }
            AudioEngine.play('lvlup');
            GAME.paused = true;
            showLevelUp();
        });
        
        NET.socket.on('resumeGame', () => {
            const waitModal = document.getElementById('waiting-modal');
            if (waitModal) waitModal.classList.remove('active');
            GAME.paused = false;
        });
        
        NET.socket.on('teamGameOver', () => {
            if (GAME.entities.player) GAME.entities.player.dead = true;
            const waitModal = document.getElementById('waiting-modal');
            if (waitModal) waitModal.classList.remove('active');
            gameOver();
        });

    } catch (e) {
        console.error("Socket init failed", e);
    }
}

window.requestServerList = () => {
    if (NET.socket && NET.socket.connected) {
        NET.socket.emit('requestRooms');
    }
};

function syncPlayer() {
    if (!NET.isMultiplayer || !NET.socket || !GAME.entities.player) return;
    
    let safeLaserTargets = [];
    if (GAME.entities.player.laserTargets) {
        safeLaserTargets = GAME.entities.player.laserTargets.map(chain => chain.map(e => e ? e.id : null).filter(id => id));
    }

    NET.socket.emit('playerUpdate', {
        x: GAME.entities.player.x, 
        y: GAME.entities.player.y,
        hp: GAME.entities.player.hp,
        maxHp: GAME.entities.player.maxHp,
        hat: META.upgrades.hat, 
        dead: GAME.entities.player.dead,
        level: GAME.entities.player.level,
        aura: GAME.entities.player.aura,
        auraRange: GAME.entities.player.auraRange,
        orbitals: GAME.entities.player.orbitals,
        fireTrail: GAME.entities.player.fireTrail,
        kaktus: GAME.entities.player.hasKaktus,
        shipType: GAME.entities.player.shipType,
        laserTargetsIds: safeLaserTargets,
        name: META.playerName 
    });
}

function syncShot(proj) {
    if (!NET.isMultiplayer || !NET.socket) return;
    const angle = Math.atan2(proj.vy, proj.vx);
    const speed = Math.hypot(proj.vx, proj.vy);
    NET.socket.emit('shoot', {
        x: proj.x, y: proj.y, 
        tx: proj.x + Math.cos(angle) * 100, 
        ty: proj.y + Math.sin(angle) * 100, 
        dmg: proj.damage, speed: speed, size: proj.radius, pierce: proj.pierce,
        bounce: proj.bounce, isCrit: proj.isCrit, type: proj.type, life: proj.life
    });
}

window.showHostModal = () => {
    const roomName = Math.random().toString(36).substr(2, 6).toUpperCase();
    document.getElementById('host-code-display').innerText = roomName;
    document.getElementById('multiplayer-modal').classList.remove('active');
    document.getElementById('host-modal').classList.add('active');

    document.getElementById('btn-copy-code').onclick = () => {
        navigator.clipboard.writeText(roomName).then(() => {
            const btn = document.getElementById('btn-copy-code');
            btn.innerText = "✅ ZKOPÍROVÁNO!";
            btn.style.background = "#10b981";
            setTimeout(() => {
                btn.innerText = "📋 KOPÍROVAT KÓD";
                btn.style.background = "rgba(255,255,255,0.1)";
            }, 2000);
        });
    };

    document.getElementById('btn-start-hosted').onclick = () => {
        document.getElementById('host-modal').classList.remove('active');
        tryFullscreen();
        window.joinCloudServer(roomName);
    };
};

window.joinCloudServer = (roomName) => {
    tryFullscreen();
    if(!roomName || roomName.trim() === '') {
        alert("Zadej platný kód!");
        return;
    }
    initSocket();
    NET.socket.emit('joinRoom', { roomId: roomName.trim().toUpperCase(), playerId: myPlayerId });
};

// Správa přihlášení a registrace přes server
function handleAuth(isLogin) {
    const nameVal = document.getElementById('input-login-name').value.trim();
    const passVal = document.getElementById('input-login-pass').value.trim();
    
    if (nameVal.length < 3) { alert("Jméno musí mít alespoň 3 znaky!"); return; }
    if (passVal.length < 1) { alert("Zadej heslo!"); return; }

    if (NET.socket && NET.socket.connected) {
        document.getElementById('login-loader').style.display = 'block';
        const eventName = isLogin ? 'login' : 'register';
        
        NET.socket.emit(eventName, { user: nameVal, pass: passVal });
        
        NET.socket.once(eventName + 'Response', (res) => {
            document.getElementById('login-loader').style.display = 'none';
            if (res.success) {
                META.playerName = nameVal;
                Object.assign(META, res.meta);
                
                localStorage.setItem('neoSurvivor_user', nameVal);
                localStorage.setItem('neoSurvivor_pass', passVal);
                saveMetaLocalOnly();
                
                document.getElementById('display-player-name').innerText = META.playerName;
                document.getElementById('display-max-level').innerText = META.maxLevel || 1;

                document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
                document.getElementById('menu-modal').classList.add('active');
                
                if (!GAME.loopStarted) {
                    GAME.loopStarted = true;
                    requestAnimationFrame(loop);
                }
            } else {
                const err = document.getElementById('login-error');
                if (err) err.innerText = res.msg;
            }
        });
    } else {
        // Offline záloha
        META.playerName = nameVal;
        localStorage.setItem('neoSurvivor_user', nameVal);
        localStorage.setItem('neoSurvivor_pass', passVal);
        saveMetaLocalOnly();
        
        document.getElementById('display-player-name').innerText = META.playerName;
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        document.getElementById('menu-modal').classList.add('active');
        
        if (!GAME.loopStarted) {
            GAME.loopStarted = true;
            requestAnimationFrame(loop);
        }
    }
}

function init() {
    GAME.canvas = document.getElementById('game-canvas');
    GAME.ctx = GAME.canvas.getContext('2d');
    GAME.loopStarted = false; 

    updateSpeedFactor();
    window.addEventListener('resize', () => { GAME.canvas.width = window.innerWidth; GAME.canvas.height = window.innerHeight; updateSpeedFactor(); });
    GAME.canvas.width = window.innerWidth; GAME.canvas.height = window.innerHeight;
    
    GAME.ctx.fillStyle = '#020617';
    GAME.ctx.fillRect(0, 0, GAME.canvas.width, GAME.canvas.height);

    loadMeta();
    document.getElementById('display-max-level').innerText = META.maxLevel || 0;
    
    initSocket();

    const savedUser = localStorage.getItem('neoSurvivor_user');
    const savedPass = localStorage.getItem('neoSurvivor_pass');

    if (!savedUser || !savedPass) {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        document.getElementById('login-modal').classList.add('active');
    } else {
        document.getElementById('display-player-name').innerText = savedUser;
        if (NET.socket) {
            NET.socket.emit('login', { user: savedUser, pass: savedPass });
            NET.socket.once('loginResponse', (res) => {
                if(res.success) {
                    META.playerName = savedUser;
                    Object.assign(META, res.meta);
                    saveMetaLocalOnly();
                    document.getElementById('display-max-level').innerText = META.maxLevel || 1;
                }
            });
        }
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        document.getElementById('menu-modal').classList.add('active');
        
        GAME.loopStarted = true;
        requestAnimationFrame(loop);
    }

    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) btnLogin.onclick = () => handleAuth(true);
    
    const btnRegister = document.getElementById('btn-register');
    if (btnRegister) btnRegister.onclick = () => handleAuth(false);

    document.getElementById('btn-reset-progress').onclick = () => {
        if (confirm("Opravdu chceš smazat všechen svůj postup, odhlásit se a vymazat lokální data?")) {
            localStorage.removeItem('neoSurvivor_meta');
            localStorage.removeItem('neoSurvivor_pid');
            localStorage.removeItem('neoSurvivor_user');
            localStorage.removeItem('neoSurvivor_pass');
            location.reload();
        }
    };

    GAME.entities = {
        player: new Player(true),
        enemies: [],
        projectiles: [],
        gems: [],
        pickedGems: new Set(),
        particles: [],
        fire: [],
        baits: [],
        floatingTexts: []
    };

    document.querySelectorAll('.btn-reload').forEach(btn => {
        btn.onclick = () => window.softResetToMenu();
    });

    window.addEventListener('keydown', (e) => { GAME.input[e.key.toLowerCase()] = true; if (e.key === 'Escape') togglePause(); });
    window.addEventListener('keyup', (e) => { GAME.input[e.key.toLowerCase()] = false; });

    GAME.canvas.addEventListener('mousedown', (e) => {
        if (!GAME.active || GAME.paused || !GAME.entities.player || GAME.entities.player.dead) return;
        const rect = GAME.canvas.getBoundingClientRect();
        const sx = (e.clientX - rect.left) / GAME.zoom;
        const sy = (e.clientY - rect.top) / GAME.zoom;
        if (Date.now() - GAME.lastSniperTime >= CONFIG.SNIPER_COOLDOWN) { fireSniper(sx, sy); GAME.lastSniperTime = Date.now(); }
    });

    const startAudio = () => {
        AudioEngine.init();
        const menu = document.getElementById('menu-modal');
        if (menu && menu.classList.contains('active')) {
            AudioEngine.startMenuMusic();
        }
        if (AudioEngine.ctx && AudioEngine.ctx.state === 'running') {
            ['mousedown', 'keydown', 'touchstart', 'mousemove'].forEach(type => window.removeEventListener(type, startAudio));
        }
    };
    ['mousedown', 'keydown', 'touchstart', 'mousemove'].forEach(type => window.addEventListener(type, startAudio));
    setInterval(() => { if (AudioEngine.ctx && AudioEngine.ctx.state === 'suspended') AudioEngine.ctx.resume(); }, 500);

    const btnStart = document.getElementById('btn-start');
    if (btnStart) btnStart.onclick = () => {
        NET.isMultiplayer = false;
        tryFullscreen();
        AudioEngine.init(); AudioEngine.stopMenuMusic(); AudioEngine.startMusic(); startGame();
    };
    
    const btnMP = document.getElementById('btn-multiplayer');
    if (btnMP) btnMP.onclick = (e) => {
        if (e) e.preventDefault();
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        document.getElementById('multiplayer-modal').classList.add('active');
        
        if (!NET.socket) {
            initSocket();
        }
        
        NET.serverPollingInterval = setInterval(window.requestServerList, 2000); 
    };
    
    const btnShips = document.getElementById('btn-ships-menu');
    if (btnShips) btnShips.onclick = () => {
        window.showShipsMenu();
        document.getElementById('ships-modal').classList.add('active');
    };
    const btnCloseShips = document.getElementById('btn-close-ships');
    if (btnCloseShips) btnCloseShips.onclick = () => document.getElementById('ships-modal').classList.remove('active');

    const btnMeta = document.getElementById('btn-meta-menu');
    if (btnMeta) btnMeta.onclick = () => { window.showMetaMenu(); document.getElementById('meta-modal').classList.add('active'); };
    const btnCloseMeta = document.getElementById('btn-close-meta');
    if (btnCloseMeta) btnCloseMeta.onclick = () => document.getElementById('meta-modal').classList.remove('active');

    const btnLeaderboard = document.getElementById('btn-leaderboard');
    if (btnLeaderboard) btnLeaderboard.onclick = () => {
        if (!NET.socket) initSocket();
        if (NET.socket && NET.socket.connected) {
            NET.socket.emit('requestLeaderboard');
        }
        document.getElementById('leaderboard-modal').classList.add('active');
    };
    const btnCloseLB = document.getElementById('btn-close-leaderboard');
    if (btnCloseLB) btnCloseLB.onclick = () => document.getElementById('leaderboard-modal').classList.remove('active');

    const btnSettings = document.getElementById('btn-settings');
    if (btnSettings) btnSettings.onclick = () => {
        document.getElementById('settings-modal').classList.add('active');
    };
    const btnCloseSettings = document.getElementById('btn-close-settings');
    if (btnCloseSettings) btnCloseSettings.onclick = () => document.getElementById('settings-modal').classList.remove('active');

    const btnCloseMP = document.getElementById('btn-close-mp');
    if (btnCloseMP) btnCloseMP.onclick = () => {
        clearInterval(NET.serverPollingInterval);
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        document.getElementById('menu-modal').classList.add('active');
    };

    const btnResume = document.getElementById('btn-resume');
    if (btnResume) btnResume.onclick = togglePause;

    const mobilePause = document.getElementById('mobile-pause');
    if (mobilePause) mobilePause.onclick = (e) => { e.stopPropagation(); togglePause(); };

    const fsToggle = document.getElementById('fs-toggle');
    if (fsToggle) fsToggle.onclick = (e) => { 
        e.stopPropagation(); 
        toggleFullscreen(document.documentElement); 
    };

    const btnRestart = document.getElementById('btn-restart-game');
    if (btnRestart) btnRestart.onclick = () => { 
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        tryFullscreen();
        startGame(); 
    };

    GAME.canvas.addEventListener('touchstart', (e) => {
        if (!GAME.active || GAME.paused || !GAME.entities.player || GAME.entities.player.dead) return;
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
}

function fireSniper(cx, cy) {
    if (!GAME.entities.player) return;
    const p = GAME.entities.player, cam = GAME.camera;
    const worldTargetX = cx + (cam.x / GAME.zoom);
    const worldTargetY = cy + (cam.y / GAME.zoom);
    const proj = new Projectile(p.x, p.y, worldTargetX, worldTargetY, p.damage * 10, { size: 12, pierce: Infinity });
    if (GAME.entities.projectiles) GAME.entities.projectiles.push(proj); 
    shakeScreen(15);
    if (NET.isMultiplayer) syncShot(proj);
}

function startGame() {
    resetGame();
    GAME.active = true;
    AudioEngine.stopMenuMusic();
    AudioEngine.startMusic();
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    
    if (!NET.isMultiplayer) {
        GAME.lastSpawnTime = Date.now();
    }
}

function resetGame() {
    GAME.time = 0; GAME.kills = 0; GAME.lastBossTime = 0;
    GAME.lastSpawnTime = Date.now();
    
    GAME.entities = {
        player: new Player(true),
        enemies: [],
        projectiles: [],
        gems: [],
        pickedGems: new Set(),
        particles: [],
        fire: [],
        baits: [],
        floatingTexts: []
    };
    
    GAME.stars = []; 
    for (let i = 0; i < 150; i++) {
        GAME.stars.push({ x: Math.random() * 2000, y: Math.random() * 2000, size: Math.random() * 2, opacity: Math.random() * 0.5 });
    }
    updateSpeedFactor(); 
    updateUI();
}

let lastTime = 0;
let accumulator = 0;
const timeStep = 1000 / 60;

function loop(time) { 
    if (!lastTime) lastTime = time;
    let dt = time - lastTime;
    lastTime = time;
    
    if (dt > 100) dt = 100;
    
    if (GAME.active && !GAME.paused) {
        accumulator += dt;
        while (accumulator >= timeStep) {
            update(timeStep);
            accumulator -= timeStep;
        }
    } 
    
    render();
    requestAnimationFrame(loop); 
}

function update(dt) {
    if (GAME.paused || !GAME.entities || !GAME.entities.player) return;
    
    if(!NET.isMultiplayer) {
        GAME.time += 1 / 60; 
        
        const currentInterval = Math.max(100, CONFIG.SPAWN_INTERVAL / (1 + GAME.time / 60));
        if (Date.now() - GAME.lastSpawnTime > currentInterval) {
            const alive = getAllAlivePlayers();
            if (alive.length > 0) {
                const pivot = alive[Math.floor(Math.random() * alive.length)];
                const a = Math.random() * Math.PI * 2;
                const x = pivot.x + Math.cos(a) * CONFIG.SPAWN_RADIUS;
                const y = pivot.y + Math.sin(a) * CONFIG.SPAWN_RADIUS;
                const mod = Math.floor(GAME.time / 60) + 1;

                let enemy;
                if (GAME.entities.player.level >= 20 && (GAME.time - GAME.lastBossTime > CONFIG.BOSS_INTERVAL)) {
                    enemy = new Boss(x, y, mod);
                    showBossWarning(); 
                    GAME.lastBossTime = GAME.time;
                } else {
                    let type = 1;
                    if (GAME.entities.player.level >= 3 && Math.random() < 0.1) type = 2;
                    enemy = new Enemy(x, y, mod, Math.random().toString(36).substr(2, 9), type);
                }
                if (GAME.entities.enemies) GAME.entities.enemies.push(enemy);
            }
            GAME.lastSpawnTime = Date.now();
        }
    }
    
    const p = GAME.entities.player; 
    p.update(dt);
    
    GAME.camera.x = (p.x * GAME.zoom) - GAME.canvas.width / 2; GAME.camera.y = (p.y * GAME.zoom) - GAME.canvas.height / 2;
    if (CONFIG.SCREEN_SHAKE > 0) { GAME.camera.x += (Math.random() - 0.5) * CONFIG.SCREEN_SHAKE; GAME.camera.y += (Math.random() - 0.5) * CONFIG.SCREEN_SHAKE; CONFIG.SCREEN_SHAKE *= 0.9; }

    syncPlayer();
    
    for (const id in NET.others) {
        if (NET.others[id]) NET.others[id].update(dt);
    }

    if (GAME.entities.floatingTexts) {
        for (let i = GAME.entities.floatingTexts.length - 1; i >= 0; i--) {
            const ft = GAME.entities.floatingTexts[i];
            if (ft) {
                ft.update();
                if (ft.life <= 0) GAME.entities.floatingTexts.splice(i, 1);
            }
        }
    }

    const targets = getAllTargets();
    const alivePlayers = getAllAlivePlayers();
    if (alivePlayers.length === 0 && GAME.active) gameOver();

    if (GAME.entities.enemies) {
        GAME.entities.enemies.forEach((e) => {
            if (!e) return;
            e.update();
            targets.forEach(t => {
                if (dist(t.x, t.y, e.x, e.y) < t.radius + e.radius) {
                    if (t.isBait) {
                        if (NET.isMultiplayer) {
                            NET.socket.emit('baitHit', { id: t.obj.id, damage: (e.isBoss ? 5 : 1) * GAME.speedFactor });
                        } else {
                            t.obj.hp -= (e.isBoss ? 5 : 1) * GAME.speedFactor;
                        }
                    } else {
                        if (t.kaktus) {
                            e.hp = 0; e.dead = true;
                            if(NET.isMultiplayer) NET.socket.emit('enemyHit', {id: e.id, damage: 99999});
                        } else {
                            t.hp -= (e.isBoss ? 2 : 0.5) * (t.shield || 1);
                            if (t.hp <= 0) t.dead = true;
                            
                            if (t.isLocal) {
                                shakeScreen(8);
                                const overlay = document.getElementById('hit-overlay');
                                if (overlay) {
                                    overlay.style.opacity = '1';
                                    setTimeout(() => overlay.style.opacity = '0', 100);
                                }
                            }
                        }
                    }
                }
            });
        });

        if (!NET.isMultiplayer) {
            GAME.entities.enemies = GAME.entities.enemies.filter(e => e && e.hp > 0 && !e.dead);
        }
    }

    if (GAME.entities.baits) {
        GAME.entities.baits = GAME.entities.baits.filter(b => b && b.hp > 0);
        GAME.entities.baits.forEach(b => b.update());
    }

    if (GAME.entities.fire) {
        for (let i = GAME.entities.fire.length - 1; i >= 0; i--) {
            const f = GAME.entities.fire[i];
            if (f) {
                f.update();
                if (f.life <= 0) {
                    GAME.entities.fire.splice(i, 1);
                }
            }
        }
    }

    if (GAME.entities.projectiles && GAME.entities.enemies) {
        const enemies = GAME.entities.enemies;
        for (let pIndex = GAME.entities.projectiles.length - 1; pIndex >= 0; pIndex--) {
            const proj = GAME.entities.projectiles[pIndex];
            if (!proj) continue;
            proj.update();
            
            if (proj.life <= 0) { 
                GAME.entities.projectiles.splice(pIndex, 1); 
                continue; 
            }

            if (proj.isEnemy) {
                alivePlayers.forEach(pl => {
                    if (dist(proj.x, proj.y, pl.x, pl.y) < proj.radius + pl.radius) {
                        pl.hp -= proj.damage * (pl.shield || 1);
                        if (pl.hp <= 0) pl.dead = true;
                        GAME.entities.projectiles.splice(pIndex, 1);
                        updateUI();
                        
                        if (pl.isLocal) {
                            shakeScreen(5);
                            const overlay = document.getElementById('hit-overlay');
                            if (overlay) {
                                overlay.style.opacity = '1';
                                setTimeout(() => overlay.style.opacity = '0', 100);
                            }
                        }
                    }
                });
            } else {
                enemies.forEach((enemy) => {
                    let hitDist = 0;
                    let d = 0;
                    
                    if (proj.type === 'wall') {
                        const vMag = Math.hypot(proj.vx, proj.vy) || 1;
                        const nx = -proj.vy / vMag;
                        const ny = proj.vx / vMag;
                        const halfLen = proj.radius;
                        
                        const ax = proj.x - nx * halfLen;
                        const ay = proj.y - ny * halfLen;
                        const bx = proj.x + nx * halfLen;
                        const by = proj.y + ny * halfLen;
                        
                        const px = enemy.x - ax;
                        const py = enemy.y - ay;
                        const dx = bx - ax;
                        const dy = by - ay;
                        const l2 = dx*dx + dy*dy;
                        
                        let t = 0;
                        if (l2 > 0) t = Math.max(0, Math.min(1, (px * dx + py * dy) / l2));
                        
                        const closeX = ax + t * dx;
                        const closeY = ay + t * dy;
                        d = dist(enemy.x, enemy.y, closeX, closeY);
                        hitDist = enemy.radius + 8;
                    } else {
                        d = dist(proj.x, proj.y, enemy.x, enemy.y);
                        hitDist = proj.radius + enemy.radius;
                    }

                    if (!proj.hitEnemies.has(enemy) && d < hitDist) {
                        enemy.hp -= proj.damage; 
                        proj.hitEnemies.add(enemy);
                        
                        if (proj.isCrit) {
                            if (!GAME.entities.floatingTexts) GAME.entities.floatingTexts = [];
                            GAME.entities.floatingTexts.push(new FloatingText(enemy.x, enemy.y - 25, "CRITICAL!", "#ef4444"));
                        }

                        if (NET.isMultiplayer) {
                            NET.socket.emit('enemyHit', { id: enemy.id, damage: proj.damage });
                        }
                        if (proj.bounce > 0) {
                            const validTargets = enemies.filter(e => e !== enemy && !proj.hitEnemies.has(e));
                            if (validTargets.length > 0) {
                                const next = validTargets.sort((a, b) => dist(proj.x, proj.y, a.x, a.y) - dist(proj.x, proj.y, b.x, b.y))[0];
                                const angle = Math.atan2(next.y - proj.y, next.x - proj.x);
                                proj.vx = Math.cos(angle) * CONFIG.PROJECTILE_SPEED; proj.vy = Math.sin(angle) * CONFIG.PROJECTILE_SPEED; proj.bounce--;
                            }
                        }
                        if (proj.pierce > 1) proj.pierce--; else if (proj.pierce !== Infinity && proj.bounce <= 0) GAME.entities.projectiles.splice(pIndex, 1);
                        if (enemy.hp <= 0) { 
                            AudioEngine.play('hit'); 
                            if (!NET.isMultiplayer && GAME.entities.gems) GAME.entities.gems.push(new Gem(enemy.x, enemy.y)); 
                            GAME.kills++; 
                            updateUI(); 
                        }
                    }
                });
            }
        }
    }

    if (GAME.entities.gems) {
        for (let i = GAME.entities.gems.length - 1; i >= 0; i--) {
            const g = GAME.entities.gems[i];
            if (!g) continue;
            g.update(p);
            if (!p.dead && dist(p.x, p.y, g.x, g.y) < p.radius + g.radius) {
                AudioEngine.play('gem');
                if(NET.isMultiplayer) {
                    GAME.entities.pickedGems.add(g.id);
                    NET.socket.emit('gemPickup', g.id);
                } else {
                    p.addXp(Math.round(10 * (p.luckFactor || 1)));
                }
                GAME.entities.gems.splice(i, 1);
            }
        }
    }
    updateUI();
}

function render() {
    const ctx = GAME.ctx, cam = GAME.camera;
    if (!ctx) return;
    
    ctx.save(); ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, GAME.canvas.width, GAME.canvas.height); ctx.scale(GAME.zoom, GAME.zoom);
    const camX = cam.x / GAME.zoom, camY = cam.y / GAME.zoom;
    
    if (GAME.stars) {
        GAME.stars.forEach(s => {
            if (!s) return;
            const sx = (s.x - camX * 0.1) % (GAME.canvas.width / GAME.zoom), sy = (s.y - camY * 0.1) % (GAME.canvas.height / GAME.zoom);
            ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`; ctx.beginPath(); ctx.arc(sx < 0 ? sx + (GAME.canvas.width / GAME.zoom) : sx, sy < 0 ? sy + (GAME.canvas.height / GAME.zoom) : sy, s.size, 0, Math.PI * 2); ctx.fill();
        });
    }
    
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)'; ctx.lineWidth = 1; ctx.beginPath();
    const hexRadius = 60, hexHeight = hexRadius * Math.sqrt(3);
    const startCol = Math.floor(camX / (hexRadius * 1.5)) - 1, endCol = startCol + Math.ceil((GAME.canvas.width / GAME.zoom) / (hexRadius * 1.5)) + 2;
    const startRow = Math.floor(camY / hexHeight) - 1, endRow = startRow + Math.ceil((GAME.canvas.height / GAME.zoom) / hexHeight) + 2;
    for (let col = startCol; col <= endCol; col++) {
        for (let row = startRow; row <= endRow; row++) {
            const cx = col * hexRadius * 1.5 - camX, cy = (row * hexHeight + (Math.abs(col) % 2 === 0 ? 0 : hexHeight / 2)) - camY;
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const px = cx + Math.cos(a) * hexRadius, py = cy + Math.sin(a) * hexRadius; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
        }
    }
    ctx.stroke();
    
    if (GAME.active && GAME.entities) {
        if (GAME.entities.fire) GAME.entities.fire.forEach(f => { if(f) f.draw(ctx, { x: camX, y: camY }); });
        if (GAME.entities.baits) GAME.entities.baits.forEach(b => { if(b) b.draw(ctx, { x: camX, y: camY }); });
        if (GAME.entities.gems) GAME.entities.gems.forEach(g => { if(g) g.draw(ctx, { x: camX, y: camY }); });
        if (GAME.entities.projectiles) GAME.entities.projectiles.forEach(p => { if(p) p.draw(ctx, { x: camX, y: camY }); });
        if (GAME.entities.enemies) GAME.entities.enemies.forEach(e => { if(e) e.draw(ctx, { x: camX, y: camY }); });
        
        for (const id in NET.others) {
            if (NET.others[id]) {
                const op = NET.others[id];
                
                if (op.shipType === 2 && op.laserTargetsIds && op.laserTargetsIds.length > 0 && GAME.entities.enemies) {
                    const chainsToDraw = op.laserTargetsIds.map(chainIds => {
                        return chainIds.map(eid => GAME.entities.enemies.find(e => e && e.id === eid)).filter(e => e);
                    }).filter(chain => chain.length > 0);
                    
                    chainsToDraw.forEach(chain => {
                        if (!chain || chain.length === 0) return;
                        ctx.save();
                        ctx.beginPath();
                        ctx.moveTo(op.x - camX, op.y - camY);
                        chain.forEach(target => {
                            if (target) ctx.lineTo(target.x - camX, target.y - camY);
                        });
                        ctx.strokeStyle = '#ef4444';
                        ctx.lineWidth = 6 + (op.projSize - 6);
                        ctx.shadowBlur = 20;
                        ctx.shadowColor = '#ef4444';
                        ctx.stroke();
                        
                        ctx.beginPath();
                        ctx.moveTo(op.x - camX, op.y - camY);
                        chain.forEach(target => {
                            if (target) ctx.lineTo(target.x - camX, target.y - camY);
                        });
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 2 + (op.projSize - 6) * 0.3;
                        ctx.shadowBlur = 0;
                        ctx.stroke();
                        ctx.restore();
                    });
                }
                
                op.draw(ctx, { x: camX, y: camY });
            }
        }
        
        if (GAME.entities.player) GAME.entities.player.draw(ctx, { x: camX, y: camY });
        
        if (GAME.entities.floatingTexts) {
            GAME.entities.floatingTexts.forEach(ft => { if(ft) ft.draw(ctx, {x: camX, y: camY}); });
        }
    }
    
    ctx.restore();
    
    if (GAME.active && GAME.entities && GAME.entities.player && !GAME.entities.player.dead) {
        const cx = GAME.canvas.width / 2;
        const cy = GAME.canvas.height / 2;
        
        const marginX = 50;
        const marginY = 100;
        const boundX = cx - marginX;
        const boundY = cy - marginY;

        for (const id in NET.others) {
            const op = NET.others[id];
            if (op && !op.dead) {
                const screenX = (op.x * GAME.zoom) - GAME.camera.x;
                const screenY = (op.y * GAME.zoom) - GAME.camera.y;

                if (screenX < marginX || screenX > GAME.canvas.width - marginX || screenY < marginY || screenY > GAME.canvas.height - marginY) {
                    const dx = screenX - cx;
                    const dy = screenY - cy;
                    const angle = Math.atan2(dy, dx);
                    const tanTheta = Math.tan(angle);

                    let edgeX, edgeY;
                    if (Math.abs(tanTheta) < boundY / boundX) {
                        edgeX = cx + (dx > 0 ? boundX : -boundX);
                        edgeY = cy + (dx > 0 ? boundX : -boundX) * tanTheta;
                    } else {
                        edgeY = cy + (dy > 0 ? boundY : -boundY);
                        edgeX = cx + (dy > 0 ? boundY : -boundY) / tanTheta;
                    }

                    ctx.save();
                    ctx.translate(edgeX, edgeY);
                    
                    ctx.save();
                    ctx.rotate(angle);
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#3b82f6';
                    ctx.fillStyle = '#3b82f6';
                    ctx.beginPath();
                    ctx.moveTo(12, 0);
                    ctx.lineTo(-8, 8);
                    ctx.lineTo(-4, 0);
                    ctx.lineTo(-8, -8);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                    
                    if (op.remoteName) {
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                        ctx.font = 'bold 10px Outfit, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(op.remoteName, -Math.cos(angle) * 25, -Math.sin(angle) * 25);
                    }
                    
                    ctx.restore();
                }
            }
        }

        const mapSize = 150;
        const padding = 20;
        const startX = GAME.canvas.width - mapSize - padding;
        const startY = 80; 

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
        ctx.lineWidth = 2;
        ctx.fillRect(startX, startY, mapSize, mapSize);
        ctx.strokeRect(startX, startY, mapSize, mapSize);

        const viewDist = 4000;
        const scale = mapSize / viewDist;
        const pCx = GAME.entities.player.x;
        const pCy = GAME.entities.player.y;

        const drawDot = (x, y, color, size) => {
            const relX = (x - pCx) * scale + mapSize / 2;
            const relY = (y - pCy) * scale + mapSize / 2;
            if (relX >= 0 && relX <= mapSize && relY >= 0 && relY <= mapSize) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(startX + relX, startY + relY, size, 0, Math.PI * 2);
                ctx.fill();
            }
        };

        if (GAME.entities.gems) GAME.entities.gems.forEach(g => { if(g) drawDot(g.x, g.y, '#34d399', 1); });
        if (GAME.entities.enemies) GAME.entities.enemies.forEach(e => { if(e) drawDot(e.x, e.y, e.isBoss ? '#ef4444' : (e.type===2 ? '#a855f7' : '#f59e0b'), e.isBoss ? 4 : 2); });
        for (const id in NET.others) {
            const op = NET.others[id];
            if (op && !op.dead) drawDot(op.x, op.y, '#3b82f6', 3);
        }
        drawDot(pCx, pCy, '#10b981', 3);

        ctx.restore();
    }

    if (window.innerWidth < 850 && GAME.joystick) {
        ctx.save(); const sx = GAME.joystick.startX, sy = GAME.joystick.startY, jcx = GAME.joystick.currentX, jcy = GAME.joystick.currentY;
        ctx.beginPath(); ctx.arc(sx, sy, 75, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(jcx, jcy, 32, 0, Math.PI * 2); ctx.fillStyle = 'rgba(99, 102, 241, 0.5)'; ctx.shadowBlur = 20; ctx.shadowColor = '#6366f1'; ctx.fill(); ctx.restore();
    }
}

const initAudio = () => {
    AudioEngine.init();
    if (document.getElementById('menu-modal') && document.getElementById('menu-modal').classList.contains('active')) {
        AudioEngine.startMenuMusic();
    }
};

window.addEventListener('click', initAudio);
window.addEventListener('keydown', initAudio);
window.addEventListener('touchstart', initAudio);

init();
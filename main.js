/**
 * NEO SURVIVOR - Core Game Logic - v1.286
 */

window.onerror = function (msg, url, line, col, error) {
    console.error("Chyba:", msg, line, error);
    return false;
};

console.warn("SCRIPT: Neo Survivor načten.");

window.showCustomAlert = function (msg) {
    const modal = document.getElementById('custom-alert-modal');
    const text = document.getElementById('custom-alert-text');
    if (modal && text) {
        text.innerText = msg;
        modal.classList.add('active');
    } else {
        console.warn("Custom alert:", msg);
    }
};

// --- AUDIO SYSTEM ---
const SOUND_URLS = {
    menuOpen: 'https://assets.mixkit.co/sfx/preview/mixkit-modern-technology-select-3124.mp3',
    upgrade: 'https://assets.mixkit.co/sfx/preview/mixkit-button-click-interface-1002.mp3',
    crateSpin: 'https://assets.mixkit.co/sfx/preview/mixkit-quick-mechanical-click-2510.mp3',
    crateWin: 'https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3',
    coin: 'https://assets.mixkit.co/sfx/preview/mixkit-arcade-retro-changing-tab-206.mp3'
};

const SOUND_BUFFERS = {};

function playSound(name) {
    if (!META.settings.sfx) return;
    if (AudioEngine.ctx) {
        if (AudioEngine.ctx.state === 'suspended') {
            AudioEngine.ctx.resume().then(() => AudioEngine.play(name));
        } else {
            AudioEngine.play(name);
        }
    }
}

const MUSIC = {
    menu: new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'),
    upgrades: new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3'),
    crates: new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3')
};
Object.values(MUSIC).forEach(m => { m.loop = true; m.volume = 0; });

function switchMusic(target) {
    if (AudioEngine.ctx && AudioEngine.ctx.state === 'suspended') AudioEngine.ctx.resume();
    
    Object.keys(MUSIC).forEach(k => {
        const m = MUSIC[k];
        if (k === target) {
            if (m.paused) {
                m.currentTime = 0;
                m.play().catch(e => console.warn("Music play blocked", k, e));
            }
            let vol = 0.2;
            if (target === 'upgrades') vol = 0.2;
            fadeVolume(m, vol);
        } else if (target === 'upgrades' && k === 'menu') {
            fadeVolume(m, 0.08); // Keep menu music dim
        } else {
            fadeVolume(m, 0);
        }
    });
}

function updateMusicVolume() {
    Object.keys(MUSIC).forEach(k => {
        const m = MUSIC[k];
        const isMenu = k === 'menu' || k === 'crates' || k === 'upgrades';
        const enabled = isMenu ? META.settings.musicMenu : META.settings.musicGame;
        if (!enabled) {
            m.muted = true;
            m.pause();
        } else {
            m.muted = false;
        }
    });
}

function fadeVolume(audio, target) {
    if (audio.fadeInterval) clearInterval(audio.fadeInterval);
    const step = 0.05;
    audio.fadeInterval = setInterval(() => {
        if (audio.volume < target) {
            audio.volume = Math.min(target, audio.volume + step);
        } else if (audio.volume > target) {
            audio.volume = Math.max(target, audio.volume - step);
        }
        
        if (Math.abs(audio.volume - target) < 0.01) {
            audio.volume = target;
            if (target === 0) {
                audio.pause();
                audio.currentTime = 0;
            }
            clearInterval(audio.fadeInterval);
            audio.fadeInterval = null;
        }
    }, 50);
}

function showConfetti(count = 100) {
    const container = document.createElement('div');
    container.style.position = 'fixed'; container.style.inset = '0'; container.style.pointerEvents = 'none'; container.style.zIndex = '9999999';
    document.body.appendChild(container);
    for(let i=0; i<count; i++) {
        const p = document.createElement('div');
        p.style.position = 'absolute'; p.style.width = '10px'; p.style.height = '10px';
        p.style.background = `hsl(${Math.random()*360}, 100%, 50%)`;
        p.style.left = '50%'; p.style.top = '50%';
        p.style.borderRadius = '2px';
        container.appendChild(p);
        const angle = Math.random() * Math.PI * 2;
        const speed = 5 + Math.random() * 15;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed - 10;
        let x = 0, y = 0, grav = 0.5;
        const anim = setInterval(() => {
            x += vx; y += vy; vy += grav;
            p.style.transform = `translate(${x}px, ${y}px) rotate(${x}deg)`;
            if (y > window.innerHeight) { clearInterval(anim); p.remove(); }
        }, 16);
    }
    setTimeout(() => container.remove(), 4000);
}

window.showCustomConfirm = function (msg, onConfirm) {
    const modal = document.getElementById('custom-confirm-modal');
    const text = document.getElementById('custom-confirm-text');
    const btnYes = document.getElementById('btn-confirm-yes');
    if (modal && text && btnYes) {
        text.innerText = msg;
        btnYes.onclick = () => {
            modal.classList.remove('active');
            if (onConfirm) onConfirm();
        };
        modal.classList.add('active');
    } else {
        if (confirm(msg)) {
            if (onConfirm) onConfirm();
        }
    }
};

const CONFIG = {
    PLAYER_BASE_SPEED: 4.5,
    PLAYER_BASE_HEALTH: 120,
    ENEMY_BASE_HEALTH: 20,
    ENEMY_BASE_SPEED: 2.5,
    PROJECTILE_SPEED: 11,
    SPAWN_INTERVAL: 800,
    SPAWN_RADIUS: 700,
    GEM_VALUES: 10,
    XP_PER_LEVEL: 100,
    BOSS_LEVEL_INTERVAL: 10,
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
        { id: 'lifesteal', name: 'Lifesteal', desc: '10% šance vyléčit si 8% HP při killu', icon: '🧛', rarity: 'epic' },
        { id: 'fire', name: 'Ohnivá Stopa', desc: 'Zanecháváš za sebou oheň', icon: '🔥', rarity: 'epic' },
        { id: 'kaktus', name: 'Kaktus', desc: 'Zabíjí dotykem (10s on, 30s off)', icon: '🌵', rarity: 'epic' },

        { id: 'xpgen', name: 'Zkušenostní Pole', desc: 'Generuje 1 XP automaticky', icon: '💎', rarity: 'legendary' },
        { id: 'luck', name: 'Větší Výběr', desc: '+1 možnost při levelu', icon: '🍀', rarity: 'legendary' },
        { id: 'aura', name: 'Mraziv Aura', desc: 'Zpomaluje blízké nepřátele', icon: '❄️', rarity: 'legendary' },
        { id: 'bait', name: 'Návnada', desc: 'Vypouští chutné cíle pro ufony', icon: '🪤', rarity: 'legendary' },
        { id: 'possession_plus', name: 'Velitel Duchů', desc: 'Ability: Posedne o +2 více nepřátel', icon: '👻', rarity: 'rare' }
    ],
    RARITIES: {
        common: { chance: 40, color: '#94a3b8', name: 'COMMON' },
        uncommon: { chance: 25, color: '#3b82f6', name: 'UNCOMMON' },
        rare: { chance: 20, color: '#22c55e', name: 'RARE' },
        epic: { chance: 10, color: '#a855f7', name: 'EPIC' },
        legendary: { chance: 5, color: '#eab308', name: 'LEGENDARY' }
    }
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
    lastDailyGift: 0,
    dailyStreak: 0,
    upgrades: { hp: 0, speed: 0, luck: 0, regen: 0, armor: 0, hat: null },
    ships: { 1: true, 2: false, 3: false, 4: false, 5: false },
    selectedShip: 1,
    abilities: { 1: true, 2: false, 3: false, 4: false },
    selectedAbility: 1,
    lastMoveTime: Date.now(),
    isAFK: false,
    achievements: {},
    stats: { totalBossKills: 0, totalDogecoins: 0, totalGames: 0, totalRandomPicks: 0, totalPlayTime: 0 },
    inventory: [],
    settings: { musicMenu: true, musicGame: true, sfx: true }
};

const EMOJIS = [
    { id: 'soap', name: 'Mýdlo', icon: '🫆', rarity: 'common', price: 20 },
    { id: 'money', name: 'Peníze', icon: '💲', rarity: 'rare', price: 100 },
    { id: 'smile', name: 'Úsměv', icon: '😃', rarity: 'common', price: 15 },
    { id: 'nerd', name: 'Nerd', icon: '🤓', rarity: 'common', price: 15 },
    { id: 'laugh', name: 'Smích', icon: '😆', rarity: 'common', price: 15 },
    { id: 'ugh', name: 'Ugh', icon: '😖', rarity: 'common', price: 15 },
    { id: 'surprise', name: 'Překvapení', icon: '😯', rarity: 'uncommon', price: 30 },
    { id: 'dead', name: 'K.O.', icon: '😵', rarity: 'uncommon', price: 30 },
    { id: 'hands_up', name: 'Ruce vzhůru', icon: '🤲', rarity: 'uncommon', price: 35 },
    { id: 'dislike', name: 'Dislike', icon: '👎', rarity: 'common', price: 10 },
    { id: 'heart', name: 'Srdce', icon: '🫶', rarity: 'rare', price: 80 },
    { id: 'open_hands', name: 'Otevřené ruce', icon: '👐', rarity: 'uncommon', price: 40 },
    { id: 'handshake', name: 'Podání ruky', icon: '🫱', rarity: 'uncommon', price: 40 },
    { id: 'guard', name: 'Stráž', icon: '💂', rarity: 'epic', price: 250 },
    { id: 'hero', name: 'Hrdina', icon: '🦸', rarity: 'epic', price: 300 },
    { id: 'sunflower', name: 'Slunečnice', icon: '🌻', rarity: 'rare', price: 120 },
    { id: 'leaf', name: 'List', icon: '🍁', rarity: 'common', price: 20 },
    { id: 'owl', name: 'Sova', icon: '🦉', rarity: 'epic', price: 400 },
    { id: 'chick', name: 'Kuře', icon: '🐣', rarity: 'rare', price: 150 },
    { id: 'icecream', name: 'Zmrzlina', icon: '🍧', rarity: 'uncommon', price: 50 },
    { id: 'cake', name: 'Dort', icon: '🍰', rarity: 'rare', price: 180 },
    { id: 'fishcake', name: 'Naruto', icon: '🍥', rarity: 'epic', price: 350 },
    { id: 'alien', name: 'Mimozemšťan', icon: '👽', rarity: 'epic', price: 500 },
    { id: 'ghost', name: 'Duch', icon: '👻', rarity: 'uncommon', price: 60 },
    { id: 'robot', name: 'Robot', icon: '🤖', rarity: 'rare', price: 200 },
    { id: 'fire', name: 'Oheň', icon: '🔥', rarity: 'rare', price: 150 },
    { id: 'star', name: 'Hvězda', icon: '⭐', rarity: 'uncommon', price: 45 },
    { id: 'pizza', name: 'Pizza', icon: '🍕', rarity: 'uncommon', price: 55 },
    { id: 'burger', name: 'Burger', icon: '🍔', rarity: 'uncommon', price: 55 },
    { id: 'sushi', name: 'Sushi', icon: '🍣', rarity: 'rare', price: 220 },
    { id: 'taco', name: 'Taco', icon: '🌮', rarity: 'rare', price: 210 },
    { id: 'coffee', name: 'Káva', icon: '☕', rarity: 'common', price: 25 },
    { id: 'beer', name: 'Pivo', icon: '🍺', rarity: 'uncommon', price: 40 },
    { id: 'rocket', name: 'Raketa', icon: '🚀', rarity: 'epic', price: 600 },
    { id: 'ufo', name: 'UFO', icon: '🛸', rarity: 'legendary', price: 2000 },
    { id: 'ring', name: 'Prsten', icon: '💍', rarity: 'legendary', price: 5000 },
    { id: 'oni', name: 'Oni', icon: '👹', rarity: 'epic', price: 450 },
    { id: 'vampire', name: 'Upír', icon: '🧛', rarity: 'epic', price: 480 },
    { id: 'zombie', name: 'Zombie', icon: '🧟', rarity: 'uncommon', price: 40 },
    { id: 'dragon', name: 'Drak', icon: '🐉', rarity: 'legendary', price: 3500 },
    { id: 'volcano', name: 'Sopka', icon: '🌋', rarity: 'rare', price: 180 },
    { id: 'galaxy', name: 'Galaxie', icon: '🌌', rarity: 'legendary', price: 6000 },
    { id: 'saturn', name: 'Saturn', icon: '🪐', rarity: 'rare', price: 250 },
    { id: 'invader', name: 'Vetřelec', icon: '👾', rarity: 'epic', price: 550 },
    { id: 'spy', name: 'Špión', icon: '🕵️', rarity: 'rare', price: 200 },
    { id: 'spy', name: 'Špión', icon: '🕵️', rarity: 'rare', price: 200 },
    { id: 'fox', name: 'Liška', icon: '🦊', rarity: 'uncommon', price: 45 },
    { id: 'bear', name: 'Medvěd', icon: '🐻', rarity: 'uncommon', price: 45 },
    { id: 'panda', name: 'Panda', icon: '🐼', rarity: 'rare', price: 120 },
    { id: 'koala', name: 'Koala', icon: '🐨', rarity: 'rare', price: 125 },
    { id: 'tiger', name: 'Tygr', icon: '🐯', rarity: 'epic', price: 450 },
    { id: 'lion', name: 'Lev', icon: '🦁', rarity: 'epic', price: 500 },
    { id: 'frog', name: 'Žába', icon: '🐸', rarity: 'common', price: 20 },
    { id: 'monkey', name: 'Opice', icon: '🐵', rarity: 'uncommon', price: 50 },
    { id: 'penguin', name: 'Tučňák', icon: '🐧', rarity: 'rare', price: 180 },
    { id: 'unicorn', name: 'Jednorožec', icon: '🦄', rarity: 'legendary', price: 4000 },
    { id: 'butterfly', name: 'Motýl', icon: '🦋', rarity: 'rare', price: 160 },
    { id: 'turtle', name: 'Želva', icon: '🐢', rarity: 'uncommon', price: 70 },
    { id: 'octopus', name: 'Chobotnice', icon: '🐙', rarity: 'epic', price: 600 },
    { id: 'whale', name: 'Velryba', icon: '🐳', rarity: 'epic', price: 650 },
    { id: 'apple', name: 'Jablko', icon: '🍎', rarity: 'common', price: 15 },
    { id: 'banana', name: 'Banán', icon: '🍌', rarity: 'common', price: 15 },
    { id: 'watermelon', name: 'Meloun', icon: '🍉', rarity: 'uncommon', price: 35 },
    { id: 'sushi_roll', name: 'Maki', icon: '🍣', rarity: 'rare', price: 240 },
    { id: 'ramen', name: 'Ramen', icon: '🍜', rarity: 'rare', price: 260 },
    { id: 'ice_cube', name: 'Led', icon: '🧊', rarity: 'common', price: 10 },
    { id: 'crystal', name: 'Krystal', icon: '🔮', rarity: 'epic', price: 700 },
    { id: 'rainbow', name: 'Duha', icon: '🌈', rarity: 'legendary', price: 4500 },
    { id: 'clover', name: 'Čtyřlístek', icon: '🍀', rarity: 'rare', price: 300 },
    { id: 'diamond_gem', name: 'Safír', icon: '🔷', rarity: 'rare', price: 400 },
    { id: 'gold_bar', name: 'Zlato', icon: '🧱', rarity: 'epic', price: 800 },
    // ČEPICE (Legendární)
    { id: 'hat_crown', name: '👑 Koruna', icon: '👑', rarity: 'legendary', price: 1000, isHat: true, type: 'crown' },
    { id: 'hat_wizard', name: '🧙 Mág', icon: '🧙', rarity: 'legendary', price: 1200, isHat: true, type: 'wizard' },
    { id: 'hat_ninja', name: '🥷 Ninja', icon: '🥷', rarity: 'legendary', price: 1500, isHat: true, type: 'ninja' },
    // EXTRÉMNÍ LEGENDÁRKA
    { id: 'ultra_rare', name: '💎 Diamant', icon: '💎', rarity: 'legendary', price: 10000, chance: 0.001 }
];

const ACHIEVEMENTS = [
    { id: 'wide', name: 'Široký', desc: 'Získej 5x upgrade na šířku zdi v jedné hře', icon: '📏' },
    { id: 'cheapskate', name: 'Skrblík', desc: 'Získej celkem 5000 Dogecoinů', icon: '💰' },
    { id: 'boss_slayer', name: 'Lovec Bossů', desc: 'Poraz celkem 10 bossů', icon: '💀' },
    { id: 'veteran', name: 'Vesmírný Veterán', desc: 'Dosáhni levelu 50 v jedné hře', icon: '🎖️' },
    { id: 'collector', name: 'Sběratel', desc: 'Odemkni všechny 3 základní lodě', icon: '🚀' },
    { id: 'gambling', name: "Let's go gambling", desc: 'Zmáčkni 100x tlačítko pro náhodný výběr', icon: '🎰' },
    { id: 'cookie', name: 'Cookie clicker', desc: 'Odehraj celkem 24 hodin', icon: '🍪' },
    { id: 'millionaire', name: 'Milionář', desc: 'Získej celkem 100 000 Dogecoinů', icon: '💎' },
    { id: 'crate_opener', name: 'Zasloužilý Otevírač', desc: 'Otevři celkem 50 beden', icon: '📦' }
];

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
        if (!META.abilities) META.abilities = { 1: true, 2: false, 3: false };
        if (!META.selectedAbility) META.selectedAbility = 1;
        if (!META.upgrades.regen) META.upgrades.regen = 0;
        if (!META.upgrades.armor) META.upgrades.armor = 0;
        if (!META.lastDailyGift) META.lastDailyGift = 0;
        if (!META.dailyStreak) META.dailyStreak = 0;
        if (!META.playerName) META.playerName = null;
        if (!META.maxLevel) META.maxLevel = 1;
        if (!META.inventory) META.inventory = [];
        if (!META.achievements) META.achievements = {};
        if (!META.stats) META.stats = { totalBossKills: 0, totalDogecoins: 0, totalGames: 0, totalRandomPicks: 0, totalPlayTime: 0 };
        if (!META.settings) META.settings = { musicMenu: true, musicGame: true, sfx: true };
        if (META.upgrades && META.upgrades.hat === undefined) META.upgrades.hat = null;
    }
};

const GAME = {
    active: false,
    paused: false,
    score: 0,
    kills: 0,
    time: 0,
    startTime: 0,
    coinsCollected: 0,
    lastBossTime: 0,
    lastSpawnTime: 0,
    frozenUntil: 0,
    speedFactor: 1.0,
    zoom: 1.0,
    upgradeOptionsCount: 3,
    loopStarted: false,
    chatActive: false,
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
            this.loadAllBuffers();
        } catch (e) { console.error("Audio init failed", e); }
    },
    async loadAllBuffers() {
        for (const [name, url] of Object.entries(SOUND_URLS)) {
            try {
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
                SOUND_BUFFERS[name] = audioBuffer;
            } catch (e) {
                console.warn("Failed to load sound buffer:", name, e);
            }
        }
    },
    playBuffer(name) {
        if (!this.ctx || !SOUND_BUFFERS[name]) {
            // Fallback to procedural sounds if buffer not found
            this.play(name);
            return;
        }
        const source = this.ctx.createBufferSource();
        source.buffer = SOUND_BUFFERS[name];
        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(1.0, this.ctx.currentTime);
        source.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        source.start(0);
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
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(); osc.stop(now + 0.1); break;
            case 'hit':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(100, now);
                osc.frequency.linearRampToValueAtTime(50, now + 0.1);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(); osc.stop(now + 0.1); break;
            case 'lvlup':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(220, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.5);
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
                osc.start(); osc.stop(now + 0.5); break;
            case 'gem':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(660, now);
                osc.frequency.exponentialRampToValueAtTime(1320, now + 0.05);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(); osc.stop(now + 0.1); break;
            case 'crateSpin':
                osc.type = 'square';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(400, now + 0.03);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
                osc.start(); osc.stop(now + 0.03); break;
            case 'crateWin':
                // Arpeggio
                [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
                    const o = this.ctx.createOscillator();
                    const g = this.ctx.createGain();
                    o.type = 'triangle';
                    o.frequency.setValueAtTime(f, now + i * 0.1);
                    g.gain.setValueAtTime(0.15, now + i * 0.1);
                    g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
                    o.connect(g); g.connect(this.ctx.destination);
                    o.start(now + i * 0.1); o.stop(now + i * 0.1 + 0.3);
                });
                break;
            case 'coin':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(987.77, now);
                osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.1);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
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
        this.life = 1.2;
        this.vy = -1.8;
    }
    update() {
        this.y += this.vy;
        this.life -= 0.012;
    }
    draw(ctx, cam) {
        ctx.globalAlpha = Math.max(0, Math.min(1, this.life));
        ctx.fillStyle = this.color;
        ctx.font = 'bold 22px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.text, this.x - cam.x, this.y - cam.y);
        ctx.globalAlpha = 1.0;
    }
}

class MenuAnimation {
    constructor() {
        this.canvas = document.getElementById('menu-anim-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.stars = [];
        this.ufos = [];
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.initEntities();
        this.animate();
    }
    resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    initEntities() {
        for (let i = 0; i < 100; i++) {
            this.stars.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 2,
                speed: 0.1 + Math.random() * 0.3
            });
        }
        for (let i = 0; i < 4; i++) {
            this.spawnUFO();
        }
    }
    spawnUFO() {
        const side = Math.random() > 0.5 ? -100 : this.canvas.width + 100;
        this.ufos.push({
            x: side,
            y: Math.random() * this.canvas.height,
            vx: (side < 0 ? 1 : -1) * (0.5 + Math.random() * 1.5),
            vy: (Math.random() - 0.5) * 0.5,
            size: 20 + Math.random() * 30,
            color: `hsl(${Math.random() * 360}, 80%, 60%)`,
            rotation: 0,
            rotSpeed: (Math.random() - 0.5) * 0.02
        });
    }
    animate() {
        if (!this.canvas) return;
        const menu = document.getElementById('menu-modal');
        if (menu && !menu.classList.contains('active')) {
            requestAnimationFrame(() => this.animate());
            return;
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Stars
        this.ctx.fillStyle = 'rgba(255,255,255,0.6)';
        this.stars.forEach(s => {
            s.x -= s.speed;
            if (s.x < 0) s.x = this.canvas.width;
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // UFOs
        this.ufos.forEach((u, i) => {
            u.x += u.vx;
            u.y += u.vy;
            u.rotation += u.rotSpeed;

            if (u.x < -200 || u.x > this.canvas.width + 200) {
                this.ufos.splice(i, 1);
                this.spawnUFO();
            }

            this.ctx.save();
            this.ctx.translate(u.x, u.y);
            this.ctx.rotate(Math.sin(Date.now() / 1000) * 0.1 + u.rotation);

            // Draw UFO body
            this.ctx.shadowBlur = 25;
            this.ctx.shadowColor = u.color;
            this.ctx.fillStyle = u.color;
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, u.size, u.size * 0.35, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // Dome
            this.ctx.fillStyle = 'rgba(255,255,255,0.4)';
            this.ctx.beginPath();
            this.ctx.arc(0, -u.size * 0.1, u.size * 0.45, Math.PI, 0);
            this.ctx.fill();

            // Lights
            this.ctx.fillStyle = '#fff';
            for (let j = 0; j < 3; j++) {
                const lx = -u.size * 0.5 + (j * u.size * 0.5);
                this.ctx.beginPath();
                this.ctx.arc(lx, u.size * 0.1, 2, 0, Math.PI * 2);
                this.ctx.fill();
            }

            this.ctx.restore();
            this.ctx.shadowBlur = 0;
        });

        requestAnimationFrame(() => this.animate());
    }
}

class Fire {
    constructor(x, y, damage, isLocal = true, type = 'fire') {
        this.x = x; this.y = y; this.damage = damage;
        this.radius = type === 'neon' ? 12 : 25; 
        this.life = type === 'neon' ? 0.8 : 1.5;
        this.isLocal = isLocal;
        this.type = type;
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
        ctx.globalAlpha = Math.max(0, this.life / (this.type === 'neon' ? 0.8 : 1.5));
        if (this.type === 'neon') {
            ctx.shadowBlur = 15; ctx.shadowColor = '#00f2ff';
            ctx.fillStyle = '#00f2ff';
            ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        } else {
            ctx.shadowBlur = 10; ctx.shadowColor = '#f59e0b';
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI * 2); ctx.fill();
        }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;
    }
}

class FriendlyMinion {
    constructor(x, y, damage, owner) {
        this.x = x; this.y = y; this.damage = damage; this.owner = owner;
        this.radius = 12; this.hp = 30; this.maxHp = 30; this.life = 10; // Sekundy
        this.id = Math.random().toString(36).substr(2, 9);
        this.speed = 1.75;
    }
    update() {
        this.life -= 1 / 60;
        if (this.life <= 0) this.hp = 0;

        const enemies = GAME.entities.enemies;
        if (enemies && enemies.length > 0) {
            let target = null;
            let minDist = Infinity;
            for (let i = 0; i < enemies.length; i++) {
                const e = enemies[i];
                if (!e || e.hp <= 0) continue;
                const d = dist(this.x, this.y, e.x, e.y);
                if (d < minDist) {
                    minDist = d;
                    target = e;
                }
            }

            if (target) {
                const angle = Math.atan2(target.y - this.y, target.x - this.x);
                this.x += Math.cos(angle) * this.speed * GAME.speedFactor;
                this.y += Math.sin(angle) * this.speed * GAME.speedFactor;

                if (minDist < this.radius + target.radius) {
                    target.hp -= this.damage * GAME.speedFactor;
                    if (target.hp <= 0) handleEnemyDeath(target);
                    this.hp -= 2 * GAME.speedFactor;
                    if (NET.isMultiplayer) NET.socket.emit('enemyHit', { id: target.id, damage: this.damage });
                }
            }
        }
    }
    draw(ctx, cam) {
        ctx.shadowBlur = 15; ctx.shadowColor = '#6366f1'; ctx.fillStyle = '#818cf8';
        ctx.beginPath();
        ctx.moveTo(this.x - cam.x, this.y - cam.y - 12);
        ctx.lineTo(this.x - cam.x + 10, this.y - cam.y + 8);
        ctx.lineTo(this.x - cam.x - 10, this.y - cam.y + 8);
        ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
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
        this.speed = speed;
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
        if (this.isNuke) {
            ctx.shadowBlur = 20; ctx.shadowColor = '#ef4444'; ctx.fillStyle = '#ef4444';
        } else if (this.isMagnet) {
            ctx.shadowBlur = 20; ctx.shadowColor = '#3b82f6'; ctx.fillStyle = '#3b82f6';
        } else {
            ctx.shadowBlur = 15; ctx.shadowColor = '#10b981'; ctx.fillStyle = '#34d399';
        }
        ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius + (this.isNuke || this.isMagnet ? 2 : 0), 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
    }
}

class Tombstone {
    constructor(x, y, id, playerId, progress) {
        this.x = x; this.y = y; this.id = id; this.playerId = playerId; this.progress = progress || 0;
    }
    draw(ctx, cam) {
        ctx.fillStyle = '#475569';
        ctx.fillRect(this.x - cam.x - 15, this.y - cam.y - 20, 30, 40);
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y - 20, 15, Math.PI, 0); ctx.fill();

        // Progress bar
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(this.x - cam.x - 20, this.y - cam.y + 25, 40, 6);
        ctx.fillStyle = '#10b981';
        ctx.fillRect(this.x - cam.x - 20, this.y - cam.y + 25, 40 * (this.progress / 100), 6);
    }
}

class Obstacle {
    constructor(x, y, radius) {
        this.x = x; this.y = y; this.radius = radius;
    }
    draw(ctx, cam) {
        ctx.fillStyle = '#334155';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const r = this.radius * (0.8 + Math.sin(this.x * this.y + i) * 0.2);
            if (i === 0) ctx.moveTo(this.x - cam.x + Math.cos(a) * r, this.y - cam.y + Math.sin(a) * r);
            else ctx.lineTo(this.x - cam.x + Math.cos(a) * r, this.y - cam.y + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill(); ctx.stroke();
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
    if (GAME.entities.baits) {
        GAME.entities.baits.forEach(b => b.update());
    }

    if (GAME.entities.minions) {
        for (let i = GAME.entities.minions.length - 1; i >= 0; i--) {
            const m = GAME.entities.minions[i];
            m.update();
            if (m.hp <= 0) GAME.entities.minions.splice(i, 1);
        }
    }

    if (GAME.entities && GAME.entities.baits) {
        GAME.entities.baits.forEach(b => {
            if (b && b.hp > 0) list.push({ x: b.x, y: b.y, radius: b.radius, isBait: true, obj: b });
        });
    }
    if (!NET.isMultiplayer && GAME.entities.enemies) {
        GAME.entities.enemies.filter(e => e.possessed).forEach(e => {
            if (e.hp > 0) list.push({ x: e.x, y: e.y, radius: e.radius, isBait: false, possessed: true, obj: e });
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

class Meteorite {
    constructor(x, y, hp = 500) {
        this.x = x; this.y = y; this.radius = 35 + Math.random() * 25;
        this.id = Math.random().toString(36).substr(2, 9);
        this.maxHp = hp * (1 + (this.radius - 35) / 10);
        this.hp = this.maxHp;
        this.isMeteorite = true;
        this.angle = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 0.02;
    }
    update() {
        this.angle += this.rotSpeed;
    }
    draw(ctx, cam) {
        ctx.save();
        ctx.translate(this.x - cam.x, this.y - cam.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = '#475569';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        const sides = 8;
        for (let i = 0; i < sides; i++) {
            const a = (i / sides) * Math.PI * 2;
            const r = this.radius * (0.9 + Math.random() * 0.1);
            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Detaily na meteoritu
        ctx.fillStyle = '#334155';
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(Math.cos(i) * this.radius * 0.5, Math.sin(i) * this.radius * 0.5, this.radius * 0.2, 0, Math.PI * 2);
            ctx.fill();
        }

        const ratio = this.hp / this.maxHp;
        if (ratio < 1) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(-20, this.radius + 5, 40, 6);
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(-20, this.radius + 5, 40 * ratio, 6);
        }
        ctx.restore();
    }
}


class Boss {
    constructor(x, y, level = 1, id = Math.random().toString(36).substr(2, 9), type = null) {
        this.x = x; this.y = y; this.radius = 50; this.id = id;
        this.type = type || Math.floor(Math.random() * 5) + 1; // 1-5 varianty
        this.maxHp = CONFIG.ENEMY_BASE_HEALTH * 30 * level; this.hp = this.maxHp;
        this.speed = CONFIG.ENEMY_BASE_SPEED * 0.7; this.isBoss = true;
        this.knockback = { x: 0, y: 0 };
        this.lastAction = Date.now();
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
        const target = targets.sort((a, b) => dist(this.x, this.y, a.x, a.y) - dist(this.x, this.y, b.x, b.y))[0];
        const angle = Math.atan2(target.y - this.y, target.x - this.x);

        let speedScale = 1.0;
        const players = getAllAlivePlayers();
        players.forEach(p => { if (p.aura && dist(this.x, this.y, p.x, p.y) < (p.auraRange || 150)) speedScale *= 0.5; });

        this.x += Math.cos(angle) * this.speed * speedScale * GAME.speedFactor + this.knockback.x;
        this.y += Math.sin(angle) * this.speed * speedScale * GAME.speedFactor + this.knockback.y;
        this.knockback.x *= 0.9; this.knockback.y *= 0.9;

        // Boss útoky podle typu a obtížnosti
        const attackInterval = Math.max(1000, 4000 - (GAME.time / 60) * 200);
        if (Date.now() - this.lastAction > attackInterval) {
            if (this.type === 1) { // Crusher Boss - rychlý nájezd
                this.speed *= 3;
                setTimeout(() => this.speed = CONFIG.ENEMY_BASE_SPEED * 0.7, 1000);
            } else if (this.type === 2) { // Hunter Boss - dávka střel
                for (let i = 0; i < 12; i++) {
                    const a = angle - 0.8 + i * 0.15;
                    GAME.entities.projectiles.push(new Projectile(this.x, this.y, this.x + Math.cos(a) * 100, this.y + Math.sin(a) * 100, 15 + (GAME.time / 60) * 2, { isEnemy: true, color: '#f43f5e', speed: 9 }));
                }
            } else if (this.type === 3) { // Spawner Boss - vlna minionů
                for (let i = 0; i < 5; i++) {
                    GAME.entities.enemies.push(new Enemy(this.x + Math.random() * 40 - 20, this.y + Math.random() * 40 - 20, 1 + Math.floor(GAME.time / 120), Math.random().toString(36).substr(2, 9), Math.floor(Math.random() * 3) + 1));
                }
            } else if (this.type === 4) { // Pulse Boss - kruhová vlna
                for (let i = 0; i < 24; i++) {
                    const a = (i / 24) * Math.PI * 2;
                    GAME.entities.projectiles.push(new Projectile(this.x, this.y, this.x + Math.cos(a) * 100, this.y + Math.sin(a) * 100, 20, { isEnemy: true, color: '#fbbf24', speed: 6, size: 12 }));
                }
            } else if (this.type === 5) { // Sniper Boss - přesná střela
                GAME.entities.projectiles.push(new Projectile(this.x, this.y, target.x, target.y, 40, { isEnemy: true, color: '#0ea5e9', speed: 15, size: 15 }));
            }
            this.lastAction = Date.now();
        }
    }

    draw(ctx, cam) {
        const ratio = this.hp / this.maxHp;
        const colors = { 1: '#ef4444', 2: '#f43f5e', 3: '#f97316', 4: '#eab308', 5: '#0ea5e9' };
        const color = colors[this.type] || '#ef4444';

        ctx.shadowBlur = 50; ctx.shadowColor = color; ctx.fillStyle = color;
        ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y);
        ctx.rotate(Date.now() / 1000);
        ctx.beginPath();
        const sides = 5 + this.type;
        for (let i = 0; i < sides; i++) {
            const a = (i / sides) * Math.PI * 2;
            const r = this.radius * (0.8 + Math.sin(Date.now() / 500 + i) * 0.2);
            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill();

        // HP Bar
        ctx.restore();
        const barW = 120; const barH = 12;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(this.x - cam.x - barW / 2, this.y - cam.y - this.radius - 40, barW, barH);
        ctx.fillStyle = color;
        ctx.fillRect(this.x - cam.x - barW / 2, this.y - cam.y - this.radius - 40, barW * ratio, barH);
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
        this.possessed = false;

        // Safety init
        if (this.type === 6) {
            this.jumpState = 'WALKING';
            this.jumpProgress = 0;
            this.jumpStart = { x: x, y: y };
            this.jumpTarget = { x: x, y: y };
            this.prepTime = 0;
        }
    }
    update() {
        if (NET.isMultiplayer) {
            if (this.targetX !== undefined && this.targetY !== undefined) {
                this.x += (this.targetX - this.x) * 0.3;
                this.y += (this.targetY - this.y) * 0.3;
            }
            return;
        }

        if (this.possessed) {
            const normalEnemies = GAME.entities.enemies.filter(e => !e.possessed && e.id !== this.id);
            if (normalEnemies.length > 0) {
                const target = normalEnemies.sort((a, b) => dist(this.x, this.y, a.x, a.y) - dist(this.x, this.y, b.x, b.y))[0];
                const angle = Math.atan2(target.y - this.y, target.x - this.x);
                const posSpeed = this.speed * 1.5;
                this.x += Math.cos(angle) * posSpeed;
                this.y += Math.sin(angle) * posSpeed;

                if (dist(this.x, this.y, target.x, target.y) < 30) {
                    target.hp -= 50;
                    this.hp -= 20;
                    if (target.hp <= 0) {
                        GAME.entities.enemies = GAME.entities.enemies.filter(e => e.id !== target.id);
                        GAME.entities.gems.push(new Gem(target.x, target.y));
                    }
                }
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
        if (this.type === 6) { // SKOKAN (Leaper)
            if (!this.jumpState) this.jumpState = 'WALKING';

            if (this.jumpState === 'WALKING') {
                if (dist(this.x, this.y, target.x, target.y) < 250) {
                    this.jumpState = 'PREPARING';
                    this.prepTime = Date.now() + 1000;
                    this.jumpTarget = { x: target.x, y: target.y };
                }
            } else if (this.jumpState === 'PREPARING') {
                if (Date.now() > this.prepTime) {
                    this.jumpState = 'JUMPING';
                    this.jumpStart = { x: this.x, y: this.y };
                    this.jumpProgress = 0;
                }
                return; // Stojí a míří
            } else if (this.jumpState === 'JUMPING') {
                this.jumpProgress += 0.04 * GAME.speedFactor;
                this.x = this.jumpStart.x + (this.jumpTarget.x - this.jumpStart.x) * this.jumpProgress;
                this.y = this.jumpStart.y + (this.jumpTarget.y - this.jumpStart.y) * this.jumpProgress;

                if (this.jumpProgress >= 1) {
                    this.jumpState = 'WALKING';
                    // Po dopadu může udělat malé poškození v okolí
                    const players = getAllAlivePlayers();
                    players.forEach(p => { if (dist(this.x, this.y, p.x, p.y) < 50) p.hp -= 15; });
                }
                return;
            }
        }

        const currentSpeed = this.speed * speedScale * GAME.speedFactor;
        this.x += Math.cos(angle) * currentSpeed + this.knockback.x;
        this.y += Math.sin(angle) * currentSpeed + this.knockback.y;
        this.knockback.x *= 0.8; this.knockback.y *= 0.8;

        if (this.type === 2) {
            let playerLvl = GAME.entities.player ? GAME.entities.player.level : 1;
            let dynamicInterval = Math.max(1500, 5000 - (playerLvl * 150));

            if (Date.now() - this.lastShot > dynamicInterval) {
                let inaccuracy = Math.max(0, 0.6 - (playerLvl * 0.03));
                let baseAngle = Math.atan2(target.y - this.y, target.x - this.x);
                let shootAngle = baseAngle + (Math.random() - 0.5) * inaccuracy;

                let tx = this.x + Math.cos(shootAngle) * 100;
                let ty = this.y + Math.sin(shootAngle) * 100;

                const pSpeed = CONFIG.ENEMY_BASE_SPEED * 1.2;
                if (GAME.entities.projectiles) GAME.entities.projectiles.push(new Projectile(this.x, this.y, tx, ty, 10, {
                    isEnemy: true,
                    color: '#ff00ff',
                    speed: pSpeed,
                    size: 8
                }));
                this.lastShot = Date.now();
            }
        }

        if (this.type === 4 && target.id && GAME.entities.gems && GAME.entities.gems.find(g => g.id === target.id)) {
            if (dist(this.x, this.y, target.x, target.y) < 30) {
                GAME.entities.gems = GAME.entities.gems.filter(g => g.id !== target.id);
                this.stolenGems = (this.stolenGems || 0) + 1;
            }
        }

        const now = Date.now();
        if (this.type === 3 && !this.exploding) {
            if (dist(this.x, this.y, target.x, target.y) < 140 && !target.isBait && target.hp !== undefined) {
                this.exploding = true;
                this.explodeTime = now + 1200;
            }
        }


        if (this.type === 3 && this.exploding && now > this.explodeTime) {
            this.hp = 0;
            players.forEach(p => { if (dist(p.x, p.y, this.x, this.y) < 150) p.hp -= 40; });
            if (GAME.entities.enemies) {
                GAME.entities.enemies.forEach(e => { if (e.id !== this.id && dist(e.x, e.y, this.x, this.y) < 150) e.hp -= 150; });
            }
            if (GAME.entities.fire) {
                for (let j = 0; j < 15; j++) {
                    const a = Math.random() * Math.PI * 2;
                    const d = Math.random() * 150;
                    GAME.entities.fire.push(new Fire(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d, 0, false));
                }
            }
            shakeScreen(15); AudioEngine.play('hit');
        }

        if (this.type === 5) {
            if (GAME.entities.enemies) {
                GAME.entities.enemies.forEach(e => {
                    if (e.id !== this.id && !e.possessed && dist(e.x, e.y, this.x, this.y) < 250) {
                        e.hp = Math.min(e.maxHp, e.hp + 0.5);
                    }
                });
            }
        }

        // --- NOVÉ TYPY NEPŘÁTEL ---
        if (this.type === 7 && !this.dead) { // RYCHLÝ SEBEVRAH
            this.speed = (CONFIG.ENEMY_BASE_SPEED + 2.5) * GAME.speedFactor;
            if (dist(this.x, this.y, target.x, target.y) < 55) {
                this.hp = 0; this.dead = true;
                if (target.hp !== undefined) target.hp -= 35;
                shakeScreen(10); AudioEngine.play('hit');
            }
        }

        if (this.type === 8) { // ŠTÍTONOŠ (Shield Bearer)
            this.speed = (CONFIG.ENEMY_BASE_SPEED * 0.7) * GAME.speedFactor;
        }
    }
    draw(ctx, cam) {
        const ratio = this.hp / this.maxHp;
        if (this.type === 1) {
            const color = this.possessed ? '#22c55e' : `rgb(255, ${Math.floor(255 * (1 - ratio))}, 80)`;
            ctx.shadowBlur = 15; ctx.shadowColor = color; ctx.fillStyle = color;
            const players = getAllAlivePlayers();
            const target = players.length > 0 ? players.sort((a, b) => dist(this.x, this.y, a.x, a.y) - dist(this.x, this.y, b.x, b.y))[0] : { x: 0, y: 0 };
            const angle = Math.atan2(target.y - this.y, target.x - this.x);
            ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y); ctx.rotate(angle);
            ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-12, 12); ctx.lineTo(-12, -12); ctx.closePath(); ctx.fill();
            if (this.possessed) {
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
            }
            ctx.restore(); ctx.shadowBlur = 0;
        } else if (this.type === 2) {
            const r = Math.floor(168 * ratio + 34 * (1 - ratio));
            const g = Math.floor(85 * ratio + 197 * (1 - ratio));
            const b = Math.floor(247 * ratio + 94 * (1 - ratio));
            const color = this.possessed ? '#22c55e' : `rgb(${r}, ${g}, ${b})`;

            ctx.shadowBlur = 20; ctx.shadowColor = color; ctx.fillStyle = color;
            ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y);
            ctx.rotate(Date.now() / 1000);
            ctx.fillRect(-15, -15, 30, 30);
            if (this.possessed) {
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(-15, -15, 30, 30);
            }
            ctx.restore(); ctx.shadowBlur = 0;
        } else if (this.type === 3) {
            // Kamikadze (kosočtverec)
            const flash = Math.sin(Date.now() / 100) > 0 ? '#ef4444' : '#f97316';
            const color = this.possessed ? '#22c55e' : flash;
            ctx.shadowBlur = 25; ctx.shadowColor = color; ctx.fillStyle = color;
            ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y);
            ctx.rotate(Date.now() / 200);
            ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(15, 0); ctx.lineTo(0, 20); ctx.lineTo(-15, 0); ctx.closePath(); ctx.fill();
            if (this.possessed) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
            ctx.restore(); ctx.shadowBlur = 0;
        } else if (this.type === 6) {
            // Leaper (trojúhelník s "nohama" nebo barvou)
            const color = this.possessed ? '#22c55e' : '#f43f5e';
            ctx.shadowBlur = 15; ctx.shadowColor = color; ctx.fillStyle = color;
            ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y);

            if (this.jumpState === 'PREPARING') {
                const s = 1 + Math.sin(Date.now() / 50) * 0.2;
                ctx.scale(s, s);
                ctx.fillStyle = '#fff';
            }

            ctx.beginPath();
            ctx.moveTo(0, -20); ctx.lineTo(15, 10); ctx.lineTo(-15, 10); ctx.closePath(); ctx.fill();
            if (this.possessed) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
            ctx.restore(); ctx.shadowBlur = 0;

            if (this.jumpState === 'PREPARING' && this.jumpTarget) {
                ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(this.x - cam.x, this.y - cam.y); ctx.lineTo(this.jumpTarget.x - cam.x, this.jumpTarget.y - cam.y); ctx.stroke(); ctx.setLineDash([]);
            }
        } else if (this.type === 4) {
            // Goblin (hvězdička nebo něco rychlého)
            const color = this.possessed ? '#22c55e' : '#eab308';
            ctx.shadowBlur = 15; ctx.shadowColor = color; ctx.fillStyle = color;
            ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y);
            ctx.rotate(-Date.now() / 500);
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2;
                ctx.lineTo(Math.cos(a) * 15, Math.sin(a) * 15);
                const a2 = ((i + 0.5) / 5) * Math.PI * 2;
                ctx.lineTo(Math.cos(a2) * 7, Math.sin(a2) * 7);
            }
            ctx.closePath(); ctx.fill();
            if (this.possessed) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
            ctx.restore(); ctx.shadowBlur = 0;
        } else if (this.type === 5) {
            // Support (kříž nebo ovál s aurou)
            const color = this.possessed ? '#22c55e' : '#0ea5e9';

            // Healing Aura effect
            ctx.save();
            ctx.translate(this.x - cam.x, this.y - cam.y);
            const pulse = (Math.sin(Date.now() / 300) + 1) * 0.5;
            ctx.globalAlpha = 0.1 + pulse * 0.1;
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(0, 0, 250, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1.0;

            ctx.shadowBlur = 20; ctx.shadowColor = color; ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
            ctx.restore(); ctx.shadowBlur = 0;
        } else if (this.type === 7) {
            const color = this.possessed ? '#22c55e' : '#f87171';
            ctx.shadowBlur = 10; ctx.shadowColor = color; ctx.fillStyle = color;
            ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y);
            ctx.rotate(Date.now() / 50);
            ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, 8); ctx.lineTo(-8, -8); ctx.closePath(); ctx.fill();
            ctx.restore(); ctx.shadowBlur = 0;
        } else if (this.type === 8) {
            const color = this.possessed ? '#22c55e' : '#38bdf8';
            ctx.shadowBlur = 15; ctx.shadowColor = color; ctx.fillStyle = color;
            ctx.save(); ctx.translate(this.x - cam.x, this.y - cam.y);
            const players = getAllAlivePlayers();
            const target = players.length > 0 ? players.sort((a, b) => dist(this.x, this.y, a.x, a.y) - dist(this.x, this.y, b.x, b.y))[0] : { x: 0, y: 0 };
            const angle = Math.atan2(target.y - this.y, target.x - this.x);
            ctx.rotate(angle);
            ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(0, 0, 22, -Math.PI / 2, Math.PI / 2); ctx.stroke();
            ctx.restore(); ctx.shadowBlur = 0;
        }

        // HP Bar for all enemies when damaged
        if (this.hp < this.maxHp) {
            const barW = 30; const barH = 4;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(this.x - cam.x - barW / 2, this.y - cam.y - 35, barW, barH);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(this.x - cam.x - barW / 2, this.y - cam.y - 35, barW * (this.hp / this.maxHp), barH);
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
        this.maxPossessions = 10;
        this.wallWidthBonus = 0;
        this.wallRangeBonus = 0;
        this.laserRangeBonus = 0;
        this.lastFired = 0;
        this.lastSniperTime = 0;
        this.lastRegen = 0;
        this.lastXpGen = 0;
        this.lastFireTrail = 0;
        this.lastKaktusToggle = 0;
        this.lastBait = 0;
        this.laserTargets = [];

        this.luckFactor = 1.0 + (isLocal ? (META.upgrades.luck * 0.05) : 0);
        this.orbitals = 0; this.knockbackForce = 6; this.xpMultiplier = 1.0;
        this.lifestealChance = 0;
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

        // Meta Upgrades: Regeneration
        const regenVal = (META.upgrades.regen || 0) * 0.1;
        if (regenVal > 0 && this.hp < this.maxHp) {
            this.hp = Math.min(this.maxHp, this.hp + regenVal / 60);
        }

        // Apply armor to damage taken elsewhere in the code
        // We'll search for where hp is subtracted and apply reduction there.
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
                if (this.isLocal) updateKaktusUI(true, pct);
            } else {
                const elapsed = now - this.lastKaktusToggle;
                if (elapsed > 30000) {
                    this.kaktus = true;
                    this.lastKaktusToggle = now;
                }
                const pct = Math.min(100, (elapsed / 30000) * 100);
                if (this.isLocal) updateKaktusUI(false, pct);
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
                    const trailType = this.shipType === 2 ? 'neon' : 'fire';
                    if (GAME.entities.fire) GAME.entities.fire.push(new Fire(this.x, this.y, 0, false, trailType));
                    this.lastFireTrail = now;
                }
            }
            return;
        }

        if (this.shipType === 2) {
            const now = Date.now();
            if (now - this.lastFired > (this.fireRate / 2)) {
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

                        while (jumpsLeft > 0) {
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

                    if (this.laserTargets.length > 0) {
                        let isCrit = Math.random() < this.critChance;
                        const finalDamage = isCrit ? this.damage * this.critMultiplier : this.damage;

                        this.laserTargets.forEach(chain => {
                            chain.forEach(target => {
                                if (!target) return;
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
                                }
                            });
                        });
                        updateUI();
                        this.lastFired = now;
                    }
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
            let nextX = this.x + Math.cos(angle) * this.speed * GAME.speedFactor;
            let nextY = this.y + Math.sin(angle) * this.speed * GAME.speedFactor;

            if (GAME.entities.obstacles) {
                GAME.entities.obstacles.forEach(obs => {
                    if (dist(nextX, nextY, obs.x, obs.y) < this.radius + obs.radius) {
                        const pushAngle = Math.atan2(nextY - obs.y, nextX - obs.x);
                        nextX = obs.x + Math.cos(pushAngle) * (this.radius + obs.radius);
                        nextY = obs.y + Math.sin(pushAngle) * (this.radius + obs.radius);
                    }
                });
            }

            this.x = nextX;
            this.y = nextY;

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

        let target = null;
        let minDist = Infinity;
        
        // Prioritizace nepřátel před meteority
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (!e || e.hp <= 0) continue;
            const d = dist(this.x, this.y, e.x, e.y);
            if (d < minDist) {
                minDist = d;
                target = e;
            }
        }

        // Pokud není nepřítel, zkus meteorit
        if (!target && GAME.entities.meteorites) {
            for (let i = 0; i < GAME.entities.meteorites.length; i++) {
                const m = GAME.entities.meteorites[i];
                if (m.hp <= 0) continue;
                const d = dist(this.x, this.y, m.x, m.y);
                if (d < minDist && d < 600) { // Omezený dostřel na meteority
                    minDist = d;
                    target = m;
                }
            }
        }
        if (!target) return;

        if (this.shipType === 1) {
            for (let i = 0; i < this.projectileCount; i++) {
                const isCrit = Math.random() < this.critChance;
                const finalDamage = isCrit ? this.damage * this.critMultiplier : this.damage;

                // Rovnoměrný rozptyl pro více projektilů
                let spread = 0;
                if (this.projectileCount > 1) {
                    const totalSpread = 0.4; // 0.4 radiánu rozptyl
                    spread = -totalSpread / 2 + (totalSpread / (this.projectileCount - 1)) * i;
                }
                const baseAngle = Math.atan2(target.y - this.y, target.x - this.x);
                const shootAngle = baseAngle + spread;

                const tx = this.x + Math.cos(shootAngle) * 500;
                const ty = this.y + Math.sin(shootAngle) * 500;

                const proj = new Projectile(this.x, this.y, tx, ty, finalDamage, {
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

        if (this.shipType === 5) { // NEKROMANCER
            if (!GAME.entities.minions) GAME.entities.minions = [];
            if (GAME.entities.minions.length < 10 + this.projectileCount * 2) {
                const minion = new FriendlyMinion(this.x, this.y, this.damage * 0.5, this);
                GAME.entities.minions.push(minion);
                // V multiplayeru by to chtělo sync, ale zatím solo focus
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

        if (this.shipType === 4) { // Brokovnice
            const baseAngle = Math.atan2(target.y - this.y, target.x - this.x);
            const pellets = 4 + this.projectileCount;
            const spread = Math.PI / 6;

            for (let i = 0; i < pellets; i++) {
                const isCrit = Math.random() < this.critChance;
                const finalDamage = (isCrit ? this.damage * this.critMultiplier : this.damage) * 0.7;

                const angleOffset = -spread / 2 + (spread / (pellets - 1 || 1)) * i;
                const shootAngle = baseAngle + angleOffset;

                const tx = this.x + Math.cos(shootAngle) * 500;
                const ty = this.y + Math.sin(shootAngle) * 500;

                const proj = new Projectile(this.x, this.y, tx, ty, finalDamage, {
                    size: this.projSize * 0.8,
                    pierce: this.pierceCount,
                    bounce: this.bounces,
                    isCrit: isCrit,
                    type: 'default',
                    life: 60 + (Math.random() * 20), // Lepší dostřel
                    speed: CONFIG.PROJECTILE_SPEED * (1.1 + Math.random() * 0.3)
                });
                if (GAME.entities.projectiles) GAME.entities.projectiles.push(proj);
                if (NET.isMultiplayer) syncShot(proj);
            }
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

function spawnEnemy() {
    const alive = getAllAlivePlayers();
    if (alive.length === 0) return;
    const a = Math.random() * Math.PI * 2;
    const pivot = alive[Math.floor(Math.random() * alive.length)];
    const x = pivot.x + Math.cos(a) * CONFIG.SPAWN_RADIUS;
    const y = pivot.y + Math.sin(a) * CONFIG.SPAWN_RADIUS;
    const mod = Math.floor(GAME.time / 60) + 1;

    let enemy;
    const isBossLevel = pivot.level > 0 && pivot.level % CONFIG.BOSS_LEVEL_INTERVAL === 0;
    const bossAlreadySpawned = GAME.lastBossLevelSpawned === pivot.level;
    
    if (isBossLevel && !bossAlreadySpawned) {
        enemy = new Boss(x, y, mod);
        showBossWarning();
        GAME.lastBossLevelSpawned = pivot.level;
    } else {
        let type = 1;
        if (pivot.level >= 3 && Math.random() < 0.15) type = 2;
        if (pivot.level >= 5 && Math.random() < 0.1) type = 3;
        if (pivot.level >= 8 && Math.random() < 0.08) type = 6;
        if (pivot.level >= 10 && Math.random() < 0.12) type = 7; // Sebevrah
        if (pivot.level >= 12 && Math.random() < 0.1) type = 8; // Štítonoš
        enemy = new Enemy(x, y, mod, Math.random().toString(36).substr(2, 9), type);
    }

    if (GAME.entities.enemies) GAME.entities.enemies.push(enemy);
}

function showBossWarning() {
    const el = document.getElementById('boss-warning'); if (el) el.style.display = 'block';
    setTimeout(() => { if (el) el.style.display = 'none'; }, 3000);
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

    const ultIcon = document.getElementById('ultimate-icon');
    if (ultIcon) {
        if (META.selectedAbility === 1) ultIcon.innerText = "🎯";
        if (META.selectedAbility === 2) ultIcon.innerText = "⏳";
        if (META.selectedAbility === 3) ultIcon.innerText = "👻";
    }

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
            if (['wall_range', 'wall_width', 'laser_range', 'possession_plus'].includes(u.id)) return false;
        } else if (pShip === 2) {
            if (['wall_range', 'wall_width', 'bounce', 'possession_plus'].includes(u.id)) return false;
        } else if (pShip === 3) {
            if (['count', 'pierce', 'bounce', 'laser_range', 'possession_plus'].includes(u.id)) return false;
        } else if (pShip === 4) {
            if (['wall_range', 'wall_width', 'laser_range', 'possession_plus'].includes(u.id)) return false;
        } else if (pShip === 5) { // Nekromancer
            if (['wall_range', 'wall_width', 'laser_range', 'pierce', 'bounce', 'size'].includes(u.id)) return false;
        }


        if (u.id === 'possession_plus' && META.selectedAbility !== 3) return false;

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
            <div style="font-size: 2.5rem; margin-bottom: 5px;">${u.icon}</div>
            <h3 style="font-size: 1rem; color: white; margin-bottom: 5px;">${window.T(u.name)}</h3>
            <p style="font-size: 0.8rem; color: #cbd5e1; line-height: 1.2;">${window.T(u.desc)}</p>
        `;
        card.onclick = () => applyUpgrade(u.id);
        container.appendChild(card);
    });
    modal.classList.add('active');

    // Náhodný výběr tlačítko
    const btnRandom = document.getElementById('btn-random-upgrade');
    if (btnRandom) {
        btnRandom.onclick = () => {
            const cards = container.querySelectorAll('.upgrade-card');
            if (cards.length > 0) {
                if (!META.stats.totalRandomPicks) META.stats.totalRandomPicks = 0;
                META.stats.totalRandomPicks++;
                checkAchievements();
                
                const randomCard = cards[Math.floor(Math.random() * cards.length)];
                randomCard.click();
            }
        };
    }

    // Auto Random Select logika
    if (META.autoRandomSelect) {
        setTimeout(() => {
            if (modal.classList.contains('active')) {
                const cards = container.querySelectorAll('.upgrade-card');
                if (cards.length > 0) {
                    if (!META.stats.totalRandomPicks) META.stats.totalRandomPicks = 0;
                    META.stats.totalRandomPicks++;
                    checkAchievements();
                    
                    const randomCard = cards[Math.floor(Math.random() * cards.length)];
                    
                    // Přidat highlight efekt
                    randomCard.classList.add('selected');
                    randomCard.style.transform = 'scale(1.05)';
                    randomCard.style.zIndex = '10';

                    // Počkat a kliknout
                    setTimeout(() => {
                        if (modal.classList.contains('active')) {
                            randomCard.click();
                        }
                    }, 1000);
                }
            }
        }, 800);
    }
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
            case 'xpgen': if (!p.lastXpGen) p.xpGenInterval = 600; else p.xpGenInterval = Math.max(500, p.xpGenInterval / 2); p.lastXpGen = Date.now(); break;
            case 'ultramagnet': p.ultraMagnet = true; p.ultraMagnetPower += 1; break;
            case 'pierce': p.pierceCount += 1; break;
            case 'wall_range': p.wallRangeBonus += 0.25; break;
            case 'laser_range': p.laserRangeBonus += 150; break;
            case 'wall_width': 
                p.wallWidthBonus += 0.25; 
                GAME.wallWidthUpgrades = (GAME.wallWidthUpgrades || 0) + 1;
                checkAchievements();
                break;
            case 'size': p.projSize *= 1.3; break;
            case 'crit_chance': p.critChance += 0.15; break;
            case 'crit_dmg': p.critMultiplier += 1; break;
            case 'luck': GAME.upgradeOptionsCount += 1; break;
            case 'orbit': p.orbitals += 1; break;
            case 'knockback': p.knockbackForce *= 1.5; break;
            case 'xpboost': p.xpMultiplier += 0.2; break;
            case 'lifesteal': p.lifestealChance += 0.10; break;
            case 'aura': p.aura = true; p.auraRange += 20; p.auraPower *= 0.8; break;
            case 'bounce': p.bounces += 1; break;
            case 'fire': p.fireTrail = true; p.fireDamageMult += 0.5; break;
            case 'kaktus': p.hasKaktus = true; p.kaktus = true; p.lastKaktusToggle = Date.now(); break;
            case 'bait': p.bait = true; p.baitHpMult += 5; p.lastBait = Date.now(); break;
            case 'growth': p.maxHp += Math.floor(p.maxHp * 0.1); p.hp = p.maxHp; break;
            case 'possession_plus': p.maxPossessions += 2; break;
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

function checkAchievements() {
    if (!META.achievements) META.achievements = {};
    if (!META.stats) META.stats = { totalBossKills: 0, totalDogecoins: 0, totalGames: 0 };

    let changed = false;

    // Široký: 5x wall_width
    if (!META.achievements.wide && GAME.wallWidthUpgrades >= 5) {
        META.achievements.wide = true;
        changed = true;
        showAchievementUnlocked('Široký');
    }

    // Skrblík: 5000 Dogecoins total
    if (!META.achievements.cheapskate && (META.stats.totalDogecoins + (META.currency || 0)) >= 5000) {
        META.achievements.cheapskate = true;
        changed = true;
        showAchievementUnlocked('Skrblík');
    }

    // Lovec Bossů: 10 bossů
    if (!META.achievements.boss_slayer && META.stats.totalBossKills >= 10) {
        META.achievements.boss_slayer = true;
        changed = true;
        showAchievementUnlocked('Lovec Bossů');
    }

    // Veterán: Level 50
    if (!META.achievements.veteran && GAME.entities.player && GAME.entities.player.level >= 50) {
        META.achievements.veteran = true;
        changed = true;
        showAchievementUnlocked('Vesmírný Veterán');
    }

    // Sběratel: Odemknout všechny 3 lodě
    if (!META.achievements.collector && META.ships[1] && META.ships[2] && META.ships[3]) {
        META.achievements.collector = true;
        changed = true;
        showAchievementUnlocked('Sběratel');
    }

    // Let's go gambling: 100x random pick
    if (!META.achievements.gambling && (META.stats.totalRandomPicks || 0) >= 100) {
        META.achievements.gambling = true;
        changed = true;
        showAchievementUnlocked("Let's go gambling");
    }

    // Cookie clicker: 24h = 86400 seconds
    if (!META.achievements.cookie && (META.stats.totalPlayTime || 0) >= 86400) {
        META.achievements.cookie = true;
        changed = true;
        showAchievementUnlocked('Cookie clicker');
    }

    // Milionář: 100,000 Dogecoins
    if (!META.achievements.millionaire && (META.stats.totalDogecoins || 0) >= 100000) {
        META.achievements.millionaire = true;
        changed = true;
        showAchievementUnlocked('Milionář');
    }

    // Crate Opener: 50 crates
    if (!META.achievements.crate_opener && (META.stats.totalCratesOpened || 0) >= 50) {
        META.achievements.crate_opener = true;
        changed = true;
        showAchievementUnlocked('Zasloužilý Otevírač');
    }

    if (changed) saveMeta();
}

function showAchievementUnlocked(name) {
    if (!GAME.entities.floatingTexts) GAME.entities.floatingTexts = [];
    if (GAME.entities.player) {
        GAME.entities.floatingTexts.push(new FloatingText(GAME.entities.player.x, GAME.entities.player.y - 60, `🏆 ÚSPĚCH: ${name}`, "#fbbf24"));
    }
}

function showCurrencyNotification(amount, source = "") {
    const titles = ["PARÁDA!", "SKVĚLÉ!", "ÚSPĚCH!", "ZÍSKAL JSI!", "VÝBORNĚ!"];
    const title = titles[Math.floor(Math.random() * titles.length)];
    
    const notification = document.createElement('div');
    notification.style.position = 'fixed';
    notification.style.top = '20%';
    notification.style.left = '50%';
    notification.style.transform = 'translate(-50%, -50%)';
    notification.style.zIndex = '3000000';
    notification.style.textAlign = 'center';
    notification.style.pointerEvents = 'none';
    notification.style.animation = 'achievementPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
    
    notification.innerHTML = `
        <div style="background: rgba(15, 23, 42, 0.9); border: 2px solid #fbbf24; padding: 20px 40px; border-radius: 20px; box-shadow: 0 0 50px rgba(251, 191, 36, 0.4); backdrop-filter: blur(10px);">
            <div style="color: #fbbf24; font-weight: 900; font-size: 1.5rem; letter-spacing: 2px; margin-bottom: 5px;">${title}</div>
            <div style="color: #fff; font-size: 2rem; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 10px;">
                <span style="font-size: 1.5rem;">🪙</span> +${amount} DOGE
            </div>
            ${source ? `<div style="color: #94a3b8; font-size: 0.8rem; margin-top: 5px; text-transform: uppercase;">${source}</div>` : ''}
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.transition = 'all 0.5s ease-in';
        notification.style.opacity = '0';
        notification.style.transform = 'translate(-50%, -100px)';
        setTimeout(() => notification.remove(), 500);
    }, 2500);
}

function showAchievementsMenu() {
    console.log("Opening Achievements Menu...");
    const container = document.getElementById('achievements-list');
    if (!container) return;
    container.innerHTML = '';

    ACHIEVEMENTS.forEach(ach => {
        const isUnlocked = META.achievements && META.achievements[ach.id];
        const item = document.createElement('div');
        item.style.background = 'rgba(255,255,255,0.05)';
        item.style.padding = '15px';
        item.style.borderRadius = '12px';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '15px';
        item.style.border = isUnlocked ? '1px solid rgba(251, 191, 36, 0.4)' : '1px solid rgba(255,255,255,0.1)';

        item.innerHTML = `
            <div style="font-size: 2rem; opacity: ${isUnlocked ? 1 : 0.3};">${ach.icon}</div>
            <div style="flex: 1;">
                <h3 style="margin: 0; color: ${isUnlocked ? '#fbbf24' : '#94a3b8'}; font-size: 1.1rem;">${ach.name}</h3>
                <p style="margin: 5px 0 0 0; color: #64748b; font-size: 0.85rem;">${ach.desc}</p>
            </div>
            <div style="font-size: 1.5rem; color: #fbbf24;">${isUnlocked ? '⭐' : '🌑'}</div>
        `;
        container.appendChild(item);
    });

    document.getElementById('achievements-modal').classList.add('active');
}


function gameOver() {
    GAME.active = false;
    const killsIncome = Math.floor(GAME.kills / 10);
    META.currency += killsIncome;
    META.currency += (GAME.coinsCollected || 0);
    
    const totalGained = killsIncome + (GAME.coinsCollected || 0);
    if (totalGained > 0) {
        showCurrencyNotification(totalGained, "VÝNOS Z BITVY");
    }
    
    if (!META.stats) META.stats = { totalBossKills: 0, totalDogecoins: 0, totalGames: 0, totalRandomPicks: 0, totalPlayTime: 0 };
    META.stats.totalDogecoins += killsIncome + (GAME.coinsCollected || 0);
    META.stats.totalGames++;
    META.stats.totalPlayTime = (META.stats.totalPlayTime || 0) + GAME.time;
    
    checkAchievements();
    saveMeta();

    const statsLevel = document.getElementById('final-level');
    const statsKills = document.getElementById('final-kills');
    const statsCoins = document.getElementById('stats-coins');
    const statsTime = document.getElementById('stats-time');

    if (statsLevel) statsLevel.innerText = GAME.entities.player.level;
    if (statsKills) statsKills.innerText = GAME.kills;
    if (statsCoins) statsCoins.innerText = (GAME.coinsCollected || 0) + killsIncome;
    
    const playTime = Math.floor((Date.now() - (GAME.startTime || Date.now())) / 1000);
    const mins = Math.floor(playTime / 60);
    const secs = playTime % 60;
    if (statsTime) statsTime.innerText = `${mins}m ${secs}s`;

    document.getElementById('gameover-modal').classList.add('active');
}

function togglePause(isAFK = false) {
    if (!GAME.active) return;

    GAME.paused = !GAME.paused;

    const pauseTitle = document.querySelector('#pause-modal h1');
    if (pauseTitle) pauseTitle.innerText = isAFK ? "AFK" : "PAUZA";

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
        
        const checkAuto = document.getElementById('check-auto-random');
        if (checkAuto) checkAuto.checked = META.autoRandomSelect || false;
    }

    document.getElementById('pause-modal').classList.toggle('active', GAME.paused);

    // Reset AFK časovače a spawnování při odpauzování
    if (!GAME.paused) {
        META.lastMoveTime = Date.now();
        GAME.lastSpawnTime = Date.now(); // Prevence armády nepřátel po pauze
        META.isAFK = false;
    }
}

function tryFullscreen() {
    const isFS = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullscreenElement || document.msFullscreenElement;
    if (isFS) return;

    try {
        const el = document.documentElement;
        const rfs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
        if (rfs) rfs.call(el).catch(e => {
            // Pouze tiché selhání, pokud prohlížeč vyžaduje silnější gesto
        });
    } catch (err) {
        console.warn("Fullscreen attempt failed:", err);
    }
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

function showShipsMenu() {
    playSound('menuOpen');
    switchMusic('upgrades');
    const modal = document.getElementById('ships-modal');
    if (modal) modal.classList.add('active');
    
    const container = document.getElementById('ships-options');
    if (!container) return;

    document.getElementById('ships-currency').innerText = META.currency;
    container.innerHTML = `
        <h3 style="width:100%; text-align:left; color:#a5b4fc; margin-bottom:10px;">${window.T('LODĚ')}</h3>
        <div id="ships-grid" class="upgrade-grid"></div>
        <h3 style="width:100%; text-align:left; color:#a5b4fc; margin-top:20px; margin-bottom:10px;">${window.T('SCHOPNOSTI (Místo Sniperu)')}</h3>
        <div id="abilities-grid" class="upgrade-grid"></div>
    `;

    const shipsGrid = document.getElementById('ships-grid');
    const ships = [
        { id: 1, name: 'Základní Loď', desc: 'Spolehlivý standardní model', cost: 0, icon: '🚀' },
        { id: 2, name: 'Laserová Loď', desc: 'Automatický paprsek, nestřílí', cost: 500, icon: '🩸' },
        { id: 3, name: 'Drtivá Zeď', desc: 'Průrazná vlna bez základní palby.', cost: 1000, icon: '🌊' },
        { id: 4, name: 'Brokovnice', desc: 'Střílí 3-5 střel najednou.', cost: 1500, icon: '💥' },
        { id: 5, name: 'Nekromancer', desc: 'Místo útoku vyvolává vlastní armádu minionů.', cost: 2000, icon: '💀' }
    ];

    ships.forEach(item => {
        const card = document.createElement('div');
        const owned = META.ships[item.id];
        const selected = META.selectedShip === item.id;

        card.className = 'upgrade-card' + (selected ? ' selected' : '');
        card.innerHTML = `
            <div class="upgrade-icon">${item.icon}</div>
            <h3>${window.T(item.name)}</h3>
            <p>${window.T(item.desc)}</p>
            <span class="cost" style="margin-top:10px; display:inline-block">${selected ? window.T('VYBRÁNO') : (owned ? window.T('VLASTNĚNO (Klikni)') : item.cost + ' DOGE')}</span>
        `;
        card.onclick = () => {
            if (owned) {
                META.selectedShip = item.id;
                saveMeta();
                showShipsMenu();
            } else if (META.currency >= item.cost) {
                META.currency -= item.cost;
                META.ships[item.id] = true;
                META.selectedShip = item.id;
                saveMeta();
                showShipsMenu();
            } else {
                window.showCustomAlert(window.T("Nemáš dost Dogecoinu!"));
            }
        };
        shipsGrid.appendChild(card);
    });

    const abilitiesGrid = document.getElementById('abilities-grid');
    const abilities = [
        { id: 1, name: 'Odstřelovač', desc: 'Základní průrazná střela', cost: 0, icon: '🎯' },
        { id: 2, name: 'Zastavení času', desc: 'Znehybní všechny nepřátele na 5s', cost: 800, icon: '⏳' },
        { id: 3, name: 'Posednutí', desc: '10 nejbližších ufounů přejde na tvou stranu', cost: 1200, icon: '👻' },
        { id: 4, name: 'Léčivá aura', desc: 'Léčíš spoluhráče ve své blízkosti', cost: 1500, icon: '⚕️' }
    ];

    abilities.forEach(item => {
        const card = document.createElement('div');
        const owned = META.abilities[item.id];
        const selected = META.selectedAbility === item.id;

        card.className = 'upgrade-card' + (selected ? ' selected' : '');
        card.innerHTML = `
            <div class="upgrade-icon">${item.icon}</div>
            <h3>${window.T(item.name)}</h3>
            <p>${window.T(item.desc)}</p>
            <span class="cost" style="margin-top:10px; display:inline-block">${selected ? window.T('VYBRÁNO') : (owned ? window.T('VLASTNĚNO (Klikni)') : item.cost + ' DOGE')}</span>
        `;
        card.onclick = () => {
            if (owned) {
                META.selectedAbility = item.id;
                saveMeta();
                showShipsMenu();
            } else if (META.currency >= item.cost) {
                META.currency -= item.cost;
                META.abilities[item.id] = true;
                META.selectedAbility = item.id;
                saveMeta();
                showShipsMenu();
            } else {
                window.showCustomAlert(window.T("Nemáš dost Dogecoinu!"));
            }
        };
        abilitiesGrid.appendChild(card);
    });
}

function showMetaMenu() {
    playSound('menuOpen');
    switchMusic('upgrades');
    const menu = document.getElementById('meta-modal');
    if (menu) menu.classList.add('active');
    
    const container = document.getElementById('meta-options');
    if (!container) return;
    document.getElementById('meta-currency').innerText = META.currency;
    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '30px';

    // 1. ZÁKLADNÍ VYLEPŠENÍ
    const upgradesSection = document.createElement('div');
    upgradesSection.innerHTML = `<h2 style="color: #6366f1; text-align: left; margin-bottom: 15px; font-size: 1.2rem; border-bottom: 1px solid rgba(99,102,241,0.2); padding-bottom: 5px;">🚀 ZÁKLADNÍ STATY</h2>`;
    const upgradesGrid = document.createElement('div');
    upgradesGrid.className = 'menu-actions-grid';
    upgradesSection.appendChild(upgradesGrid);

    const stats = [
        { id: 'hp', name: '❤️ Extra HP', desc: 'Počáteční HP +10', cost: 10, val: META.upgrades.hp },
        { id: 'speed', name: '👟 Rychlost', desc: 'Pohyb +2%', cost: 15, val: META.upgrades.speed },
        { id: 'luck', name: '🍀 Štěstí', desc: 'XP násobič +0.05', cost: 25, val: META.upgrades.luck },
        { id: 'regen', name: '💊 Regenerace', desc: 'HP/s +0.1', cost: 40, val: META.upgrades.regen || 0 },
        { id: 'armor', name: '🛡️ Štít', desc: 'Redukce poškození +2%', cost: 50, val: META.upgrades.armor || 0 }
    ];

    stats.forEach(item => {
        const card = document.createElement('div'); card.className = 'upgrade-card';
        const cost = Math.floor(item.cost * (1 + (item.val || 0) * 0.5));
        card.innerHTML = `<h3>${window.T(item.name)}</h3><p>${window.T(item.desc)}</p><span class="cost">${cost} DOGE</span>`;
        card.onclick = () => {
            if (META.currency < cost) { window.showCustomAlert(window.T("Nemáš dost Dogecoinu!")); return; }
            playSound('upgrade');
            META.upgrades[item.id] = (META.upgrades[item.id] || 0) + 1;
            META.currency -= cost; saveMeta(); showMetaMenu();
        };
        upgradesGrid.appendChild(card);
    });


    // 3. VESMÍRNÉ BEDNY (CRATES)
    const cratesSection = document.createElement('div');
    cratesSection.innerHTML = `<h2 style="color: #fbbf24; text-align: left; margin-bottom: 15px; font-size: 1.2rem; border-bottom: 1px solid rgba(251,191,36,0.2); padding-bottom: 5px;">📦 VESMÍRNÉ BEDNY</h2>`;
    const cratesGrid = document.createElement('div');
    cratesGrid.className = 'menu-actions-grid';
    cratesSection.appendChild(cratesGrid);

    const crateTypes = [
        { id: 'basic', name: '📦 OBYČEJNÁ', cost: 150, color: 'rgba(148, 163, 184, 0.1)', border: '#94a3b8' },
        { id: 'premium', name: '💎 PRÉMIOVÁ', cost: 1000, color: 'rgba(99, 102, 241, 0.1)', border: '#6366f1' },
        { id: 'legendary', name: '👑 LEGENDÁRNÍ', cost: 5000, color: 'rgba(251, 191, 36, 0.1)', border: '#fbbf24' }
    ];

    crateTypes.forEach(type => {
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        card.style.background = type.color;
        card.style.borderColor = type.border;
        card.style.position = 'relative';
        card.style.zIndex = '5';
        card.style.paddingBottom = '60px'; // Space for buttons

        card.innerHTML = `
            <h3>${type.name}</h3>
            <div style="font-size: 0.7rem; color: #fbbf24; font-weight: 800; margin-bottom: 5px;">${type.cost} DOGE / ks</div>
            <div class="crate-multipliers" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; position: absolute; bottom: 10px; left: 10px; right: 10px;">
                ${[1, 2, 5, 10].map(count => `
                    <button class="btn-bulk" data-count="${count}" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 10px 0; border-radius: 8px; font-size: 0.75rem; font-weight: 800; cursor: pointer; transition: all 0.2s;">${count}x</button>
                `).join('')}
            </div>
        `;

        card.querySelectorAll('.btn-bulk').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const count = parseInt(btn.getAttribute('data-count'));
                const totalCost = type.cost * count;
                
                if (META.currency < totalCost) { 
                    window.showCustomAlert(window.T("Nemáš dost Dogecoinu!")); 
                    return; 
                }
                
                playSound('upgrade'); // Click sound
                META.currency -= totalCost;
                saveMeta();
                openCrate(type.id, count);
            };
            btn.onmouseenter = () => btn.style.background = 'rgba(255,255,255,0.15)';
            btn.onmouseleave = () => btn.style.background = 'rgba(255,255,255,0.05)';
        });
        
        cratesGrid.appendChild(card);
    });

    // 2. SBÍRKA EMOJI & ČEPIC
    const collectionSection = document.createElement('div');
    collectionSection.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid rgba(16,185,129,0.2); margin-bottom: 15px; padding-bottom: 5px;">
            <h2 style="color: #10b981; text-align: left; margin:0; font-size: 1.2rem;">✨ TVÁ SBÍRKA</h2>
            ${META.inventory.length > 0 ? `<button id="btn-sell-all" style="padding: 5px 12px; font-size: 0.7rem; border-radius: 8px; background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.3); cursor:pointer; font-weight:bold;">PRODAT VŠE</button>` : ''}
        </div>
    `;
    const collectionGrid = document.createElement('div');
    collectionGrid.style.display = 'grid';
    collectionGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(110px, 1fr))';
    collectionGrid.style.gap = '10px';
    collectionSection.appendChild(collectionGrid);

    if (!META.inventory || META.inventory.length === 0) {
        collectionGrid.innerHTML = `<p style="color: #475569; grid-column: 1/-1; padding: 20px;">Zatím nemáš žádná emoji. Otevři bednu!</p>`;
    } else {
        META.inventory.forEach(inv => {
            const emoji = EMOJIS.find(e => e.id === inv.id);
            if (!emoji) return;
            const card = document.createElement('div');
            card.className = 'upgrade-card';
            card.style.minHeight = 'auto';
            card.style.padding = '12px';
            
            const isEquipped = emoji.isHat && META.upgrades.hat === emoji.type;
            if (isEquipped) card.style.borderColor = '#fbbf24';

            card.innerHTML = `
                <div style="font-size: 1.8rem;">${emoji.icon}</div>
                <div style="font-size: 0.75rem; font-weight: bold; margin-top:5px; color: #f8fafc;">${emoji.name}</div>
                <div style="font-size: 0.65rem; color: #94a3b8">x${inv.count}</div>
                <div style="font-size: 0.6rem; color: ${getRarityColor(emoji.rarity)}; font-weight: bold; margin-bottom: 5px;">${emoji.rarity.toUpperCase()}</div>
                
                <div style="display:flex; flex-direction:column; gap:5px;">
                    ${emoji.isHat ? `<button class="btn-equip" style="padding: 4px; font-size: 0.6rem; border-radius: 6px; background: ${isEquipped ? '#fbbf24' : 'rgba(255,255,255,0.1)'}; color: ${isEquipped ? '#000' : '#fff'}; border: none; cursor:pointer;">${isEquipped ? 'SUNDAT' : 'NASADIT'}</button>` : ''}
                    <button class="btn-sell" style="padding: 4px; font-size: 0.6rem; border-radius: 6px; background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.2); cursor:pointer;">PRODAT (${emoji.price})</button>
                </div>
            `;
            
            if (emoji.isHat) {
                card.querySelector('.btn-equip').onclick = (e) => {
                    e.stopPropagation();
                    if (isEquipped) META.upgrades.hat = null;
                    else META.upgrades.hat = emoji.type;
                    saveMeta();
                    showMetaMenu();
                };
            }
            
            card.querySelector('.btn-sell').onclick = (e) => {
                e.stopPropagation();
                sellEmoji(inv.id);
            };
            collectionGrid.appendChild(card);
        });
    }

    container.appendChild(upgradesSection);
    container.appendChild(cratesSection);
    container.appendChild(collectionSection);

    // Register Sell All listener AFTER appending to DOM
    if (META.inventory && META.inventory.length > 0) {
        const btnSellAll = document.getElementById('btn-sell-all');
        if (btnSellAll) {
            btnSellAll.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.showCustomConfirm(window.T("Opravdu chceš prodat všechna neaktivní emoji?"), () => sellAllEmojis());
            };
        }
    }
}

function getRarityColor(rarity) {
    switch(rarity) {
        case 'common': return '#94a3b8';
        case 'uncommon': return '#38bdf8';
        case 'rare': return '#fbbf24';
        case 'epic': return '#a855f7';
        case 'legendary': return '#ef4444';
        default: return '#fff';
    }
}

function openCrate(type = 'basic', count = 1) {
    if (!GAME.crateQueue) GAME.crateQueue = [];
    GAME.currentBatchResults = []; // Track what user collects
    
    // If it's a new batch, clear old queue
    if (count > 1) {
        GAME.crateQueue = [];
        GAME.lastCrateBatchSize = count;
        GAME.lastCrateType = type;
    } else {
        GAME.lastCrateBatchSize = 1;
        GAME.lastCrateType = type;
    }

    const generateResult = (crateType) => {
        const roll = Math.random() * 100;
        let res = null;
        let rarity = 'common';
        const diamond = EMOJIS.find(e => e.id === 'ultra_rare');
        if (diamond && roll < diamond.chance) {
            res = diamond;
            rarity = 'legendary';
        }
        if (!res) {
            if (crateType === 'legendary') {
                if (roll < 15) rarity = 'legendary';
                else if (roll < 60) rarity = 'epic';
                else rarity = 'rare';
            } else if (crateType === 'premium') {
                if (roll < 1) rarity = 'legendary';
                else if (roll < 15) rarity = 'epic';
                else if (roll < 50) rarity = 'rare';
                else rarity = 'uncommon';
            } else {
                if (roll < 0.1) rarity = 'legendary';
                else if (roll < 0.5) rarity = 'epic';    
                else if (roll < 5) rarity = 'rare';   
                else if (roll < 30) rarity = 'uncommon';
                else rarity = 'common';
            }
            const possible = EMOJIS.filter(e => e.rarity === rarity && e.id !== 'ultra_rare');
            res = possible.length === 0 ? EMOJIS[0] : possible[Math.floor(Math.random() * possible.length)];
        }
        return res;
    };

    const firstResult = generateResult(type);
    
    // Add rest to queue
    for (let i = 1; i < count; i++) {
        GAME.crateQueue.push(generateResult(type));
    }

    if (!GAME.currentBatchResults) GAME.currentBatchResults = [];
    GAME.currentBatchResults.push(firstResult);
    GAME.crateQueue.forEach(item => GAME.currentBatchResults.push(item));

    startCrateAnimation(firstResult, type);
}

function clearCrateTimeouts() {
    if (GAME.crateTimeouts) {
        GAME.crateTimeouts.forEach(t => clearTimeout(t));
    }
    GAME.crateTimeouts = [];
}

function startCrateAnimation(winner, crateType = 'basic') {
    switchMusic('crates');
    // 1. CLEAR EVERYTHING BEFORE STARTING NEW ANIMATION
    clearCrateTimeouts();
    
    // Remove any existing crate modals to be safe
    const oldModals = document.querySelectorAll('.modal-crate-active');
    oldModals.forEach(m => m.remove());

    const modal = document.createElement('div');
    modal.className = 'modal active modal-crate-active';
    modal.style.zIndex = '2000000';
    modal.style.background = 'rgba(15, 23, 42, 0.95)'; 
    modal.style.backdropFilter = 'blur(15px)';
    
    const crateData = {
        'basic': { name: 'OBYČEJNÁ BEDNA', icon: '📦', color: '#94a3b8', glow: 'rgba(148, 163, 184, 0.3)', bg: '#0f172a' },
        'premium': { name: 'PRÉMIOVÁ BEDNA', icon: '💎', color: '#6366f1', glow: 'rgba(99, 102, 241, 0.5)', bg: '#060b1a' },
        'legendary': { name: 'LEGENDÁRNÍ BEDNA', icon: '👑', color: '#fbbf24', glow: 'rgba(251, 191, 36, 0.6)', bg: '#1a1404' }
    }[crateType];

    const isMobile = window.innerWidth <= 768;
    const itemSize = isMobile ? 110 : 130;
    const itemGap = isMobile ? 8 : 10;
    const itemWidth = itemSize + itemGap;

    modal.style.background = `radial-gradient(circle at center, ${crateData.glow.replace('0.6', '0.15').replace('0.5', '0.12')} 0%, rgba(15, 23, 42, 0.98) 100%)`;

    const randomItems = [];
    for(let i=0; i<40; i++) {
        randomItems.push(EMOJIS[Math.floor(Math.random() * EMOJIS.length)]);
    }
    randomItems[35] = winner; // The 36th item is the target

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px; width: 95vw; background: ${crateData.bg}; border: 2px solid ${crateData.color}44; padding: 2rem; overflow: hidden; position: relative; display: flex; flex-direction: column; align-items: center; box-shadow: 0 0 50px ${crateData.glow};">
            <button id="btn-skip-crate" style="position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 0.65rem; font-weight: 900; z-index: 1000; letter-spacing: 1px; backdrop-filter: blur(5px);">SKIP ANIMATION</button>
            <div style="display:flex; align-items:center; gap:10px; margin-bottom: 1.2rem; opacity: 0.8; flex-wrap: wrap; justify-content: center; width: 100%; padding: 0 40px;">
                <span style="font-size: 1.2rem;">${crateData.icon}</span>
                <h2 class="crate-anim-title" style="color: ${crateData.color}; font-size: 0.85rem; margin:0; letter-spacing: 2px; text-transform: uppercase; text-align: center;">${crateData.name}</h2>
            </div>
            
            <div style="position: relative; width: 100%; height: ${itemSize + 30}px; overflow: hidden; background: rgba(0,0,0,0.4); border-radius: 20px; border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; box-shadow: inset 0 0 30px rgba(0,0,0,0.5);">
                <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 2px; height: 100%; background: #fbbf24; z-index: 100; box-shadow: 0 0 10px #fbbf24;">
                    <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 10px solid transparent; border-right: 10px solid transparent; border-top: 12px solid #fbbf24;"></div>
                    <div style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 10px solid transparent; border-right: 10px solid transparent; border-bottom: 12px solid #fbbf24;"></div>
                </div>
                
                <div id="crate-carousel" style="display: flex; gap: ${itemGap}px; width: fit-content; transition: transform 6s cubic-bezier(0.15, 0, 0.05, 1); transform: translateX(0); padding-left: 50%;">
                    ${randomItems.map(item => `
                        <div class="crate-item" style="min-width: ${itemSize}px; height: ${itemSize}px; background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%); border: 1px solid rgba(255,255,255,0.08); border-bottom: 3px solid ${getRarityColor(item.rarity)}; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;">
                            <div style="font-size: ${isMobile ? '2.5rem' : '3.5rem'}; filter: drop-shadow(0 0 8px rgba(255,255,255,0.05));">${item.icon}</div>
                            <div style="font-size: 0.5rem; font-weight: 900; color: ${getRarityColor(item.rarity)}; letter-spacing: 1px;">${item.rarity.toUpperCase()}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div id="crate-result-info" style="margin-top: 1.5rem; opacity: 0; transition: all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275); transform: translateY(20px); text-align: center; width: 100%;">
                <div style="font-size: 0.8rem; color: #64748b; margin-bottom: 5px; letter-spacing: 2px;">ZÍSKÁNO: ${GAME.crateQueue ? (GAME.lastCrateBatchSize - GAME.crateQueue.length) : 1} / ${GAME.lastCrateBatchSize || 1}</div>
                <h3 style="color: #fff; font-size: 2.2rem; margin: 0; text-shadow: 0 0 30px rgba(255,255,255,0.1);">${winner.name}</h3>
                <p style="color: ${getRarityColor(winner.rarity)}; font-weight: bold; font-size: 1.1rem; text-transform: uppercase; letter-spacing: 3px; margin: 5px 0 1.5rem 0;">${winner.rarity.toUpperCase()}</p>
                
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <button id="btn-crate-collect" class="btn-restart" style="min-width: 180px; background: ${getRarityColor(winner.rarity)}; color: #000; font-weight: 800; padding: 12px; font-size: 0.9rem;">${(GAME.crateQueue && GAME.crateQueue.length > 0) ? 'DALŠÍ (NEXT)' : 'PŘIDAT DO SBÍRKY'}</button>
                    <button id="btn-crate-sell" class="btn-restart" style="min-width: 120px; background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 800; padding: 12px; font-size: 0.9rem;">PRODAT (+${winner.price})</button>
                    ${(GAME.crateQueue.length === 0 && GAME.lastCrateBatchSize > 1) ? `<button id="btn-crate-sell-all" class="btn-restart" style="min-width: 150px; background: #ef4444; color: #fff; font-weight: 800; padding: 12px; font-size: 0.9rem;">PRODAT CELOU VÁRKU</button>` : ''}
                    <button id="btn-crate-again" class="btn-restart" style="min-width: 150px; background: rgba(251, 191, 36, 0.1); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); font-weight: 800; padding: 12px; font-size: 0.9rem; display: ${(!GAME.crateQueue || GAME.crateQueue.length === 0) ? 'block' : 'none'};">ZATOČIT ZNOVU</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    
    // Play initial spin sound
    playSound('crateSpin');

    // Ticking logic - plays sound as items pass the center line
    if (GAME.crateTickInterval) clearInterval(GAME.crateTickInterval);
    let lastTickIdx = -1;
    const startTime = Date.now();
    GAME.crateTickInterval = setInterval(() => {
        const carousel = document.getElementById('crate-carousel');
        if (!carousel) { clearInterval(GAME.crateTickInterval); return; }
        const style = window.getComputedStyle(carousel);
        const matrix = new WebKitCSSMatrix(style.transform);
        const currentX = matrix.m41;
        const itemIdx = Math.floor(Math.abs(currentX) / itemWidth);
        if (itemIdx !== lastTickIdx && itemIdx < 40) {
            playSound('crateSpin');
            lastTickIdx = itemIdx;
        }
        if (Date.now() - startTime > 7000) clearInterval(GAME.crateTickInterval);
    }, 30);

    setTimeout(() => {
        const carousel = document.getElementById('crate-carousel');
        if (carousel) {
            const offset = -(35 * itemWidth + itemSize / 2);
            carousel.style.transform = `translateX(${offset}px)`;
        }
    }, 100);

    const showResults = () => {
        if (GAME.crateTickInterval) clearInterval(GAME.crateTickInterval);
        clearCrateTimeouts();
        const carousel = document.getElementById('crate-carousel');
        if (carousel) {
            carousel.style.transition = 'none';
            const offset = -(35 * itemWidth + itemSize / 2);
            carousel.style.transform = `translateX(${offset}px)`;
        }
        const resultInfo = document.getElementById('crate-result-info');
        if (resultInfo) {
            resultInfo.style.opacity = '1';
            resultInfo.style.transform = 'translateY(0)';
        }
        const skipBtn = document.getElementById('btn-skip-crate');
        if (skipBtn) skipBtn.style.display = 'none';
        
        if (winner.rarity === 'legendary') {
            showConfetti(300);
            playSound('crateWin');
            setTimeout(() => playSound('upgrade'), 300);
        } else if (winner.rarity === 'epic') {
            showConfetti(150);
            playSound('crateWin');
        } else if (winner.rarity === 'rare') {
            showConfetti(70);
            playSound('crateWin');
        } else if (winner.rarity === 'uncommon') {
            showConfetti(30);
            playSound('crateWin');
        } else {
            showConfetti(10);
            playSound('crateWin');
        }

        if (GAME.crateQueue && GAME.crateQueue.length > 0) {
            const t = setTimeout(() => {
                const nextBtn = document.getElementById('btn-crate-collect');
                if (nextBtn) nextBtn.click();
            }, 3000);
            GAME.crateTimeouts.push(t);
        }
    };

    modal.querySelector('#btn-skip-crate').onclick = () => {
        showResults();
    };

    GAME.crateTimeouts.push(setTimeout(() => {
        showResults();
    }, 6200));

    // Save to inventory
    if (!META.inventory) META.inventory = [];
    const existing = META.inventory.find(i => i.id === winner.id);
    if (existing) existing.count++;
    else META.inventory.push({ id: winner.id, count: 1 });
    
    if (!META.stats) META.stats = { totalCratesOpened: 0 };
    META.stats.totalCratesOpened = (META.stats.totalCratesOpened || 0) + 1;
    saveMeta();
    checkAchievements();

    modal.querySelector('#btn-crate-collect').onclick = () => {
        clearCrateTimeouts();
        if (GAME.crateQueue && GAME.crateQueue.length > 0) {
            const nextWinner = GAME.crateQueue.shift();
            modal.remove();
            startCrateAnimation(nextWinner, crateType);
        } else {
            modal.remove();
            showMetaMenu();
        }
    };

    modal.querySelector('#btn-crate-sell').onclick = () => {
        clearCrateTimeouts();
        META.currency += winner.price;
        const invIdx = META.inventory.findIndex(i => i.id === winner.id);
        if (invIdx !== -1) {
            if (META.inventory[invIdx].count > 1) META.inventory[invIdx].count--;
            else META.inventory.splice(invIdx, 1);
        }
        saveMeta();
        showCurrencyNotification(winner.price, `PRODÁNO: ${winner.name}`);
        if (GAME.crateQueue && GAME.crateQueue.length > 0) {
            const nextWinner = GAME.crateQueue.shift();
            modal.remove();
            startCrateAnimation(nextWinner, crateType);
        } else {
            modal.remove();
            showMetaMenu();
        }
    };

    const btnSellAll = modal.querySelector('#btn-crate-sell-all');
    if (btnSellAll) {
        btnSellAll.onclick = () => {
            clearCrateTimeouts();
            const results = GAME.currentBatchResults || [];
            let total = 0;
            results.forEach(item => {
                total += item.price;
                const invIdx = META.inventory.findIndex(i => i.id === item.id);
                if (invIdx !== -1) {
                    if (META.inventory[invIdx].count > 1) META.inventory[invIdx].count--;
                    else META.inventory.splice(invIdx, 1);
                }
            });
            META.currency += total;
            saveMeta();
            showCurrencyNotification(total, `VŠE PRODÁNO!`);
            modal.remove();
            showMetaMenu();
        };
    }

    modal.querySelector('#btn-crate-again').onclick = () => {
        clearCrateTimeouts();
        const crateCost = { 'basic': 150, 'premium': 1000, 'legendary': 5000 }[GAME.lastCrateType];
        const totalCost = crateCost * (GAME.lastCrateBatchSize || 1);
        if (META.currency < totalCost) {
            window.showCustomAlert(window.T("Nemáš dost Dogecoinu!"));
            return;
        }
        playSound('upgrade');
        META.currency -= totalCost;
        saveMeta();
        modal.remove();
        openCrate(GAME.lastCrateType, GAME.lastCrateBatchSize);
    };
}

function showBatchSummary() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.style.zIndex = '3000000';
    modal.style.background = 'rgba(15, 23, 42, 0.98)';
    modal.style.backdropFilter = 'blur(20px)';
    
    const items = GAME.currentBatchResults || [];
    const totalValue = items.reduce((sum, i) => sum + i.price, 0);

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px; width: 90vw; padding: 2.5rem; text-align: center; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 0 50px rgba(0,0,0,0.5);">
            <h2 style="color: #fbbf24; font-size: 1.8rem; margin-bottom: 0.5rem;">VÁRKA DOKONČENA</h2>
            <p style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 2rem;">Získal jsi ${items.length} předmětů</p>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px; max-height: 40vh; overflow-y: auto; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 12px; margin-bottom: 2rem;">
                ${items.map(item => `
                    <div style="background: rgba(255,255,255,0.03); border: 1px solid ${getRarityColor(item.rarity)}44; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; align-items: center; gap: 5px;">
                        <span style="font-size: 1.8rem;">${item.icon}</span>
                        <span style="font-size: 0.6rem; font-weight: 800; color: ${getRarityColor(item.rarity)};">${item.rarity.toUpperCase()}</span>
                    </div>
                `).join('')}
            </div>

            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button id="btn-batch-collect" class="btn-restart" style="width: 100%; background: #10b981; color: #fff; font-weight: 800; padding: 15px;">PONECHAT VŠE VE SBÍRCE</button>
                <button id="btn-batch-sell" class="btn-restart" style="width: 100%; background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 800; padding: 15px;">PRODAT CELOU VÁRKU (+${totalValue} DOGE)</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#btn-batch-collect').onclick = () => {
        modal.remove();
        switchMusic('upgrades');
        showMetaMenu();
    };

    modal.querySelector('#btn-batch-sell').onclick = () => {
        // Sell everything that was collected in this batch
        items.forEach(item => {
            const invIdx = META.inventory.findIndex(i => i.id === item.id);
            if (invIdx !== -1) {
                if (META.inventory[invIdx].count > 1) META.inventory[invIdx].count--;
                else META.inventory.splice(invIdx, 1);
            }
        });
        
        META.currency += totalValue;
        saveMeta();
        showCurrencyNotification(totalValue, "VÁRKA PRODÁNA");
        modal.remove();
        switchMusic('upgrades');
        showMetaMenu();
    };
}

function sellEmoji(id) {
    const invIdx = META.inventory.findIndex(i => i.id === id);
    if (invIdx === -1) return;
    
    const emoji = EMOJIS.find(e => e.id === id);
    META.currency += emoji.price;
    showCurrencyNotification(emoji.price, `PRODEJ: ${emoji.name}`);
    
    // Floating text effect in menu
    const menuModal = document.getElementById('meta-modal');
    const floating = document.createElement('div');
    floating.innerText = `+${emoji.price} DOGE`;
    floating.style.position = 'absolute';
    floating.style.top = '50%';
    floating.style.left = '50%';
    floating.style.color = '#fbbf24';
    floating.style.fontWeight = 'bold';
    floating.style.fontSize = '2rem';
    if (META.inventory[invIdx].count > 1) {
        META.inventory[invIdx].count--;
    } else {
        META.inventory.splice(invIdx, 1);
    }
    
    saveMeta();
    showMetaMenu();
}

function sellAllEmojis() {
    if (!META.inventory || META.inventory.length === 0) return;
    
    let totalGain = 0;
    const newInventory = [];
    
    META.inventory.forEach(inv => {
        const emoji = EMOJIS.find(e => e.id === inv.id);
        if (!emoji) return;
        
        const isEquipped = emoji.isHat && META.upgrades.hat === emoji.type;
        
        if (isEquipped) {
            newInventory.push(inv);
        } else {
            totalGain += emoji.price * inv.count;
        }
    });
    
    if (totalGain > 0) {
        META.currency += totalGain;
        showCurrencyNotification(totalGain, "HROMADNÝ PRODEJ");
    }
    
    META.inventory = newInventory;
    saveMeta();
    showMetaMenu();
}

function startGame() {
    switchMusic(null);
    if (GAME.active) return;
    GAME.active = true;
    GAME.paused = false;
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    GAME.startTime = Date.now();
    GAME.lastSpawnTime = Date.now();
    GAME.kills = 0;
    GAME.coinsCollected = 0;
    GAME.entities.player.hp = GAME.entities.player.maxHp;
    
    // Start game music
    AudioEngine.startMusic();
    META.lastMoveTime = Date.now();
    META.isAFK = false;
}

function resetGame() {
    GAME.time = 0; GAME.kills = 0; GAME.lastBossTime = 0; GAME.lastBossLevelSpawned = 0;
    GAME.wallWidthUpgrades = 0;
    GAME.coinsCollected = 0;
    GAME.lastSpawnTime = Date.now();
    GAME.frozenUntil = 0;

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

window.softResetToMenu = () => {
    GAME.active = false;
    GAME.paused = false;
    
    const chat = document.getElementById('global-chat');
    if (chat) chat.style.display = 'none';
    const chatBtn = document.getElementById('btn-chat-mobile');
    if (chatBtn) chatBtn.style.display = 'none';
    if (chat) chat.classList.remove('mobile-active');

    if (NET.socket) {
        NET.socket.disconnect();
        NET.socket = null;
    }

    if (NET.serverPollingInterval) {
        clearInterval(NET.serverPollingInterval);
        NET.serverPollingInterval = null;
    }

    NET.isMultiplayer = false;
    NET.roomId = null;
    NET.others = {};

    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    document.getElementById('menu-modal').classList.add('active');

    switchMusic('menu');
    resetGame();
};

document.addEventListener('click', (e) => {
    if (e.target.closest('.btn-reload')) {
        e.preventDefault();
        window.softResetToMenu();
    }
});

function initSocket() {
    if (NET.socket && NET.socket.connected) return;

    // Automatická detekce serveru (lokální vs produkční)
    const SERVER_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? "http://localhost:3000"
        : "https://neoserver.alwaysdata.net/";

    try {
        NET.socket = io(SERVER_URL);

        NET.socket.on('connect', () => {
            console.warn("CLOUD: Připojeno k hernímu serveru!");

            if (!localStorage.getItem('neoSurvivor_pid')) {
                myPlayerId = Math.random().toString(36).substr(2, 9);
                localStorage.setItem('neoSurvivor_pid', myPlayerId);
            } else {
                myPlayerId = localStorage.getItem('neoSurvivor_pid');
            }

            NET.socket.emit('initPlayer', { playerId: myPlayerId });

            const savedUser = localStorage.getItem('neoSurvivor_user');
            if (savedUser) {
                NET.socket.emit('submitScore', { name: savedUser, level: META.maxLevel });
            }

            NET.socket.emit('requestLeaderboard');
            if (NET.serverPollingInterval) window.requestServerList();

            NET.socket.on('chatMessage', (data) => {
                if (window.addChatMessage) window.addChatMessage(data.user, data.text);
            });
        });

        NET.socket.on('leaderboardData', (data) => {
            const list = document.getElementById('leaderboard-list');
            if (!list) return;
            list.innerHTML = '';

            if (data.length === 0) {
                list.innerHTML = '<div style="text-align: center; color: gray; padding: 20px;">' + window.T("Zatím žádné záznamy. Buď první!") + '</div>';
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
                container.innerHTML = '<div style="text-align: center; color: gray; font-size: 0.9rem; padding: 10px 0;">' + window.T("Žádné aktivní servery") + '</div>';
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
            if (NET.serverPollingInterval) clearInterval(NET.serverPollingInterval);

            if (!GAME.active) {
                startGame();
                const chat = document.getElementById('global-chat');
                const chatBtn = document.getElementById('btn-chat-mobile');
                if (chat) chat.style.display = 'flex';
                if (chatBtn) chatBtn.style.display = 'flex';

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

            if (data.frozen) {
                GAME.frozenUntil = Date.now() + 100; // Krátký buffer na vizuální efekt
                const overlay = document.getElementById('freeze-overlay');
                if (overlay) overlay.classList.add('active');
            } else {
                const overlay = document.getElementById('freeze-overlay');
                if (overlay) overlay.classList.remove('active');
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
                e.possessed = he.possessed;
                return e;
            });

            const currentGems = new Map(GAME.entities.gems.map(g => [g.id, g]));
            GAME.entities.gems = data.gems
                .filter(hg => !GAME.entities.pickedGems.has(hg.id))
                .map(hg => {
                    let g = currentGems.get(hg.id);
                    if (!g) {
                        g = new Gem(hg.x, hg.y, hg.id);
                        g.isNuke = hg.isNuke;
                        g.isMagnet = hg.isMagnet;
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

            if (data.tombstones) {
                GAME.entities.tombstones = data.tombstones.map(t => new Tombstone(t.x, t.y, t.id, t.playerId, t.reviveProgress));
            } else { GAME.entities.tombstones = []; }

            if (data.obstacles) {
                GAME.entities.obstacles = data.obstacles.map(o => new Obstacle(o.x, o.y, o.radius));
            } else { GAME.entities.obstacles = []; }

            const newOthers = {};
            for (let pId in data.players) {
                if (pId === myPlayerId) continue;
                if (data.players[pId].disconnected) continue;

                if (!NET.others[pId]) newOthers[pId] = new Player(false);
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
                newOthers[pId].kills = data.players[pId].kills || 0;
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

        NET.socket.on('playerRevived', (data) => {
            if (data.playerId === myPlayerId && GAME.entities.player) {
                GAME.entities.player.dead = false;
                GAME.entities.player.hp = GAME.entities.player.maxHp / 2;
                if (!GAME.entities.floatingTexts) GAME.entities.floatingTexts = [];
                GAME.entities.floatingTexts.push(new FloatingText(GAME.entities.player.x, GAME.entities.player.y - 25, "REVIVED!", "#3b82f6"));
            }
        });

        NET.socket.on('serverStats', (data) => {
            const el = document.getElementById('active-players-count');
            if (el) {
                // Zobrazíme oba údaje pro lepší přehled
                el.innerHTML = `${data.activePlayers} <span style="font-size:0.65rem; opacity:0.6; margin-left:5px;">(${data.playingNow} ` + window.T("v bitvě") + `)</span>`;
            }
        });

        NET.socket.on('explosion', (data) => {
            // Nuke or Kamikadze explosion
            if (GAME.entities.fire) {
                for (let i = 0; i < 30; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const d = Math.random() * data.radius;
                    GAME.entities.fire.push(new Fire(data.x + Math.cos(a) * d, data.y + Math.sin(a) * d, 0, false));
                }
            }
            shakeScreen(20);
            AudioEngine.play('hit');
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

    const savedUser = localStorage.getItem('neoSurvivor_user') || "Hráč";

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
        name: savedUser,
        kills: GAME.kills || 0
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
    
    // QR Code generation
    const qrImg = document.getElementById('qr-code-img');
    if (qrImg) {
        // Construct the full URL with the room parameter
        const joinUrl = window.location.href.split('?')[0] + `?room=${roomName}`;
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(joinUrl)}`;
        qrImg.style.display = 'block';
    }

    document.getElementById('multiplayer-modal').classList.remove('active');
    document.getElementById('host-modal').classList.add('active');

    document.getElementById('btn-copy-code').onclick = () => {
        navigator.clipboard.writeText(roomName).then(() => {
            const btn = document.getElementById('btn-copy-code');
            btn.innerText = window.T("✅ ZKOPÍROVÁNO!");
            btn.style.background = "#10b981";
            setTimeout(() => {
                btn.innerText = window.T("📋 KOPÍROVAT KÓD");
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
    if (!roomName || roomName.trim() === '') {
        window.showCustomAlert(window.T("Zadej platný kód!"));
        return;
    }
    initSocket();
    NET.socket.emit('joinRoom', { roomId: roomName.trim().toUpperCase(), playerId: myPlayerId });
};

window.connectToId = (id) => {
    const input = document.getElementById('input-join-id');
    if (input) input.value = id;
};

function handleAuth(isLogin) {
    const nameVal = document.getElementById('input-login-name').value.trim();
    const passVal = document.getElementById('input-login-pass').value.trim();

    if (nameVal.length < 3) { window.showCustomAlert(window.T("Jméno musí mít alespoň 3 znaky!")); return; }
    if (passVal.length < 1) { window.showCustomAlert(window.T("Zadej heslo!")); return; }

    const loader = document.getElementById('login-loader');
    const errorEl = document.getElementById('login-error');
    const eventName = isLogin ? 'login' : 'register';

    if (NET.socket && NET.socket.connected) {
        if (loader) loader.style.display = 'block';
        if (errorEl) errorEl.innerText = "";
        
        console.log(`[AUTH] Emitting ${eventName} for: ${nameVal}`);

        // Timeout 5 sekund
        const authTimeout = setTimeout(() => {
            if (loader) loader.style.display = 'none';
            if (errorEl) errorEl.innerText = "Server neodpovídá (Timeout).";
        }, 5000);

        NET.socket.emit(eventName, { user: nameVal, pass: passVal });

        NET.socket.once(eventName + 'Response', (res) => {
            clearTimeout(authTimeout);
            if (loader) loader.style.display = 'none';
            
            if (res.success) {
                console.log(`[AUTH] ${eventName} success!`);
                META.playerName = nameVal.toLowerCase().trim();
                Object.assign(META, res.meta);

                localStorage.setItem('neoSurvivor_user', META.playerName);
                localStorage.setItem('neoSurvivor_pass', passVal);
                saveMetaLocalOnly();

                document.getElementById('display-player-name').innerText = META.playerName;
                document.getElementById('display-max-level').innerText = META.maxLevel || 1;
                document.getElementById('display-doge').innerText = META.currency || 0;

                document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
                document.getElementById('menu-modal').classList.add('active');

                if (!GAME.loopStarted) {
                    GAME.loopStarted = true;
                    requestAnimationFrame(loop);
                }
            } else {
                console.warn(`[AUTH] ${eventName} failed: ${res.msg}`);
                if (errorEl) errorEl.innerText = res.msg || "Chyba komunikace.";
            }
        });
    } else {
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

    // --- MODAL CLOSE HANDLERS FOR MUSIC ---
    const closeButtons = [
        { id: 'btn-close-meta', music: 'menu' },
        { id: 'btn-close-ships', music: 'menu' },
        { id: 'btn-close-achievements', music: 'menu' },
        { id: 'btn-close-settings', music: 'menu' },
        { id: 'btn-close-leaderboard', music: 'menu' },
        { id: 'btn-close-mp', music: 'menu' }
    ];

    closeButtons.forEach(btn => {
        const el = document.getElementById(btn.id);
        if (el) {
            const originalOnclick = el.onclick;
            el.onclick = (e) => {
                if (originalOnclick) originalOnclick(e);
                const modal = el.closest('.modal');
                if (modal) modal.classList.remove('active');
                switchMusic(btn.music);
            };
        }
    });

    GAME.ctx.fillStyle = '#020617';
    GAME.ctx.fillRect(0, 0, GAME.canvas.width, GAME.canvas.height);

    const I18N = {
        cs: {},
        en: {
            "VÍTEJ!": "WELCOME!",
            "PŘIHLÁŠENÍ NEBO REGISTRACE": "LOGIN OR REGISTER",
            "Jméno (min 3 znaky)...": "Username (min 3 chars)...",
            "Heslo...": "Password...",
            "PŘIHLÁSIT": "LOGIN",
            "REGISTROVAT": "REGISTER",
            "KOSMICKÝ BOJ O PŘEŽITÍ": "COSMIC STRUGGLE FOR SURVIVAL",
            "Hráč:": "Player:",
            "Nej. Level:": "Max Level:",
            "Aktivních hráčů online:": "Active players online:",
            "HRA": "GAME",
            "SOLO": "SOLO",
            "MULTIPLAYER": "MULTIPLAYER",
            "POSTUP": "PROGRESS",
            "VÝBAVA": "FLEET",
            "VYLEPŠENÍ": "UPGRADES",
            "ŽEBŘÍČEK": "LEADERBOARD",
            "OSTATNÍ": "OTHER",
            "NÁVOD": "TUTORIAL",
            "FEEDBACK": "FEEDBACK",
            "NASTAVENÍ": "SETTINGS",
            "ODHLÁSIT": "LOGOUT",
            "SÍŇ SLÁVY": "HALL OF FAME",
            "Načítání ze serveru...": "Loading from server...",
            "ZAVŘÍT": "CLOSE",
            "JAZYK / LANGUAGE:": "LANGUAGE:",
            "NEBEZPEČNÁ ZÓNA:": "DANGER ZONE:",
            "ODHLÁSIT SE A SMAZAT POSTUP": "LOGOUT & DELETE PROGRESS",
            "TVÁ VÝBAVA": "YOUR FLEET",
            "SÍŤOVÁ HRA": "MULTIPLAYER",
            "DOSTUPNÉ SERVERY": "AVAILABLE SERVERS",
            "OBNOVIT": "REFRESH",
            "ZALOŽIT HRU": "HOST GAME",
            "MÍSTNOST": "ROOM",
            "ČEKÁNÍ...": "WAITING...",
            "Čekáme, až si ostatní hráči vyberou vylepšení.": "Waiting for other players to pick upgrades.",
            "Připojit se k místnosti ": "Join room ",
            "❤️ Extra HP": "❤️ Extra HP",
            "👟 Rychlost": "👟 Speed",
            "🍀 Štěstí": "🍀 Luck",
            "👑 Koruna": "👑 Crown",
            "🧙 Mág": "🧙 Mage",
            "🥷 Ninja": "🥷 Ninja",
            "VESMÍRNÝ MANUÁL": "SPACE MANUAL",
            "Vše, co potřebuješ vědět k přežití v hlubokém vesmíru.": "Everything you need to know to survive in deep space.",
            "🕹️ ZÁKLADNÍ OVLÁDÁNÍ": "🕹️ BASIC CONTROLS",
            "🧬 VÝVOJ A LEVELY": "🧬 EVOLUTION & LEVELS",
            "🚀 FLOTILA LODÍ": "🚀 SHIP FLEET",
            "👾 ATLAS MIMOZEMŠŤANŮ": "👾 ALIEN ATLAS",
            "🎁 TAKTICKÁ VÝBAVA": "🎁 TACTICAL GEAR",
            "💡 POKROČILÉ TIPY": "💡 ADVANCED TIPS",
            "💊 Regenerace": "💊 Regeneration",
            "🛡️ Štít": "🛡️ Shield",
            "DÁREK": "DAILY REWARD",
            "Další dárek za ": "Next reward in ",
            "Dostal jsi 50 Doge! 🚀": "You got 50 Doge! 🚀",
            "DEN": "DAY",
            "TVŮJ STREAK:": "YOUR STREAK:",
            "DÁREK VYZVEDNUT!": "REWARD CLAIMED!",
            "Odměna:": "Reward:",
            "VYTVOŘIT NOVÝ SERVER": "CREATE NEW SERVER",
            "Název serveru...": "Server name...",
            "ZPĚT": "BACK",
            "LEVEL UP!": "LEVEL UP!",
            "VESMÍRNÝ MANUÁL": "SPACE MANUAL",
            "Vše, co potřebuješ vědět k přežití v hlubokém vesmíru.": "Everything you need to survive in deep space.",
            "🕹️ ZÁKLADNÍ OVLÁDÁNÍ": "🕹️ BASIC CONTROLS",
            "Pohyb:": "Movement:",
            "Schopnost:": "Ability:",
            "Pauza:": "Pause:",
            "🧬 VÝVOJ A LEVELY": "🧬 EVOLUTION AND LEVELS",
            "Zabíjej nepřátele a sbírej": "Kill enemies and collect",
            "Každý nový level ti nabídne 3 náhodná vylepšení.": "Each level offers 3 random upgrades.",
            "Tip: Zaměř se nejdřív na poškození (Damage) a pak na dosah (Magnet)!": "Tip: Focus on damage first, then magnet range!",
            "🎁 TAKTICKÁ VÝBAVA": "🎁 TACTICAL GEAR",
            "Vymaže vše na obrazovce.": "Wipes everything on screen.",
            "Přitáhne všechny gemy z dálky.": "Pulls all gems from afar.",
            "Opraví poškozený trup lodi.": "Repairs damaged ship hull.",
            "💡 POKROČILÉ TIPY": "💡 ADVANCED TIPS",
            "Skvělá kombinace pro nesmrtelnost.": "Great combo for immortality.",
            "Objevuje se každou minutu. Vždy se mu snaž uhýbat do stran!": "Spawns every minute. Always dodge sideways!",
            "Za 10 killů máš 1 Doge. Kupuj za ně trvalá vylepšení!": "10 kills = 1 Doge. 10 kills = 1 Doge. Buy permanent upgrades with them!",
            "ROZUMÍM, CHCI DO BOJE!": "UNDERSTOOD, LET'S FIGHT!",
            "Napiš mi, co bys chtěl vylepšit nebo nahlásit chybu.": "Tell me what to improve or report a bug.",
            "ODESLAT": "SUBMIT",
            "🚀 FLOTILA LODÍ": "🚀 SHIP FLEET",
            "👾 ATLAS MIMOZEMŠŤANŮ": "👾 ALIEN ATLAS",
            "Základní vyvážená loď.": "Basic balanced ship.",
            "Střílí zničující lasery na více cílů.": "Shoots devastating lasers at multiple targets.",
            "Základní útok tvoří rotující bariéru.": "Basic attack forms a rotating barrier.",
            "Střílí salvu nábojů zblízka.": "Fires a shotgun blast at close range.",
            "Vyvolává armádu pomocníků z mrtvých.": "Summons an army of helpers from the dead.",
            "Základní červený nepřítel, útočí ve vlnách.": "Basic red enemy, attacks in waves.",
            "Zvláštní fialový/modrý tvar, pohybuje se jinak.": "Special purple/blue shape, moves differently.",
            "Rychle se přiblíží a vybuchne, když zasáhne cíl.": "Quickly approaches and explodes on impact.",
            "Zlatá hvězdička, je neuvěřitelně rychlý!": "Golden star, incredibly fast!",
            "Léčí a posiluje ostatní ufony v okolí.": "Heals and buffs other aliens nearby.",
            "Vyznačí si cíl a bleskově tam doskočí.": "Marks a target and leaps there lightning fast.",
            "Obří mnohostěn s velkým HP. Každou minutu.": "Giant polygon with huge HP. Every minute.",
            "Opravdu chceš smazat všechen svůj postup, odhlásit se a vymazat lokální data?": "Do you really want to delete all progress, logout, and clear local data?",
            "Opravdu se chceš odhlásit?": "Do you really want to log out?",
            "NE": "NO",
            "ANO": "YES",
            "VLASTNĚNO (Klikni)": "OWNED (Click)",
            "VYBRÁNO": "SELECTED",
            "VLASTNĚNO": "OWNED",
            "LÉČENÍ": "HEAL",
            "OŽIVOVÁNÍ...": "REVIVING...",
            "DOGECOIN:": "DOGECOIN:",
            "v bitvě": "in battle",
            "Dron:": "Drone:",
            "Kostka:": "Cube:",
            "Kamikadze:": "Kamikaze:",
            "Goblin:": "Goblin:",
            "Support:": "Support:",
            "Skokan:": "Leaper:",
            "Boss:": "Boss:",
            "Lifesteal + Rychlost:": "Lifesteal + Speed:",
            "Dogecoiny:": "Dogecoins:",
            "🚀 Průzkumník:": "🚀 Explorer:",
            "⚡ Laserový křižník:": "⚡ Laser Cruiser:",
            "🛡️ Obránce:": "🛡️ Defender:",
            "💥 Brokovnice:": "💥 Shotgun:",
            "💀 Nekromancer:": "💀 Necromancer:",
            "Nemáš dost Dogecoinu!": "Not enough Dogecoin!",
            "Zatím žádné záznamy. Buď první!": "No records yet. Be the first!",
            "Žádné aktivní servery": "No active servers",
            "Zadej platný kód!": "Enter a valid code!",
            "Jméno musí mít alespoň 3 znaky!": "Name must have at least 3 characters!",
            "Zadej heslo!": "Enter password!",
            "Zpráva musí mít aspoň 5 znaků.": "Message must have at least 5 characters.",
            "Díky! Zpětná vazba byla odeslána vývojáři.": "Thanks! Feedback sent to the developer.",
            "Chyba: Nejseš připojen k serveru.": "Error: Not connected to server.",
            "LODĚ": "SHIPS",
            "SCHOPNOSTI (Místo Sniperu)": "ABILITIES (Replaces Sniper)",
            "Základní Loď": "Basic Ship",
            "Spolehlivý standardní model": "Reliable standard model",
            "Laserová Loď": "Laser Ship",
            "Automatický paprsek, nestřílí": "Auto-beam, no projectiles",
            "Drtivá Zeď": "Crushing Wall",
            "Průrazná vlna bez základní palby.": "Piercing wave, no basic fire.",
            "Brokovnice": "Shotgun",
            "Střílí 3-5 střel najednou.": "Fires 3-5 shots at once.",
            "Nekromancer": "Necromancer",
            "Místo útoku vyvolává vlastní armádu minionů.": "Summons own minion army instead of attacking.",
            "Odstřelovač": "Sniper",
            "Základní průrazná střela": "Basic piercing shot",
            "Zastavení času": "Time Stop",
            "Znehybní všechny nepřátele na 5s": "Freezes all enemies for 5s",
            "Posednutí": "Possession",
            "10 nejbližších ufounů přejde na tvou stranu": "10 nearest aliens join your side",
            "Léčivá aura": "Healing Aura",
            "Léčíš spoluhráče ve své blízkosti": "Heals nearby teammates",
            "Extra HP": "Extra HP",
            "Počáteční HP +10": "Starting HP +10",
            "Rychlost": "Speed",
            "Pohyb +2%": "Movement +2%",
            "Štěstí": "Luck",
            "XP násobič +0.05": "XP multiplier +0.05",
            "Koruna": "Crown",
            "Zlatá královská koruna": "Golden royal crown",
            "Mág": "Mage",
            "Klobouk čaroděje": "Wizard hat",
            "Ninja": "Ninja",
            "Maska stínu": "Shadow mask",
            "✅ ZKOPÍROVÁNO!": "✅ COPIED!",
            "📋 KOPÍROVAT KÓD": "📋 COPY CODE",
            "ZADEJ KÓD...": "ENTER CODE...",
            "PŘIPOJIT": "JOIN",
            "ZALOŽIT NOVOU MÍSTNOST": "HOST NEW ROOM",
            "ZPĚT DO MENU": "BACK TO MENU",
            "UPOZORNĚNÍ": "ALERT",
            "ROZUMÍM": "UNDERSTOOD",
            "VAROVÁNÍ": "WARNING",
            "Hledám servery...": "Searching servers...",
            "— NEBO KÓD —": "— OR CODE —",
            "MÍSTNOST ZALOŽENA": "ROOM HOSTED",
            "KÓD TVÉ MÍSTNOSTI:": "YOUR ROOM CODE:",
            "POKRAČOVAT": "CONTINUE",
            "UKONČIT DO MENU": "QUIT TO MENU",
            "POTVRZENÍ": "CONFIRMATION",
            "Pošli tento kód spoluhráčům:": "Send this code to teammates:",
            "🚀 VSTOUPIT DO HRY": "🚀 ENTER GAME",
            "ZRUŠIT": "CANCEL",
            "Zvýšení Síly": "Damage Boost",
            "Poškození x2": "Damage x2",
            "Rychlé Boty": "Fast Boots",
            "+15% rychlost pohybu": "+15% movement speed",
            "Rychlá Palba": "Rapid Fire",
            "-20% prodleva útoku": "-20% attack delay",
            "Energetický Štít": "Energy Shield",
            "Snížení poškození o 20%": "Damage reduced by 20%",
            "Růst": "Growth",
            "+10% max HP a plný heal": "+10% max HP and full heal",
            "Více Střel": "More Projectiles",
            "+1 projektil navíc": "+1 extra projectile",
            "Průraznost": "Piercing",
            "Paprsek/Střela projde více nepřátely": "Shot passes through more enemies",
            "Dosah Zdi": "Wall Range",
            "+25% dolet a životnost tvé zdi": "+25% range and life for your wall",
            "Zaměřovač": "Scope",
            "+150 dosah laseru": "+150 laser range",
            "Širší Zeď": "Wider Wall",
            "+25% šířka zdi": "+25% wall width",
            "Obří Střely": "Giant Shots",
            "+30% velikost projektilu": "+30% projectile size",
            "XP Multiplikátor": "XP Multiplier",
            "+20% bonus k XP": "+20% XP bonus",
            "Odraz": "Bounce",
            "Střely se odráží k dalšímu cíli": "Shots bounce to next target",
            "Magnet na XP": "XP Magnet",
            "+50% dosah sběru": "+50% collect range",
            "Zlepšená Muška": "Better Aim",
            "+15% šance na kritický zásah": "+15% crit chance",
            "Kritické Poškození": "Crit Damage",
            "Zvyšuje násobič krit. zásahu (+1x)": "Increases crit multiplier (+1x)",
            "Silný Odhoz": "Strong Knockback",
            "+50% síla odhozu": "+50% knockback power",
            "Regenerace": "Regeneration",
            "Obnova 1 HP/s": "Restores 1 HP/s",
            "Ultra Magnet": "Ultra Magnet",
            "Pomalý sběr z celé mapy": "Slow collect from whole map",
            "Orbitální Štít": "Orbital Shield",
            "Vypustí rotující projektil": "Releases rotating projectile",
            "Lifesteal": "Lifesteal",
            "10% šance vyléčit si 8% HP při killu": "10% chance to heal 8% HP on kill",
            "Ohnivá Stopa": "Fire Trail",
            "Zanecháváš za sebou oheň": "Leave fire trail behind you",
            "Kaktus": "Cactus",
            "Zabíjí dotykem (10s on, 30s off)": "Kills on touch (10s on, 30s off)",
            "Zkušenostní Pole": "XP Field",
            "Generuje 1 XP automaticky": "Generates 1 XP automatically",
            "Větší Výběr": "Bigger Choice",
            "+1 možnost při levelu": "+1 choice on level up",
            "Mraziv Aura": "Freezing Aura",
            "Zpomaluje blízké nepřátele": "Slows nearby enemies",
            "Návnada": "Bait",
            "Vypouští chutné cíle pro ufony": "Releases tasty targets for aliens",
            "Velitel Duchů": "Ghost Commander",
            "Ability: Posedne o +2 více nepřátel": "Ability: Possess +2 more enemies",
            "Hráči:": "Players:",
            "Zabití": "Kills",
            "PAUZA": "PAUSE",
            "❤️ HP": "❤️ HP",
            "⚔️ Poškození": "⚔️ Damage",
            "👟 Rychlost": "👟 Speed",
            "🌀 Počet Střel": "🌀 Projectiles",
            "🔥 Prodleva": "🔥 Fire Rate",
            "🎯 Krit. Šance": "🎯 Crit Chance",
            "💥 Krit. Násobič": "💥 Crit Multi",
            "🛡️ Štít": "🛡️ Shield",
            "💊 Regenerace": "💊 Regen",
            "🧛 Lifesteal": "🧛 Lifesteal",
            "Tvoje zpráva...": "Your message...",
            "ODESLAT ZPRÁVU": "SEND MESSAGE",
            "ČEKÁNÍ...": "WAITING...",
            "Čekáme, až si ostatní hráči vyberou vylepšení.": "Waiting for other players to choose upgrades.",
            "Napiš mi, co bys chtěl vylepšit nebo nahlásit chybu.": "Tell me what to improve or report a bug.",
            "ROZUMÍM, CHCI DO BOJE!": "UNDERSTOOD, LET'S FIGHT!",
            "VESMÍRNÝ MANUÁL": "SPACE MANUAL",
            "Vše, co potřebuješ vědět k přežití v hlubokém vesmíru.": "Everything you need to know to survive in deep space.",
            "🕹️ ZÁKLADNÍ OVLÁDÁNÍ": "🕹️ BASIC CONTROLS",
            "Klávesy": "Keys",
            "nebo": "or",
            "na mobilu.": "on mobile.",
            "Levý klik": "Left click",
            "Klepnutí": "Tap",
            "(pravá strana mobilu).": "(right side of mobile).",
            "Klávesa": "Key",
            "pro statistiky a pauzu.": "for stats and pause.",
            "🧬 VÝVOJ A LEVELY": "🧬 EVOLUTION AND LEVELS",
            "Zabíjej nepřátele a sbírej": "Kill enemies and collect",
            ". Každý nový level ti nabídne 3 náhodná vylepšení.": ". Each new level offers 3 random upgrades.",
            "Tip: Zaměř se nejdřív na poškození (Damage) a pak na dosah (Magnet)!": "Tip: Focus on damage first, then magnet range!",
            "🚀 FLOTILA LODÍ": "🚀 SHIP FLEET",
            "🚀 Průzkumník:": "🚀 Explorer:",
            "Základní vyvážená loď.": "Basic balanced ship.",
            "⚡ Laserový křižník:": "⚡ Laser Cruiser:",
            "Střílí zničující lasery na více cílů.": "Shoots devastating lasers at multiple targets.",
            "🛡️ Obránce:": "🛡️ Defender:",
            "Základní útok tvoří rotující bariéru.": "Basic attack forms a rotating barrier.",
            "💥 Brokovnice:": "💥 Shotgun:",
            "Střílí salvu nábojů zblízka.": "Fires a shotgun blast at close range.",
            "💀 Nekromancer:": "💀 Necromancer:",
            "Vyvolává armádu pomocníků z mrtvých.": "Summons an army of helpers from the dead.",
            "👾 ATLAS MIMOZEMŠŤANŮ": "👾 ALIEN ATLAS",
            "Základní červený nepřítel, útočí ve vlnách.": "Basic red enemy, attacks in waves.",
            "Zvláštní fialový/modrý tvar, pohybuje se jinak.": "Special purple/blue shape, moves differently.",
            "Rychle se přiblíží a vybuchne, když zasáhne cíl.": "Quickly approaches and explodes on impact.",
            "Zlatá hvězdička, je neuvěřitelně rychlý!": "Golden star, incredibly fast!",
            "Léčí a posiluje ostatní ufony v okolí.": "Heals and buffs other aliens nearby.",
            "Vyznačí si cíl a bleskově tam doskočí.": "Marks a target and leaps there lightning fast.",
            "Obří mnohostěn s velkým HP. Každou minutu.": "Giant polygon with huge HP. Every minute.",
            "🎁 TAKTICKÁ VÝBAVA": "🎁 TACTICAL GEAR",
            "☢️ Nuke:": "☢️ Nuke:",
            "Vymaže vše na obrazovce.": "Wipes everything on screen.",
            "🧲 Magnet:": "🧲 Magnet:",
            "Přitáhne všechny gemy z dálky.": "Pulls all gems from afar.",
            "➕ Lékárna:": "➕ Medkit:",
            "Opraví poškozený trup lodi.": "Repairs damaged ship hull.",
            "💡 POKROČILÉ TIPY": "💡 ADVANCED TIPS",
            "Skvělá kombinace pro nesmrtelnost.": "Great combo for immortality.",
            "Objevuje se každou minutu. Vždy se mu snaž uhýbat do stran!": "Spawns every minute. Always try to dodge sideways!",
            "Za 10 killů máš 1 Doge. Kupuj za ně trvalá vylepšení!": "10 kills = 1 Doge. Buy permanent upgrades with them!"
        },
        de: {
            "VÍTEJ!": "WILLKOMMEN!",
            "PŘIHLÁŠENÍ NEBO REGISTRACE": "ANMELDEN ODER REGISTRIEREN",
            "Jméno (min 3 znaky)...": "Benutzername (min 3 Zeichen)...",
            "Heslo...": "Passwort...",
            "PŘIHLÁSIT": "ANMELDEN",
            "REGISTROVAT": "REGISTRIEREN",
            "KOSMICKÝ BOJ O PŘEŽITÍ": "KOSMISCHER KAMPF UMS ÜBERLEBEN",
            "Hráč:": "Spieler:",
            "Nej. Level:": "Max. Level:",
            "Aktivních hráčů online:": "Aktive Spieler online:",
            "HRA": "SPIEL",
            "SOLO": "SOLO",
            "MULTIPLAYER": "MEHRSPIELER",
            "POSTUP": "FORTSCHRITT",
            "VÝBAVA": "AUSRÜSTUNG",
            "VYLEPŠENÍ": "VERBESSERUNGEN",
            "ŽEBŘÍČEK": "RANGLISTE",
            "OSTATNÍ": "SONSTIGES",
            "NÁVOD": "ANLEITUNG",
            "FEEDBACK": "FEEDBACK",
            "NASTAVENÍ": "EINSTELLUNGEN",
            "ODHLÁSIT": "ABMELDEN",
            "SÍŇ SLÁVY": "RUHMESHALLE",
            "Načítání ze serveru...": "Wird vom Server geladen...",
            "ZAVŘÍT": "SCHLIESSEN",
            "JAZYK / LANGUAGE:": "SPRACHE:",
            "NEBEZPEČNÁ ZÓNA:": "GEFAHRENZONE:",
            "ODHLÁSIT SE A SMAZAT POSTUP": "ABMELDEN & DATEN LÖSCHEN",
            "TVÁ VÝBAVA": "DEINE FLOTTE",
            "SÍŤOVÁ HRA": "MEHRSPIELER",
            "DOSTUPNÉ SERVERY": "VERFÜGBARE SERVER",
            "OBNOVIT": "AKTUALISIEREN",
            "ZALOŽIT HRU": "SPIEL ERSTELLEN",
            "MÍSTNOST": "RAUM",
            "ČEKÁNÍ...": "WARTEN...",
            "Čekáme, až si ostatní hráči vyberou vylepšení.": "Warten auf andere Spieler.",
            "Připojit se k místnosti ": "Raum beitreten ",
            "❤️ Extra HP": "❤️ Extra HP",
            "👟 Rychlost": "👟 Geschw.",
            "🍀 Štěstí": "🍀 Glück",
            "👑 Koruna": "👑 Krone",
            "🧙 Mág": "🧙 Magier",
            "🥷 Ninja": "🥷 Ninja",
            "VESMÍRNÝ MANUÁL": "WELTRAUM-HANDBUCH",
            "Vše, co potřebuješ vědět k přežití v hlubokém vesmíru.": "Alles, was Sie wissen müssen, um im tiefen Weltraum zu überleben.",
            "🕹️ ZÁKLADNÍ OVLÁDÁNÍ": "🕹️ GRUNDSTEUERUNG",
            "🧬 VÝVOJ A LEVELY": "🧬 ENTWICKLUNG & LEVEL",
            "🚀 FLOTILA LODÍ": "🚀 SCHIFFSFLOTTE",
            "👾 ATLAS MIMOZEMŠŤANŮ": "👾 ALIEN-ATLAS",
            "🎁 TAKTICKÁ VÝBAVA": "🎁 TAKTISCHE AUSRÜSTUNG",
            "💡 POKROČILÉ TIPY": "💡 FORTGESCHRITTENE TIPPS",
            "VYTVOŘIT NOVÝ SERVER": "NEUEN SERVER ERSTELLEN",
            "Název serveru...": "Servername...",
            "ZPĚT": "ZURÜCK",
            "LEVEL UP!": "STUFENAUFSTIEG!",
            "VESMÍRNÝ MANUÁL": "WELTRAUM-HANDBUCH",
            "Vše, co potřebuješ vědět k přežití v hlubokém vesmíru.": "Alles, was du zum Überleben im Weltraum wissen musst.",
            "🕹️ ZÁKLADNÍ OVLÁDÁNÍ": "🕹️ GRUNDSTEUERUNG",
            "Pohyb:": "Bewegung:",
            "Schopnost:": "Fähigkeit:",
            "Pauza:": "Pause:",
            "🧬 VÝVOJ A LEVELY": "🧬 EVOLUTION UND LEVEL",
            "Zabíjej nepřátele a sbírej": "Töte Feinde und sammle",
            "Každý nový level ti nabídne 3 náhodná vylepšení.": "Jedes Level bietet 3 zufällige Upgrades.",
            "Tip: Zaměř se nejdřív na poškození (Damage) a pak na dosah (Magnet)!": "Tipp: Fokus auf Schaden, dann Magnet-Reichweite!",
            "🎁 TAKTICKÁ VÝBAVA": "🎁 TAKTISCHE AUSRÜSTUNG",
            "Vymaže vše na obrazovce.": "Löscht alles auf dem Bildschirm.",
            "Přitáhne všechny gemy z dálky.": "Zieht alle Edelsteine aus der Ferne an.",
            "Opraví poškozený trup lodi.": "Repariert die beschädigte Schiffshülle.",
            "💡 POKROČILÉ TIPY": "💡 FORTGESCHRITTENE TIPPS",
            "Skvělá kombinace pro nesmrtelnost.": "Tolle Kombination für Unsterblichkeit.",
            "Objevuje se každou minutu. Vždy se mu snaž uhýbat do stran!": "Erscheint jede Minute. Immer seitlich ausweichen!",
            "Za 10 killů máš 1 Doge. Kupuj za ně trvalá vylepšení!": "10 Kills = 1 Doge. Kaufe permanente Upgrades!",
            "ROZUMÍM, CHCI DO BOJE!": "VERSTANDEN, AUF IN DEN KAMPF!",
            "Napiš mi, co bys chtěl vylepšit nebo nahlásit chybu.": "Schreibe mir, was du verbessern möchtest oder melde einen Fehler.",
            "ODESLAT": "ABSENDEN",
            "🚀 FLOTILA LODÍ": "🚀 SCHIFFSFLOTTE",
            "👾 ATLAS MIMOZEMŠŤANŮ": "👾 ALIEN-ATLAS",
            "Základní vyvážená loď.": "Ausgewogenes Basisschiff.",
            "Střílí zničující lasery na více cílů.": "Schießt verheerende Laser auf mehrere Ziele.",
            "Základní útok tvoří rotující bariéru.": "Basisangriff bildet eine rotierende Barriere.",
            "Střílí salvu nábojů zblízka.": "Feuert eine Schrotladung auf kurze Distanz ab.",
            "Vyvolává armádu pomocníků z mrtvých.": "Beschwört eine Armee von Helfern aus den Toten.",
            "Základní červený nepřítel, útočí ve vlnách.": "Roter Basisfeind, greift in Wellen an.",
            "Zvláštní fialový/modrý tvar, pohybuje se jinak.": "Besondere lila/blaue Form, bewegt sich anders.",
            "Rychle se přiblíží a vybuchne, když zasáhne cíl.": "Nähert sich schnell und explodiert beim Aufprall.",
            "Zlatá hvězdička, je neuvěřitelně rychlý!": "Goldener Stern, unglaublich schnell!",
            "Léčí a posiluje ostatní ufony v okolí.": "Heilt und stärkt andere Aliens in der Nähe.",
            "Vyznačí si cíl a bleskově tam doskočí.": "Markiert ein Ziel und springt blitzschnell dorthin.",
            "Obří mnohostěn s velkým HP. Každou minutu.": "Riesiges Polygon mit viel HP. Jede Minute.",
            "Opravdu chceš smazat všechen svůj postup, odhlásit se a vymazat lokální data?": "Möchtest du wirklich alle Fortschritte löschen, dich abmelden und lokale Daten löschen?",
            "Opravdu se chceš odhlásit?": "Möchtest du dich wirklich abmelden?",
            "NE": "NEIN",
            "ANO": "JA",
            "VLASTNĚNO (Klikni)": "IM BESITZ (Klicken)",
            "VYBRÁNO": "AUSGEWÄHLT",
            "VLASTNĚNO": "IM BESITZ",
            "LÉČENÍ": "HEILUNG",
            "OŽIVOVÁNÍ...": "WIEDERBELEBUNG...",
            "DOGECOIN:": "DOGECOIN:",
            "v bitvě": "im Kampf",
            "Dron:": "Drohne:",
            "Kostka:": "Würfel:",
            "Kamikadze:": "Kamikaze:",
            "Goblin:": "Kobold:",
            "Support:": "Unterstützung:",
            "Skokan:": "Springer:",
            "Boss:": "Boss:",
            "Lifesteal + Rychlost:": "Lebensraub + Geschw.:",
            "Dogecoiny:": "Dogecoins:",
            "🚀 Průzkumník:": "🚀 Entdecker:",
            "⚡ Laserový křižník:": "⚡ Laserkreuzer:",
            "🛡️ Obránce:": "⚡ Verteidiger:",
            "💥 Brokovnice:": "💥 Schrotflinte:",
            "💀 Nekromancer:": "💀 Nekromant:",
            "Nemáš dost Dogecoinu!": "Nicht genug Dogecoin!",
            "Zatím žádné záznamy. Buď první!": "Noch keine Einträge. Sei der Erste!",
            "Žádné aktivní servery": "Keine aktiven Server",
            "Zadej platný kód!": "Gib einen gültigen Code ein!",
            "Jméno musí mít alespoň 3 znaky!": "Name muss mindestens 3 Zeichen haben!",
            "Zadej heslo!": "Passwort eingeben!",
            "Zpráva musí mít aspoň 5 znaků.": "Nachricht muss mindestens 5 Zeichen lang sein.",
            "Díky! Zpětná vazba byla odeslána vývojáři.": "Danke! Feedback an den Entwickler gesendet.",
            "Chyba: Nejseš připojen k serveru.": "Fehler: Keine Verbindung zum Server.",
            "LODĚ": "SCHIFFE",
            "SCHOPNOSTI (Místo Sniperu)": "FÄHIGKEITEN (Ersetzt Sniper)",
            "Základní Loď": "Basisschiff",
            "Spolehlivý standardní model": "Zuverlässiges Standardmodell",
            "Laserová Loď": "Laserschiff",
            "Automatický paprsek, nestřílí": "Auto-Strahl, keine Projektile",
            "Drtivá Zeď": "Zerschmetternde Wand",
            "Průrazná vlna bez základní palby.": "Durchdringende Welle, kein Standardfeuer.",
            "Brokovnice": "Schrotflinte",
            "Střílí 3-5 střel současně.": "Feuert 3-5 Schüsse gleichzeitig.",
            "Nekromancer": "Nekromant",
            "Místo útoku vyvolává vlastní armádu minionů.": "Beschwört eine Armee von Dienern statt anzugreifen.",
            "Odstřelovač": "Scharfschütze",
            "Základní průrazná střela": "Durchschlagender Basisschuss",
            "Zastavení času": "Zeitstopp",
            "Znehybní všechny nepřátele na 5s": "Friert alle Feinde für 5s ein",
            "Posednutí": "Besessenheit",
            "10 nejbližších ufounů přejde na tvou stranu": "10 nächste Aliens wechseln die Seite",
            "Léčivá aura": "Heilaura",
            "Léčíš spoluhráče ve své blízkosti": "Heilt Teammitglieder in der Nähe",
            "Extra HP": "Extra HP",
            "Počáteční HP +10": "Start-HP +10",
            "Rychlost": "Geschwindigkeit",
            "Pohyb +2%": "Bewegung +2%",
            "Štěstí": "Glück",
            "XP násobič +0.05": "XP-Multiplikator +0.05",
            "Koruna": "Krone",
            "Zlatá královská koruna": "Goldene königliche Krone",
            "Mág": "Magier",
            "Klobouk čaroděje": "Zaubererhut",
            "Ninja": "Ninja",
            "Maska stínu": "Schattenmaske",
            "✅ ZKOPÍROVÁNO!": "✅ KOPIERT!",
            "📋 KOPÍROVAT KÓD": "📋 CODE KOPIEREN",
            "ZADEJ KÓD...": "CODE EINGEBEN...",
            "PŘIPOJIT": "BEITRETEN",
            "ZALOŽIT NOVOU MÍSTNOST": "NEUEN RAUM ERSTELLEN",
            "ZPĚT DO MENU": "ZURÜCK ZUM MENÜ",
            "UPOZORNĚNÍ": "HINWEIS",
            "ROZUMÍM": "VERSTANDEN",
            "VAROVÁNÍ": "WARNUNG",
            "Hledám servery...": "Suche Server...",
            "— NEBO KÓD —": "— ODER CODE —",
            "MÍSTNOST ZALOŽENA": "RAUM ERSTELLT",
            "KÓD TVÉ MÍSTNOSTI:": "DEIN RAUMCODE:",
            "POKRAČOVAT": "WEITER",
            "UKONČIT DO MENU": "ZUM MENÜ",
            "POTVRZENÍ": "BESTÄTIGUNG",
            "Pošli tento kód spoluhráčům:": "Sende diesen Code an Teamkollegen:",
            "🚀 VSTOUPIT DO HRY": "🚀 SPIEL BETRETEN",
            "ZRUŠIT": "ABBRECHEN",
            "Zvýšení Síly": "Schadens-Boost",
            "Poškození x2": "Schaden x2",
            "Rychlé Boty": "Schnelle Stiefel",
            "+15% rychlost pohybu": "+15% Bewegungsgeschwindigkeit",
            "Rychlá Palba": "Schnellfeuer",
            "-20% prodleva útoku": "-20% Angriffsverzögerung",
            "Energetický Štít": "Energieschild",
            "Snížení poškození o 20%": "Schaden um 20% reduziert",
            "Růst": "Wachstum",
            "+10% max HP a plný heal": "+10% max HP und volle Heilung",
            "Více Střel": "Mehr Projektile",
            "+1 projektil navíc": "+1 extra Projektil",
            "Průraznost": "Durchschlag",
            "Paprsek/Střela projde více nepřátely": "Schuss durchschlägt mehr Feinde",
            "Dosah Zdi": "Wandreichweite",
            "+25% dolet a životnost tvé zdi": "+25% Reichweite und Lebensdauer der Wand",
            "Zaměřovač": "Zielfernrohr",
            "+150 dosah laseru": "+150 Laserreichweite",
            "Širší Zeď": "Breitere Wand",
            "+25% šířka zdi": "+25% Wandbreite",
            "Obří Střely": "Riesenschüsse",
            "+30% velikost projektilu": "+30% Projektilgröße",
            "XP Multiplikátor": "XP-Multiplikator",
            "+20% bonus k XP": "+20% XP-Bonus",
            "Odraz": "Abpraller",
            "Střely se odráží k dalšímu cíli": "Schüsse prallen zum nächsten Ziel ab",
            "Magnet na XP": "XP-Magnet",
            "+50% dosah sběru": "+50% Sammelreichweite",
            "Zlepšená Muška": "Besseres Zielen",
            "+15% šance na kritický zásah": "+15% Krit-Chance",
            "Kritické Poškození": "Krit-Schaden",
            "Zvyšuje násobič krit. zásahu (+1x)": "Erhöht Krit-Multiplikator (+1x)",
            "Silný Odhoz": "Starker Rückstoß",
            "+50% síla odhozu": "+50% Rückstoßkraft",
            "Regenerace": "Regeneration",
            "Obnova 1 HP/s": "Stellt 1 HP/s wieder her",
            "Ultra Magnet": "Ultra-Magnet",
            "Pomalý sběr z celé mapy": "Langsames Sammeln von der ganzen Karte",
            "Orbitální Štít": "Orbitalschild",
            "Vypustí rotující projektil": "Lässt rotierendes Projektil ab",
            "Lifesteal": "Lebensraub",
            "10% šance vyléčit si 8% HP při killu": "10% Chance, bei einem Kill 8% HP zu heilen",
            "Ohnivá Stopa": "Feuerspur",
            "Zanecháváš za sebou oheň": "Hinterlässt Feuerspur",
            "Kaktus": "Kaktus",
            "Zabíjí dotykem (10s on, 30s off)": "Tötet bei Berührung (10s an, 30s aus)",
            "Zkušenostní Pole": "XP-Feld",
            "Generuje 1 XP automaticky": "Generiert automatisch 1 XP",
            "Větší Výběr": "Größere Auswahl",
            "+1 možnost při levelu": "+1 Auswahl beim Levelaufstieg",
            "Mraziv Aura": "Frost-Aura",
            "Zpomaluje blízké nepřátele": "Verlangsamt nahe Feinde",
            "Návnada": "Köder",
            "Vypouští chutné cíle pro ufony": "Lässt schmackhafte Ziele für Aliens frei",
            "Velitel Duchů": "Geisterkommandant",
            "Ability: Posedne o +2 více nepřátel": "Fähigkeit: Übernimm +2 weitere Feinde",
            "Hráči:": "Spieler:",
            "Zabití": "Kills",
            "PAUZA": "PAUSE",
            "❤️ HP": "❤️ HP",
            "⚔️ Poškození": "⚔️ Damage",
            "👟 Rychlost": "👟 Speed",
            "🌀 Počet Střel": "🌀 Projectiles",
            "🔥 Prodleva": "🔥 Fire Rate",
            "🎯 Krit. Šance": "🎯 Crit Chance",
            "💥 Krit. Násobič": "💥 Crit Multi",
            "🛡️ Štít": "🛡️ Shield",
            "💊 Regenerace": "💊 Regen",
            "🧛 Lifesteal": "🧛 Lifesteal",
            "Tvoje zpráva...": "Your message...",
            "ODESLAT ZPRÁVU": "SEND MESSAGE",
            "ČEKÁNÍ...": "WAITING...",
            "Čekáme, až si ostatní hráči vyberou vylepšení.": "Waiting for other players to choose upgrades.",
            "Napiš mi, co bys chtěl vylepšit nebo nahlásit chybu.": "Tell me what to improve or report a bug.",
            "ROZUMÍM, CHCI DO BOJE!": "UNDERSTOOD, LET'S FIGHT!",
            "VESMÍRNÝ MANUÁL": "SPACE MANUAL",
            "Vše, co potřebuješ vědět k přežití v hlubokém vesmíru.": "Everything you need to know to survive in deep space.",
            "🕹️ ZÁKLADNÍ OVLÁDÁNÍ": "🕹️ BASIC CONTROLS",
            "Klávesy": "Keys",
            "nebo": "or",
            "na mobilu.": "on mobile.",
            "Levý klik": "Left click",
            "Klepnutí": "Tap",
            "(pravá strana mobilu).": "(right side of mobile).",
            "Klávesa": "Key",
            "pro statistiky a pauzu.": "for stats and pause.",
            "🧬 VÝVOJ A LEVELY": "🧬 EVOLUTION AND LEVELS",
            "Zabíjej nepřátele a sbírej": "Kill enemies and collect",
            ". Každý nový level ti nabídne 3 náhodná vylepšení.": ". Each new level offers 3 random upgrades.",
            "Tip: Zaměř se nejdřív na poškození (Damage) a pak na dosah (Magnet)!": "Tip: Focus on damage first, then magnet range!",
            "🚀 FLOTILA LODÍ": "🚀 SHIP FLEET",
            "🚀 Průzkumník:": "🚀 Explorer:",
            "Základní vyvážená loď.": "Basic balanced ship.",
            "⚡ Laserový křižník:": "⚡ Laser Cruiser:",
            "Střílí zničující lasery na více cílů.": "Shoots devastating lasers at multiple targets.",
            "🛡️ Obránce:": "🛡️ Defender:",
            "Základní útok tvoří rotující bariéru.": "Basic attack forms a rotating barrier.",
            "💥 Brokovnice:": "💥 Shotgun:",
            "Střílí salvu nábojů zblízka.": "Fires a shotgun blast at close range.",
            "💀 Nekromancer:": "💀 Necromancer:",
            "Vyvolává armádu pomocníků z mrtvých.": "Summons an army of helpers from the dead.",
            "👾 ATLAS MIMOZEMŠŤANŮ": "👾 ALIEN ATLAS",
            "Základní červený nepřítel, útočí ve vlnách.": "Basic red enemy, attacks in waves.",
            "Zvláštní fialový/modrý tvar, pohybuje se jinak.": "Special purple/blue shape, moves differently.",
            "Rychle se přiblíží a vybuchne, když zasáhne cíl.": "Quickly approaches and explodes on impact.",
            "Zlatá hvězdička, je neuvěřitelně rychlý!": "Golden star, incredibly fast!",
            "Léčí a posiluje ostatní ufony v okolí.": "Heals and buffs other aliens nearby.",
            "Vyznačí si cíl a bleskově tam doskočí.": "Marks a target and leaps there lightning fast.",
            "Obří mnohostěn s velkým HP. Každou minutu.": "Giant polygon with huge HP. Every minute.",
            "🎁 TAKTICKÁ VÝBAVA": "🎁 TACTICAL GEAR",
            "☢️ Nuke:": "☢️ Nuke:",
            "Vymaže vše na obrazovce.": "Wipes everything on screen.",
            "🧲 Magnet:": "🧲 Magnet:",
            "Přitáhne všechny gemy z dálky.": "Pulls all gems from afar.",
            "➕ Lékárna:": "➕ Medkit:",
            "Opraví poškozený trup lodi.": "Repairs damaged ship hull.",
            "💡 POKROČILÉ TIPY": "💡 ADVANCED TIPS",
            "Skvělá kombinace pro nesmrtelnost.": "Great combo for immortality.",
            "Objevuje se každou minutu. Vždy se mu snaž uhýbat do stran!": "Spawns every minute. Always try to dodge sideways!",
            "Za 10 killů máš 1 Doge. Kupuj za ně trvalá vylepšení!": "10 kills = 1 Doge. Buy permanent upgrades with them!"
        },
        es: {
            "VÍTEJ!": "¡BIENVENIDO!",
            "PŘIHLÁŠENÍ NEBO REGISTRACE": "INICIAR SESIÓN O REGISTRARSE",
            "Jméno (min 3 znaky)...": "Nombre de usuario (min 3 caracteres)...",
            "Heslo...": "Contraseña...",
            "PŘIHLÁSIT": "INICIAR SESIÓN",
            "REGISTROVAT": "REGISTRARSE",
            "KOSMICKÝ BOJ O PŘEŽITÍ": "LUCHA CÓSMICA POR LA SUPERVIVENCIA",
            "Hráč:": "Jugador:",
            "Nej. Level:": "Nivel Máximo:",
            "Aktivních hráčů online:": "Jugadores activos en línea:",
            "HRA": "JUEGO",
            "SOLO": "SOLO",
            "MULTIPLAYER": "MULTIJUGADOR",
            "POSTUP": "PROGRESO",
            "VÝBAVA": "EQUIPAMIENTO",
            "VYLEPŠENÍ": "MEJORAS",
            "ŽEBŘÍČEK": "TABLA DE POSICIONES",
            "OSTATNÍ": "OTROS",
            "NÁVOD": "TUTORIAL",
            "FEEDBACK": "COMENTARIOS",
            "NASTAVENÍ": "CONFIGURACIONES",
            "ODHLÁSIT": "CERRAR SESIÓN",
            "SÍŇ SLÁVY": "SALÓN DE LA FAMA",
            "Načítání ze serveru...": "Cargando del servidor...",
            "ZAVŘÍT": "CERRAR",
            "JAZYK / LANGUAGE:": "IDIOMA:",
            "NEBEZPEČNÁ ZÓNA:": "ZONA DE PELIGRO:",
            "ODHLÁSIT SE A SMAZAT POSTUP": "CERRAR SESIÓN Y BORRAR DATOS",
            "TVÁ VÝBAVA": "TU FLOTA",
            "SÍŤOVÁ HRA": "MULTIJUGADOR",
            "DOSTUPNÉ SERVERY": "SERVIDORES DISPONIBLES",
            "OBNOVIT": "ACTUALIZAR",
            "ZALOŽIT HRU": "CREAR PARTIDA",
            "MÍSTNOST": "SALA",
            "ČEKÁNÍ...": "ESPERANDO...",
            "Čekáme, až si ostatní hráči vyberou vylepšení.": "Esperando a que otros elijan mejoras.",
            "Připojit se k místnosti ": "Unirse a la sala ",
            "❤️ Extra HP": "❤️ HP Extra",
            "👟 Rychlost": "👟 Velocidad",
            "🍀 Štěstí": "🍀 Suerte",
            "👑 Koruna": "👑 Corona",
            "🧙 Mág": "🧙 Mago",
            "🥷 Ninja": "🥷 Ninja",
            "VESMÍRNÝ MANUÁL": "MANUAL ESPACIAL",
            "Vše, co potřebuješ vědět k přežití v hlubokém vesmíru.": "Todo lo que necesitas saber para sobrevivir en el espacio profundo.",
            "🕹️ ZÁKLADNÍ OVLÁDÁNÍ": "🕹️ CONTROLES BÁSICOS",
            "🧬 VÝVOJ A LEVELY": "🧬 EVOLUCIÓN Y NIVELES",
            "🚀 FLOTILA LODÍ": "🚀 FLOTA DE NAVES",
            "👾 ATLAS MIMOZEMŠŤANŮ": "👾 ATLAS ALIENÍGENA",
            "🎁 TAKTICKÁ VÝBAVA": "🎁 EQUIPO TÁCTICO",
            "💡 POKROČILÉ TIPY": "💡 CONSEJOS AVANZADOS",
            "VYTVOŘIT NOVÝ SERVER": "CREAR NUEVO SERVIDOR",
            "Název serveru...": "Nombre del servidor...",
            "ZPĚT": "ATRÁS",
            "LEVEL UP!": "¡SUBISTE DE NIVEL!",
            "VESMÍRNÝ MANUÁL": "MANUAL ESPACIAL",
            "Vše, co potřebuješ vědět k přežití v hlubokém vesmíru.": "Todo lo que necesitas saber para sobrevivir en el espacio.",
            "🕹️ ZÁKLADNÍ OVLÁDÁNÍ": "🕹️ CONTROLES BÁSICOS",
            "Pohyb:": "Movimiento:",
            "Schopnost:": "Habilidad:",
            "Pauza:": "Pausa:",
            "🧬 VÝVOJ A LEVELY": "🧬 EVOLUCIÓN Y NIVELES",
            "Zabíjej nepřátele a sbírej": "Mata enemigos y recolecta",
            "Každý nový level ti nabídne 3 náhodná vylepšení.": "Cada nivel te ofrece 3 mejoras aleatorias.",
            "Tip: Zaměř se nejdřív na poškození (Damage) a pak na dosah (Magnet)!": "Consejo: ¡Concéntrate en el daño primero, luego en el imán!",
            "🎁 TAKTICKÁ VÝBAVA": "🎁 EQUIPO TÁCTICO",
            "Vymaže vše na obrazovce.": "Borra todo en la pantalla.",
            "Přitáhne všechny gemy z dálky.": "Atrae todas las gemas desde lejos.",
            "Opraví poškozený trup lodi.": "Repara el casco de la nave dañado.",
            "💡 POKROČILÉ TIPY": "💡 CONSEJOS AVANZADOS",
            "Skvělá kombinace pro nesmrtelnost.": "Gran combinación para la inmortalidad.",
            "Objevuje se každou minutu. Vždy se mu snaž uhýbat do stran!": "Aparece cada minuto. ¡Siempre esquiva hacia los lados!",
            "Za 10 killů máš 1 Doge. Kupuj za ně trvalá vylepšení!": "Por 10 kills obtienes 1 Doge. ¡Compra mejoras permanentes!",
            "ROZUMÍM, CHCI DO BOJE!": "¡ENTENDIDO, A PELEAR!",
            "Napiš mi, co bys chtěl vylepšit nebo nahlásit chybu.": "Escríbeme qué te gustaría mejorar o reportar un error.",
            "ODESLAT": "ENVIAR",
            "🚀 FLOTILA LODÍ": "🚀 FLOTA DE NAVES",
            "👾 ATLAS MIMOZEMŠŤANŮ": "👾 ATLAS DE EXTRATERRESTRES",
            "Základní vyvážená loď.": "Nave básica equilibrada.",
            "Střílí zničující lasery na více cílů.": "Dispara láseres devastadores a múltiples objetivos.",
            "Základní útok tvoří rotující bariéru.": "El ataque básico forma una barrera giratoria.",
            "Střílí salvu nábojů zblízka.": "Dispara una ráfaga a corta distancia.",
            "Vyvolává armádu pomocníků z mrtvých.": "Invoca un ejército de ayudantes de los muertos.",
            "Základní červený nepřítel, útočí ve vlnách.": "Enemigo rojo básico, ataca en oleadas.",
            "Zvláštní fialový/modrý tvar, pohybuje se jinak.": "Forma especial morada/azul, se mueve diferente.",
            "Rychle se přiblíží a vybuchne, když zasáhne cíl.": "Se acerca rápidamente y explota al impactar.",
            "Zlatá hvězdička, je neuvěřitelně rychlý!": "¡Estrellita dorada, es increíblemente rápido!",
            "Léčí a posiluje ostatní ufony v okolí.": "Cura y fortalece a otros alienígenas cercanos.",
            "Vyznačí si cíl a bleskově tam doskočí.": "Marca un objetivo y salta hacia él rápidamente.",
            "Obří mnohostěn s velkým HP. Každou minutu.": "Polígono gigante con gran HP. Cada minuto.",
            "Opravdu chceš smazat všechen svůj postup, odhlásit se a vymazat lokální data?": "¿Realmente quieres borrar todo tu progreso, cerrar sesión y borrar los datos locales?",
            "Opravdu se chceš odhlásit?": "¿De verdad quieres cerrar sesión?",
            "NE": "NO",
            "ANO": "SÍ",
            "VLASTNĚNO (Klikni)": "ADQUIRIDO (Haz clic)",
            "VYBRÁNO": "SELECCIONADO",
            "VLASTNĚNO": "ADQUIRIDO",
            "LÉČENÍ": "CURACIÓN",
            "OŽIVOVÁNÍ...": "REVIVIENDO...",
            "DOGECOIN:": "DOGECOIN:",
            "v bitvě": "en batalla",
            "Dron:": "Dron:",
            "Kostka:": "Cubo:",
            "Kamikadze:": "Kamikaze:",
            "Goblin:": "Duende:",
            "Support:": "Apoyo:",
            "Skokan:": "Saltador:",
            "Boss:": "Jefe:",
            "Lifesteal + Rychlost:": "Robo de Vida + Veloc.:",
            "Dogecoiny:": "Dogecoins:",
            "🚀 Průzkumník:": "🚀 Explorador:",
            "⚡ Laserový křižník:": "⚡ Crucero Láser:",
            "🛡️ Obránce:": "🛡️ Defensor:",
            "💥 Brokovnice:": "💥 Escopeta:",
            "💀 Nekromancer:": "💀 Nigromante:",
            "Nemáš dost Dogecoinu!": "¡No tienes suficientes Dogecoins!",
            "Zatím žádné záznamy. Buď první!": "Todavía no hay registros. ¡Sé el primero!",
            "Žádné aktivní servery": "No hay servidores activos",
            "Zadej platný kód!": "¡Introduce un código válido!",
            "Jméno musí mít alespoň 3 znaky!": "¡El nombre debe tener al menos 3 caracteres!",
            "Zadej heslo!": "¡Introduce la contraseña!",
            "Zpráva musí mít aspoň 5 znaků.": "El mensaje debe tener al menos 5 caracteres.",
            "Díky! Zpětná vazba byla odeslána vývojáři.": "¡Gracias! Comentarios enviados al desarrollador.",
            "Chyba: Nejseš připojen k serveru.": "Error: No conectado al servidor.",
            "LODĚ": "NAVES",
            "SCHOPNOSTI (Místo Sniperu)": "HABILIDADES (Reemplaza Francotirador)",
            "Základní Loď": "Nave Básica",
            "Spolehlivý standardní model": "Modelo estándar confiable",
            "Laserová Loď": "Nave Láser",
            "Automatický paprsek, nestřílí": "Rayo automático, sin proyectiles",
            "Drtivá Zeď": "Muro Aplastante",
            "Průrazná vlna bez základní palby.": "Ola perforante, sin fuego básico.",
            "Brokovnice": "Escopeta",
            "Střílí 3-5 střel najednou.": "Dispara 3-5 tiros a la vez.",
            "Nekromancer": "Nigromante",
            "Místo útoku vyvolává vlastní armádu minionů.": "Invoca ejército de secuaces en lugar de atacar.",
            "Odstřelovač": "Francotirador",
            "Základní průrazná střela": "Tiro perforante básico",
            "Zastavení času": "Parada de Tiempo",
            "Znehybní všechny nepřátele na 5s": "Congela a todos los enemigos por 5s",
            "Posednutí": "Posesión",
            "10 nejbližších ufounů přejde na tvou stranu": "10 alienígenas más cercanos se unen",
            "Léčivá aura": "Aura Sanadora",
            "Léčíš spoluhráče ve své blízkosti": "Cura a compañeros cercanos",
            "Extra HP": "HP Extra",
            "Počáteční HP +10": "HP Inicial +10",
            "Rychlost": "Velocidad",
            "Pohyb +2%": "Movimiento +2%",
            "Štěstí": "Suerte",
            "XP násobič +0.05": "Multiplicador XP +0.05",
            "Koruna": "Corona",
            "Zlatá královská koruna": "Corona real dorada",
            "Mág": "Mago",
            "Klobouk čaroděje": "Sombrero de mago",
            "Ninja": "Ninja",
            "Maska stínu": "Máscara de sombra",
            "✅ ZKOPÍROVÁNO!": "✅ ¡COPIADO!",
            "📋 KOPÍROVAT KÓD": "📋 COPIAR CÓDIGO",
            "ZADEJ KÓD...": "INTRODUCIR CÓDIGO...",
            "PŘIPOJIT": "UNIRSE",
            "ZALOŽIT NOVOU MÍSTNOST": "CREAR NUEVA SALA",
            "ZPĚT DO MENU": "VOLVER AL MENÚ",
            "UPOZORNĚNÍ": "ALERTA",
            "ROZUMÍM": "ENTENDIDO",
            "VAROVÁNÍ": "ADVERTENCIA",
            "Hledám servery...": "Buscando servidores...",
            "— NEBO KÓD —": "— O CÓDIGO —",
            "MÍSTNOST ZALOŽENA": "SALA CREADA",
            "KÓD TVÉ MÍSTNOSTI:": "CÓDIGO DE TU SALA:",
            "POKRAČOVAT": "CONTINUAR",
            "UKONČIT DO MENU": "SALIR AL MENÚ",
            "POTVRZENÍ": "CONFIRMACIÓN",
            "Pošli tento kód spoluhráčům:": "Envía este código a los compañeros:",
            "🚀 VSTOUPIT DO HRY": "🚀 ENTRAR AL JUEGO",
            "ZRUŠIT": "CANCELAR",
            "Zvýšení Síly": "Aumento de Daño",
            "Poškození x2": "Daño x2",
            "Rychlé Boty": "Botas Rápidas",
            "+15% rychlost pohybu": "+15% velocidad de movimiento",
            "Rychlá Palba": "Fuego Rápido",
            "-20% prodleva útoku": "-20% retraso de ataque",
            "Energetický Štít": "Escudo de Energía",
            "Snížení poškození o 20%": "Daño reducido en 20%",
            "Růst": "Crecimiento",
            "+10% max HP a plný heal": "+10% HP máx y curación completa",
            "Více Střel": "Más Proyectiles",
            "+1 projektil navíc": "+1 proyectil extra",
            "Průraznost": "Perforación",
            "Paprsek/Střela projde více nepřátely": "El tiro atraviesa más enemigos",
            "Dosah Zdi": "Alcance del Muro",
            "+25% dolet a životnost tvé zdi": "+25% alcance y vida para tu muro",
            "Zaměřovač": "Mira",
            "+150 dosah laseru": "+150 alcance de láser",
            "Širší Zeď": "Muro más Ancho",
            "+25% šířka zdi": "+25% ancho del muro",
            "Obří Střely": "Tiros Gigantes",
            "+30% velikost projektilu": "+30% tamaño del proyectil",
            "XP Multiplikátor": "Multiplicador de XP",
            "+20% bono de XP": "+20% bono de XP",
            "Odraz": "Rebote",
            "Střely se odráží k dalšímu cíli": "Los tiros rebotan al siguiente objetivo",
            "Magnet na XP": "Imán de XP",
            "+50% dosah sběru": "+50% alcance de recolección",
            "Zlepšená Muška": "Mejor Puntería",
            "+15% šance na kritický zásah": "+15% prob. de crítico",
            "Kritické Poškození": "Daño Crítico",
            "Zvyšuje násobič krit. zásahu (+1x)": "Aumenta el multiplicador crítico (+1x)",
            "Silný Odhoz": "Fuerte Empuje",
            "+50% síla odhozu": "+50% fuerza de empuje",
            "Regenerace": "Regeneración",
            "Obnova 1 HP/s": "Restaura 1 HP/s",
            "Ultra Magnet": "Ultra Imán",
            "Pomalý sběr z celé mapy": "Recolección lenta de todo el mapa",
            "Orbitální Štít": "Escudo Orbital",
            "Vypouští rotující projektil": "Libera proyectil rotatorio",
            "Lifesteal": "Robo de Vida",
            "10% šance vyléčit si 8% HP při killu": "10% de prob. de curar 8% de HP al matar",
            "Ohnivá Stopa": "Rastro de Fuego",
            "Zanecháváš za sebou oheň": "Deja un rastro de fuego",
            "Kaktus": "Cactus",
            "Zabíjí dotykem (10s on, 30s off)": "Mata al tocar (10s on, 30s off)",
            "Zkušenostní Pole": "Campo de XP",
            "Generuje 1 XP automáticamente": "Genera 1 XP automáticamente",
            "Větší Výběr": "Mayor Elección",
            "+1 možnost při levelu": "+1 opción al subir de nivel",
            "Mraziv Aura": "Aura Congelante",
            "Zpomaluje blízké nepřátele": "Ralentiza a los enemigos cercanos",
            "Návnada": "Cebo",
            "Vypouští chutné cíle pro ufony": "Libera objetivos deliciosos para alienígenas",
            "Velitel Duchů": "Comandante Fantasma",
            "Ability: Posedne o +2 více nepřátel": "Habilidad: Posee +2 enemigos más",
            "Hráči:": "Jugadores:",
            "Zabití": "Bajas",
            "PAUZA": "PAUSA",
            "❤️ HP": "❤️ HP",
            "⚔️ Poškození": "⚔️ Daño",
            "👟 Rychlost": "👟 Velocidad",
            "🌀 Počet Střel": "🌀 Proyectiles",
            "🔥 Prodleva": "🔥 Cadencia",
            "🎯 Krit. Šance": "🎯 Prob. Crítico",
            "💥 Krit. Násobič": "💥 Multi. Crítico",
            "🛡️ Štít": "🛡️ Escudo",
            "💊 Regenerace": "💊 Regeneración",
            "🧛 Lifesteal": "🧛 Robo de Vida",
            "Tvoje zpráva...": "Tu mensaje...",
            "ODESLAT ZPRÁVU": "ENVIAR MENSAJE",
            "ČEKÁNÍ...": "ESPERANDO...",
            "Čekáme, až si ostatní hráči vyberou vylepšení.": "Esperando a que otros jugadores elijan mejoras.",
            "Napiš mi, co bys chtěl vylepšit nebo nahlásit chybu.": "Dime qué mejorar o reporta un error.",
            "ROZUMÍM, CHCI DO BOJE!": "¡ENTENDIDO, A LUCHAR!",
            "VESMÍRNÝ MANUÁL": "MANUAL ESPACIAL",
            "Vše, co potřebuješ vědět k přežití v hlubokém vesmíru.": "Todo lo que necesitas saber para sobrevivir en el espacio profundo.",
            "🕹️ ZÁKLADNÍ OVLÁDÁNÍ": "🕹️ CONTROLES BÁSICOS",
            "Klávesy": "Teclas",
            "nebo": "o",
            "na mobilu.": "en el móvil.",
            "Levý klik": "Clic izquierdo",
            "Klepnutí": "Toque",
            "(pravá strana mobilu).": "(lado derecho del móvil).",
            "Klávesa": "Tecla",
            "pro statistiky a pauzu.": "para estadísticas y pausa.",
            "🧬 VÝVOJ A LEVELY": "🧬 EVOLUCIÓN Y NIVELES",
            "Zabíjej nepřátele a sbírej": "Mata enemigos y recoge",
            ". Každý nový level ti nabídne 3 náhodná vylepšení.": ". Cada nuevo nivel ofrece 3 mejoras aleatorias.",
            "Tip: Zaměř se nejdřív na poškození (Damage) a pak na dosah (Magnet)!": "Consejo: ¡Concéntrate primero en el daño, luego en el alcance del imán!",
            "🚀 FLOTILA LODÍ": "🚀 FLOTA DE NAVES",
            "🚀 Průzkumník:": "🚀 Explorador:",
            "Základní vyvážená loď.": "Nave básica equilibrada.",
            "⚡ Laserový křižník:": "⚡ Crucero Láser:",
            "Střílí zničující lasery na více cílů.": "Dispara láseres devastadores a múltiples objetivos.",
            "🛡️ Obránce:": "🛡️ Defensor:",
            "Základní útok tvoří rotující bariéru.": "El ataque básico forma una barrera rotatoria.",
            "💥 Brokovnice:": "💥 Escopeta:",
            "Střílí salvu nábojů zblízka.": "Dispara una ráfaga de escopeta a corta distancia.",
            "💀 Nekromancer:": "💀 Nigromante:",
            "Vyvolává armádu pomocníků z mrtvých.": "Invoca un ejército de ayudantes de entre los muertos.",
            "👾 ATLAS MIMOZEMŠŤANŮ": "👾 ATLAS ALIENÍGENA",
            "Základní červený nepřítel, útočí ve vlnách.": "Enemigo rojo básico, ataca en oleadas.",
            "Zvláštní fialový/modrý tvar, pohybuje se jinak.": "Forma especial morada/azul, se mueve de manera diferente.",
            "Rychle se přiblíží a vybuchne, když zasáhne cíl.": "Se acerca rápidamente y explota al impactar.",
            "Zlatá hvězdička, je neuvěřitelně rychlý!": "¡Estrella dorada, increíblemente rápido!",
            "Léčí a posiluje ostatní ufony v okolí.": "Cura y mejora a otros alienígenas cercanos.",
            "Vyznačí si cíl a bleskově tam doskočí.": "Marca un objetivo y salta allí a la velocidad del rayo.",
            "Obří mnohostěn s velkým HP. Každou minutu.": "Polígono gigante con mucho HP. Cada minuto.",
            "🎁 TAKTICKÁ VÝBAVA": "🎁 EQUIPO TÁCTICO",
            "☢️ Nuke:": "☢️ Bomba Nuclear:",
            "Vymaže vše na obrazovce.": "Elimina todo en la pantalla.",
            "🧲 Magnet:": "🧲 Imán:",
            "Přitáhne všechny gemy z dálky.": "Atrae todas las gemas desde lejos.",
            "➕ Lékárna:": "➕ Botiquín:",
            "Opraví poškozený trup lodi.": "Repara el casco dañado de la nave.",
            "💡 POKROČILÉ TIPY": "💡 CONSEJOS AVANZADOS",
            "Skvělá kombinace pro nesmrtelnost.": "Gran combinación para la inmortalidad.",
            "Objevuje se každou minutu. Vždy se mu snaž uhýbat do stran!": "Aparece cada minuto. ¡Intenta siempre esquivar hacia los lados!",
            "Za 10 killů máš 1 Doge. Kupuj za ně trvalá vylepšení!": "10 bajas = 1 Doge. ¡Compra mejoras permanentes con ellos!"
        }
    };

    window.ORIGINAL_TEXTS = window.ORIGINAL_TEXTS || new WeakMap();
    window.setLanguage = function(lang) {
        localStorage.setItem('neoSurvivor_lang', lang);
        const dict = I18N[lang] || {};
        
        function walk(node) {
            // Text nodes
            if (node.nodeType === 3) {
                const text = node.nodeValue.trim();
                if (text.length > 0) {
                    if (!window.ORIGINAL_TEXTS.has(node)) window.ORIGINAL_TEXTS.set(node, node.nodeValue);
                    const orig = window.ORIGINAL_TEXTS.get(node);
                    const origTrimmed = orig.trim();
                    
                    if (lang === 'cs') {
                        node.nodeValue = orig;
                    } else if (dict[origTrimmed]) {
                        node.nodeValue = orig.replace(origTrimmed, dict[origTrimmed]);
                    }
                }
            } 
            // Element nodes
            else if (node.nodeType === 1 && node.nodeName !== 'SCRIPT' && node.nodeName !== 'STYLE') {
                // Handle data-i18n attribute
                if (node.hasAttribute('data-i18n')) {
                    const key = node.getAttribute('data-i18n');
                    if (lang === 'cs') {
                        // Restore key as text if in Czech
                        if (node.childNodes.length === 1 && node.firstChild.nodeType === 3) {
                            node.firstChild.nodeValue = key;
                        }
                    } else if (dict[key]) {
                        // Replace text content if dictionary has entry
                        if (node.childNodes.length === 1 && node.firstChild.nodeType === 3) {
                            node.firstChild.nodeValue = dict[key];
                        }
                    }
                }
                
                // Recursively walk children
                for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
                
                // Handle placeholders
                if (node.placeholder) {
                    if (!window.ORIGINAL_TEXTS.has(node)) window.ORIGINAL_TEXTS.set(node, node.placeholder);
                    const orig = window.ORIGINAL_TEXTS.get(node);
                    if (lang === 'cs') node.placeholder = orig;
                    else if (dict[orig]) node.placeholder = dict[orig];
                }
            }
        }
        
        walk(document.body);
        window.T = function(str) { 
            if (lang === 'cs') return str;
            return dict[str] || str; 
        };
    };

    // Join room from URL parameter
    function checkUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const roomId = params.get('room');
        if (roomId && roomId.length === 6) {
            const modal = document.getElementById('qr-join-modal');
            const text = document.getElementById('qr-join-text');
            const confirmBtn = document.getElementById('btn-qr-join-confirm');
            
            if (modal && text && confirmBtn) {
                text.innerText = window.T("Připojit se k místnosti ") + roomId.toUpperCase() + "?";
                modal.classList.add('active');
                
                confirmBtn.onclick = () => {
                    modal.classList.remove('active');
                    if (typeof window.joinCloudServer === 'function') {
                        window.joinCloudServer(roomId.toUpperCase());
                    }
                    // Remove param from URL without refresh
                    const newUrl = window.location.origin + window.location.pathname;
                    window.history.replaceState({}, document.title, newUrl);
                };
            }
        }
    }

    const langCs = document.getElementById('btn-lang-cs');
    if (langCs) langCs.onclick = () => window.setLanguage('cs');
    const langEn = document.getElementById('btn-lang-en');
    if (langEn) langEn.onclick = () => window.setLanguage('en');
    const langDe = document.getElementById('btn-lang-de');
    if (langDe) langDe.onclick = () => window.setLanguage('de');
    const langEs = document.getElementById('btn-lang-es');
    if (langEs) langEs.onclick = () => window.setLanguage('es');
    
    window.setLanguage(localStorage.getItem('neoSurvivor_lang') || 'cs');


    loadMeta();
    document.getElementById('display-max-level').innerText = META.maxLevel || 0;
    document.getElementById('display-doge').innerText = META.currency || 0;

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
                if (res.success) {
                    META.playerName = savedUser;
                    Object.assign(META, res.meta);
                    saveMetaLocalOnly();
                    document.getElementById('display-max-level').innerText = META.maxLevel || 1;
                    document.getElementById('display-doge').innerText = META.currency || 0;
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

    // Daily Gift Logic (Streak based)
    const btnDaily = document.getElementById('btn-daily-gift');
    if (btnDaily) {
        btnDaily.style.display = 'flex';
        btnDaily.title = window.T("DENNÍ DÁREK");
        
        btnDaily.onmouseenter = () => btnDaily.style.transform = 'scale(1.1) rotate(10deg)';
        btnDaily.onmouseleave = () => btnDaily.style.transform = 'scale(1) rotate(0deg)';

        btnDaily.onclick = () => {
            const now = Date.now();
            const hour = 3600 * 1000;
            const day = 24 * hour;
            
            const lastClaim = META.lastDailyGift || 0;
            const timeSince = now - lastClaim;

            if (timeSince < day) {
                const remaining = day - timeSince;
                const h = Math.floor(remaining / hour);
                const m = Math.floor((remaining % hour) / (60 * 1000));
                window.showCustomAlert(window.T("Další dárek za ") + h + "h " + m + "m!");
                return;
            }

            // Streak logic
            if (timeSince > 2 * day) {
                META.dailyStreak = 1; // Reset if missed a day (over 48h)
            } else {
                META.dailyStreak = (META.dailyStreak || 0) + 1;
            }

            const rewards = [50, 100, 200, 400, 800];
            const reward = rewards[Math.min(META.dailyStreak - 1, rewards.length - 1)];

            META.currency += reward;
            META.lastDailyGift = now;
            saveMeta();
            
            showCurrencyNotification(reward, `DENNÍ ODMĚNA (${META.dailyStreak}. DEN)`);
            btnDaily.style.opacity = '0.5';
            btnDaily.style.filter = 'grayscale(1)';
            btnDaily.style.pointerEvents = 'none';
        };

        // Update button state on load
        const timeSinceLast = Date.now() - (META.lastDailyGift || 0);
        if (timeSinceLast < 24 * 3600 * 1000) {
            btnDaily.style.opacity = '0.5';
            btnDaily.style.filter = 'grayscale(1)';
            btnDaily.style.pointerEvents = 'none';
        }
    }

    document.getElementById('btn-reset-progress').onclick = () => {
        document.getElementById('settings-modal').classList.remove('active');
        window.showCustomConfirm(window.T("Opravdu chceš smazat všechen svůj postup, odhlásit se a vymazat lokální data?"), () => {
            if (NET.socket) {
                // Wait for confirmation from server
                NET.socket.once('accountDeleted', (res) => {
                    if (res.success) {
                        localStorage.removeItem('neoSurvivor_meta');
                        localStorage.removeItem('neoSurvivor_pid');
                        localStorage.removeItem('neoSurvivor_user');
                        localStorage.removeItem('neoSurvivor_pass');
                        location.reload();
                    } else {
                        window.showCustomAlert(window.T("Smazání se nezdařilo: ") + res.msg);
                    }
                });
                NET.socket.emit('deleteAccount', { 
                    user: localStorage.getItem('neoSurvivor_user'), 
                    pass: localStorage.getItem('neoSurvivor_pass') 
                });
                // Fallback in case server doesn't respond
                setTimeout(() => { if (localStorage.getItem('neoSurvivor_user')) location.reload(); }, 2000);
            } else {
                localStorage.removeItem('neoSurvivor_meta');
                localStorage.removeItem('neoSurvivor_pid');
                localStorage.removeItem('neoSurvivor_user');
                localStorage.removeItem('neoSurvivor_pass');
                location.reload();
            }
        });
    };

    // Delay checkUrlParams slightly to ensure all initial modal logic is finished
    setTimeout(checkUrlParams, 500);

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

    window.addEventListener('keydown', (e) => {
        if (e.key) GAME.input[e.key.toLowerCase()] = true;
        if (e.key === 'Escape') togglePause(false);
    });
    window.addEventListener('keyup', (e) => {
        if (e.key) GAME.input[e.key.toLowerCase()] = false;
    });

    GAME.canvas.addEventListener('mousedown', (e) => {
        if (!GAME.active || GAME.paused || !GAME.entities.player || GAME.entities.player.dead) return;
        const rect = GAME.canvas.getBoundingClientRect();
        const sx = (e.clientX - rect.left) / GAME.zoom;
        const sy = (e.clientY - rect.top) / GAME.zoom;
        if (Date.now() - GAME.lastSniperTime >= CONFIG.SNIPER_COOLDOWN) {
            useUltimate(sx, sy);
            GAME.lastSniperTime = Date.now();
        }
    });


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
        showShipsMenu();
        document.getElementById('ships-modal').classList.add('active');
    };
    const btnCloseShips = document.getElementById('btn-close-ships');
    if (btnCloseShips) btnCloseShips.onclick = () => document.getElementById('ships-modal').classList.remove('active');

    const btnMeta = document.getElementById('btn-meta-menu');
    if (btnMeta) btnMeta.onclick = () => { showMetaMenu(); document.getElementById('meta-modal').classList.add('active'); };
    const btnCloseMeta = document.getElementById('btn-close-meta');
    if (btnCloseMeta) btnCloseMeta.onclick = () => document.getElementById('meta-modal').classList.remove('active');

    // Achievements Button Listener (Moved up for reliability)
    const btnAch = document.getElementById('btn-achievements');
    if (btnAch) {
        btnAch.addEventListener('click', (e) => {
            console.log("Achievement button clicked!");
            showAchievementsMenu();
        });
    }
    const btnCloseAch = document.getElementById('btn-close-achievements');
    if (btnCloseAch) {
        btnCloseAch.addEventListener('click', () => {
            document.getElementById('achievements-modal').classList.remove('active');
        });
    }



    // --- GLOBAL CHAT LOGIC ---
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');

    window.addChatMessage = (user, text) => {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-msg';
        msgDiv.innerHTML = `<span class="chat-user">${user}:</span><span class="chat-text">${text}</span>`;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        if (chatMessages.childNodes.length > 50) chatMessages.removeChild(chatMessages.firstChild);
    };

    chatInput.onkeydown = (e) => {
        if (e.key === 'Enter' && chatInput.value.trim().length > 0) {
            if (NET.socket && NET.socket.connected) {
                NET.socket.emit('globalChatMessage', { user: META.playerName || "Host", text: chatInput.value.trim() });
            }
            chatInput.value = "";
            chatInput.blur();
            GAME.chatActive = false;
        }
        e.stopPropagation();
    };

    document.addEventListener('keydown', (e) => {
        if (e.key && e.key.toLowerCase() === 't' && !GAME.chatActive && !document.activeElement.tagName.match(/INPUT|TEXTAREA/)) {
            e.preventDefault();
            GAME.chatActive = true;
            chatInput.focus();
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && GAME.active && !GAME.paused) {
            togglePause(true);
        } else if (!document.hidden && GAME.active) {
            META.lastMoveTime = Date.now();
        }
    });

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
    
    const updateSettingUI = () => {
        const btnMM = document.getElementById('btn-toggle-music-menu');
        const btnMG = document.getElementById('btn-toggle-music-game');
        const btnSFX = document.getElementById('btn-toggle-sfx');
        if (btnMM) btnMM.style.background = META.settings.musicMenu ? 'rgba(255,255,255,0.1)' : '#ef4444';
        if (btnMG) btnMG.style.background = META.settings.musicGame ? 'rgba(255,255,255,0.1)' : '#ef4444';
        if (btnSFX) btnSFX.style.background = META.settings.sfx ? 'rgba(255,255,255,0.1)' : '#ef4444';
        updateMusicVolume();
    };

    if (document.getElementById('btn-toggle-music-menu')) {
        document.getElementById('btn-toggle-music-menu').onclick = () => {
            META.settings.musicMenu = !META.settings.musicMenu;
            saveMeta(); updateSettingUI();
        };
    }
    if (document.getElementById('btn-toggle-music-game')) {
        document.getElementById('btn-toggle-music-game').onclick = () => {
            META.settings.musicGame = !META.settings.musicGame;
            saveMeta(); updateSettingUI();
        };
    }
    if (document.getElementById('btn-toggle-sfx')) {
        document.getElementById('btn-toggle-sfx').onclick = () => {
            META.settings.sfx = !META.settings.sfx;
            saveMeta(); updateSettingUI();
        };
    }
    updateSettingUI();

    const btnCloseMP = document.getElementById('btn-close-mp');
    if (btnCloseMP) btnCloseMP.onclick = () => {
        if (NET.serverPollingInterval) clearInterval(NET.serverPollingInterval);
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        document.getElementById('menu-modal').classList.add('active');
    };

    const chatBtnMobile = document.getElementById('btn-chat-mobile');

    if (chatBtnMobile) {
        chatBtnMobile.onclick = (e) => {
            e.stopPropagation();
            const chat = document.getElementById('global-chat');
            if (chat) {
                chat.classList.toggle('mobile-active');
                if (chat.classList.contains('mobile-active')) {
                    if (chatInput) chatInput.focus();
                }
            }
        };
    }

    const btnResume = document.getElementById('btn-resume');
    if (btnResume) btnResume.onclick = () => togglePause(false);

    const mobilePause = document.getElementById('mobile-pause');
    if (mobilePause) mobilePause.onclick = (e) => { e.stopPropagation(); togglePause(false); };

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

    const btnPauseMenu = document.getElementById('btn-pause-menu');
    if (btnPauseMenu) btnPauseMenu.onclick = () => window.softResetToMenu();

    const btnGameOverMenu = document.getElementById('btn-gameover-menu');
    if (btnGameOverMenu) btnGameOverMenu.onclick = () => window.softResetToMenu();

    const btnMainQuit = document.getElementById('btn-main-quit');
    if (btnMainQuit) btnMainQuit.onclick = () => {
        window.showCustomConfirm(window.T("Opravdu se chceš odhlásit?"), () => {
            localStorage.removeItem('neoSurvivor_user');
            localStorage.removeItem('neoSurvivor_pass');
            localStorage.removeItem('neoSurvivor_meta');
            localStorage.removeItem('neoSurvivor_pid');
            window.location.href = window.location.origin + window.location.pathname; 
        });
    };

    const btnTutorial = document.getElementById('btn-tutorial');
    if (btnTutorial) btnTutorial.onclick = () => document.getElementById('tutorial-modal').classList.add('active');
    const btnCloseTutorial = document.getElementById('btn-close-tutorial');
    if (btnCloseTutorial) btnCloseTutorial.onclick = () => document.getElementById('tutorial-modal').classList.remove('active');

    const btnFeedback = document.getElementById('btn-feedback');
    if (btnFeedback) btnFeedback.onclick = () => document.getElementById('feedback-modal').classList.add('active');
    const btnCloseFeedback = document.getElementById('btn-close-feedback');
    if (btnCloseFeedback) btnCloseFeedback.onclick = () => document.getElementById('feedback-modal').classList.remove('active');

    if (btnCloseFeedback) btnCloseFeedback.onclick = () => document.getElementById('feedback-modal').classList.remove('active');

    // Auto-random select toggle
    const checkAutoRandom = document.getElementById('check-auto-random');
    if (checkAutoRandom) {
        checkAutoRandom.checked = META.autoRandomSelect || false;
        checkAutoRandom.onchange = (e) => {
            META.autoRandomSelect = e.target.checked;
            saveMeta();
        };
    }

    const btnSendFeedback = document.getElementById('btn-send-feedback');
    if (btnSendFeedback) btnSendFeedback.onclick = () => {
        const text = document.getElementById('feedback-text').value;
        if (!text || text.trim().length < 5) {
            window.showCustomAlert("Zpráva musí mít aspoň 5 znaků.");
            return;
        }
        if (NET.socket && NET.socket.connected) {
            NET.socket.emit('sendFeedback', { text: text, user: META.playerName });
            window.showCustomAlert("Díky! Zpětná vazba byla odeslána vývojáři.");
            document.getElementById('feedback-text').value = '';
            document.getElementById('feedback-modal').classList.remove('active');
        } else {
            window.showCustomAlert("Chyba: Nejseš připojen k serveru.");
        }
    };

    GAME.canvas.addEventListener('touchstart', (e) => {
        if (!GAME.active || GAME.paused || !GAME.entities.player || GAME.entities.player.dead) return;
        const t = e.touches[0];
        const rect = GAME.canvas.getBoundingClientRect();
        const sx = (t.clientX - rect.left) / GAME.zoom;
        const sy = (t.clientY - rect.top) / GAME.zoom;
        if (t.clientX > window.innerWidth / 2) {
            if (Date.now() - GAME.lastSniperTime >= CONFIG.SNIPER_COOLDOWN) {
                useUltimate(sx, sy);
                GAME.lastSniperTime = Date.now();
            }
            return;
        }
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

    GAME.menuAnimation = new MenuAnimation();
}

function useUltimate(cx, cy) {
    const ability = META.selectedAbility || 1;
    const p = GAME.entities.player;

    if (ability === 1) { // SNIPER
        const cam = GAME.camera;
        const worldTargetX = cx + (cam.x / GAME.zoom);
        const worldTargetY = cy + (cam.y / GAME.zoom);
        const proj = new Projectile(p.x, p.y, worldTargetX, worldTargetY, p.damage * 10, { size: 12, pierce: Infinity });
        if (GAME.entities.projectiles) GAME.entities.projectiles.push(proj);
        shakeScreen(15);
        if (NET.isMultiplayer) syncShot(proj);
    }
    else if (ability === 2) { // ZMRAZENÍ ČASU
        GAME.frozenUntil = Date.now() + 5000;
        const overlay = document.getElementById('freeze-overlay');
        if (overlay) {
            overlay.classList.add('active');
            setTimeout(() => overlay.classList.remove('active'), 5000);
        }
        if (NET.isMultiplayer && NET.socket) {
            NET.socket.emit('useAbility', { type: 2 });
        }
    }
    else if (ability === 3) { // POSEDNUTÍ NEJBLIŽŠÍCH
        if (GAME.entities.enemies) {
            const normalEnemies = GAME.entities.enemies.filter(e => !e.possessed && !e.isBoss);
            const count = p.maxPossessions || 10;
            const closest = normalEnemies.sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y)).slice(0, count);

            const idsToPossess = [];
            closest.forEach(e => {
                e.possessed = true;
                idsToPossess.push(e.id);
            });

            if (NET.isMultiplayer && NET.socket && idsToPossess.length > 0) {
                NET.socket.emit('useAbility', { type: 3, enemyIds: idsToPossess });
            }
        }
    }
    else if (ability === 4) { // LÉČIVÁ AURA (MEDIC)
        // Vydává pulzy do okolí (např. 250px)
        const players = getAllAlivePlayers();
        const healed = [];
        players.forEach(pl => {
            if (dist(p.x, p.y, pl.x, pl.y) < 250) {
                pl.hp = Math.min(pl.maxHp, pl.hp + p.maxHp * 0.5); // heal 50%
                healed.push(pl.id || myPlayerId);
                if (!GAME.entities.floatingTexts) GAME.entities.floatingTexts = [];
                GAME.entities.floatingTexts.push(new FloatingText(pl.x, pl.y - 25, "+HEAL", "#10b981"));
            }
        });

        // Visuals
        const overlay = document.getElementById('freeze-overlay');
        if (overlay) {
            overlay.style.boxShadow = "inset 0 0 100px rgba(16, 185, 129, 0.5)";
            overlay.classList.add('active');
            setTimeout(() => { overlay.classList.remove('active'); overlay.style.boxShadow = ""; }, 500);
        }

        if (NET.isMultiplayer && NET.socket && healed.length > 0) {
            NET.socket.emit('useAbility', { type: 'medic' });
            NET.socket.emit('healPlayers', { targets: healed, amount: p.maxHp * 0.5 });
        }
    }
}



let lastTime = 0;
let accumulator = 0;
const timeStep = 1000 / 60;

function handleEnemyDeath(enemy) {
    if (!enemy || enemy.dead || enemy.hp > 0) return;
    enemy.dead = true;
    AudioEngine.play('hit');

    if (!NET.isMultiplayer && GAME.entities.gems) {
        if (enemy.type === 4) { // Zloděj drop
            const drops = (enemy.stolenGems || 0) + 5;
            for (let i = 0; i < drops; i++) {
                GAME.entities.gems.push(new Gem(enemy.x + (Math.random() - 0.5) * 100, enemy.y + (Math.random() - 0.5) * 100));
            }
        } else {
            let isNuke = false, isMagnet = false;
            if (enemy.isBoss) {
                if (Math.random() < 0.5) isNuke = true; else isMagnet = true;
                for (let i = 0; i < 10; i++) GAME.entities.gems.push(new Gem(enemy.x + (Math.random() - 0.5) * 150, enemy.y + (Math.random() - 0.5) * 150));
                
                if (!META.stats) META.stats = { totalBossKills: 0, totalDogecoins: 0, totalGames: 0 };
                META.stats.totalBossKills++;
                checkAchievements();
            }
            const gem = new Gem(enemy.x, enemy.y);
            gem.isNuke = isNuke; gem.isMagnet = isMagnet;
            GAME.entities.gems.push(gem);
        }
    }
    GAME.kills++;

    const p = GAME.entities.player;
    if (p && p.lifestealChance > 0 && Math.random() < p.lifestealChance) {
        const healAmount = Math.max(8, p.maxHp * 0.08);
        p.hp = Math.min(p.maxHp, p.hp + healAmount);
        if (!GAME.entities.floatingTexts) GAME.entities.floatingTexts = [];
        GAME.entities.floatingTexts.push(new FloatingText(p.x, p.y - 30, "+LÉČENÍ", "#10b981"));
    }
    updateUI();
}

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
    const now = Date.now();
    
    const isMoving = GAME.input.w || GAME.input.a || GAME.input.s || GAME.input.d || GAME.joystick.active;
    if (isMoving) {
        if (GAME.paused && META.isAFK) {
            togglePause(false);
        }
        META.lastMoveTime = now;
        META.isAFK = false;
    } else if (GAME.active && !GAME.paused && (now - (META.lastMoveTime || now) > 10000)) {
        META.isAFK = true;
        togglePause(true); // Aktivuje pauzu s nápisem AFK
    }

    if (GAME.paused || !GAME.entities || !GAME.entities.player) {
        if (GAME.paused) GAME.lastSpawnTime = now; // Neustále posouváme časovač spawnu během pauzy
        return;
    }

    if (!NET.isMultiplayer) {
        GAME.time += 1 / 60;

        const currentInterval = Math.max(100, CONFIG.SPAWN_INTERVAL / (1 + GAME.time / 60));
        if (now - GAME.lastSpawnTime > currentInterval) {
            const alive = getAllAlivePlayers();
            if (alive.length > 0) {
                const pivot = alive[Math.floor(Math.random() * alive.length)];
                const a = Math.random() * Math.PI * 2;
                const x = pivot.x + Math.cos(a) * CONFIG.SPAWN_RADIUS;
                const y = pivot.y + Math.sin(a) * CONFIG.SPAWN_RADIUS;
                const mod = Math.floor(GAME.time / 60) + 1;

                let enemy;
                let hp = CONFIG.ENEMY_BASE_HEALTH * mod;
                let type = 1;

                // Spawnování meteoritů
                if (!GAME.entities.meteorites) GAME.entities.meteorites = [];
                if (Math.random() < 0.1 && GAME.entities.meteorites.length < 15) {
                    const ma = Math.random() * Math.PI * 2;
                    const mx = pivot.x + Math.cos(ma) * (CONFIG.SPAWN_RADIUS + 200);
                    const my = pivot.y + Math.sin(ma) * (CONFIG.SPAWN_RADIUS + 200);
                    GAME.entities.meteorites.push(new Meteorite(mx, my, 800 * mod));
                }
                let speedMod = 1;

                const rnd = Math.random();
                if (GAME.entities.player.level >= 3 && rnd < 0.1) {
                    type = 2; hp *= 0.5;
                } else if (GAME.entities.player.level >= 4 && rnd < 0.2) {
                    type = 3; hp *= 0.5; speedMod = 1.8;
                } else if (GAME.entities.player.level >= 5 && rnd < 0.25) {
                    type = 4; hp *= 1.5; speedMod = 2.2;
                } else if (GAME.entities.player.level >= 8 && rnd < 0.27) {
                    type = 5; hp *= 3; speedMod = 0.5;
                } else if (GAME.entities.player.level >= 10 && rnd < 0.35) {
                    type = 6; hp *= 1.2; speedMod = 1.0;
                }

                const hasBoss = GAME.entities.enemies.some(e => e.isBoss);
                const isBossLevel = GAME.entities.player.level > 0 && GAME.entities.player.level % CONFIG.BOSS_LEVEL_INTERVAL === 0;
                const bossAlreadySpawned = GAME.lastBossLevelSpawned === GAME.entities.player.level;

                if (isBossLevel && !bossAlreadySpawned && !hasBoss) {
                    enemy = new Boss(x, y, mod);
                    showBossWarning();
                    GAME.lastBossLevelSpawned = GAME.entities.player.level;
                } else {
                    enemy = new Enemy(x, y, mod * speedMod, Math.random().toString(36).substr(2, 9), type);
                    enemy.maxHp = hp; enemy.hp = hp;
                }
                if (GAME.entities.enemies) GAME.entities.enemies.push(enemy);
            }
            GAME.lastSpawnTime = now;

            // Náhodné generování meteorů (překážek) v singleplayeru
            if (!GAME.entities.obstacles) GAME.entities.obstacles = [];
            if (Math.random() < 0.1 && GAME.entities.obstacles.length < 30) {
                const alive = getAllAlivePlayers();
                if (alive.length > 0) {
                    const pivot = alive[Math.floor(Math.random() * alive.length)];
                    GAME.entities.obstacles.push(new Obstacle(
                        pivot.x + (Math.random() - 0.5) * 2000,
                        pivot.y + (Math.random() - 0.5) * 2000,
                        40 + Math.random() * 60
                    ));
                }
            }
        }
    }

    const p = GAME.entities.player;
    if (isNaN(p.x) || isNaN(p.y)) { p.x = 0; p.y = 0; }
    p.update(dt);
    if (isNaN(p.x) || isNaN(p.y)) { p.x = 0; p.y = 0; }

    if (NET.isMultiplayer && GAME.entities.tombstones && !p.dead) {
        GAME.entities.tombstones.forEach(t => {
            if (dist(p.x, p.y, t.x, t.y) < 100) {
                if (NET.socket) NET.socket.emit('reviveProgress', { tombstoneId: t.id, amount: 0.5 });
                if (!GAME.entities.floatingTexts) GAME.entities.floatingTexts = [];
                if (Math.random() < 0.1) GAME.entities.floatingTexts.push(new FloatingText(t.x, t.y - 25, "OŽIVOVÁNÍ...", "#3b82f6"));
            }
        });
    }

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

    if (!NET.isMultiplayer && now < GAME.frozenUntil) {
        // V Solu nepřátelé úplně zmrznou
    } else if (GAME.entities.enemies) {
        GAME.entities.enemies.forEach((e) => {
            if (!e) return;
            e.update();
            if (isNaN(e.x) || isNaN(e.y)) { e.x = 0; e.y = 0; }
            targets.forEach(t => {
                if (dist(t.x, t.y, e.x, e.y) < t.radius + e.radius && !t.possessed && !e.possessed) {
                    if (t.isBait) {
                        if (NET.isMultiplayer) {
                            NET.socket.emit('baitHit', { id: t.obj.id, damage: (e.isBoss ? 5 : 1) * GAME.speedFactor });
                        } else {
                            t.obj.hp -= (e.isBoss ? 5 : 1) * GAME.speedFactor;
                        }
                    } else {
                        if (t.kaktus) {
                            e.hp = 0; e.dead = true;
                            if (NET.isMultiplayer) NET.socket.emit('enemyHit', { id: e.id, damage: 99999 });
                        } else {
                            if (t.hp !== undefined) {
                                let dmg = (e.isBoss ? 2 : 0.5) * (t.shield || 1);
                                if (t.isLocal) {
                                    const armorRed = (META.upgrades.armor || 0) * 0.02;
                                    dmg *= (1 - armorRed);
                                }
                                t.hp -= dmg;
                                if (t.hp <= 0) t.dead = true;
                            }

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

    if (GAME.entities.meteorites) {
        GAME.entities.meteorites = GAME.entities.meteorites.filter(m => m && m.hp > 0);
        GAME.entities.meteorites.forEach(m => m.update());
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

            if (GAME.entities.obstacles) {
                let hitObstacle = false;
                GAME.entities.obstacles.forEach(obs => {
                    if (dist(proj.x, proj.y, obs.x, obs.y) < proj.radius + obs.radius) {
                        hitObstacle = true;
                    }
                });
                if (hitObstacle && proj.type !== 'wall') {
                    GAME.entities.projectiles.splice(pIndex, 1);
                    continue;
                }
            }

            if (proj.life <= 0) {
                GAME.entities.projectiles.splice(pIndex, 1);
                continue;
            }

            if (proj.isEnemy) {
                alivePlayers.forEach(pl => {
                    if (dist(proj.x, proj.y, pl.x, pl.y) < proj.radius + pl.radius) {
                        let dmg = proj.damage * (pl.shield || 1);
                        if (pl.isLocal) {
                            const armorRed = (META.upgrades.armor || 0) * 0.02;
                            dmg *= (1 - armorRed);
                        }
                        pl.hp -= dmg;
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
                        const l2 = dx * dx + dy * dy;

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
                        let damage = proj.damage;
                        if (enemy.type === 8) damage *= 0.5; // Shield reduction
                        enemy.hp -= damage;
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
                                proj.vx = Math.cos(angle) * (proj.speed || CONFIG.PROJECTILE_SPEED);
                                proj.vy = Math.sin(angle) * (proj.speed || CONFIG.PROJECTILE_SPEED);
                                proj.bounce--;
                                proj.life += 50; // Přidat životnost při odrazu, aby to fungovalo i u brokovnice
                            }
                        }
                        if (proj.pierce > 1) proj.pierce--; else if (proj.pierce !== Infinity && proj.bounce <= 0) GAME.entities.projectiles.splice(pIndex, 1);
                        if (enemy.hp <= 0) {
                            handleEnemyDeath(enemy);
                        }
                    }
                });

                // Kolize projektilů s meteority
                if (GAME.entities.meteorites) {
                    GAME.entities.meteorites.forEach(m => {
                        if (dist(proj.x, proj.y, m.x, m.y) < proj.radius + m.radius) {
                            m.hp -= proj.damage;
                            if (proj.type !== 'wall') proj.life = 0;
                            if (!GAME.entities.floatingTexts) GAME.entities.floatingTexts = [];
                            GAME.entities.floatingTexts.push(new FloatingText(m.x, m.y, Math.floor(proj.damage).toString(), "#94a3b8"));
                        }
                    });
                }
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
                if (NET.isMultiplayer) {
                    GAME.entities.pickedGems.add(g.id);
                    NET.socket.emit('gemPickup', g.id);
                } else {
                    if (g.isNuke) {
                        GAME.entities.enemies.forEach(e => {
                            if (!e.isBoss) {
                                e.hp = 0; e.dead = true;
                                GAME.entities.gems.push(new Gem(e.x, e.y));
                            }
                        });
                        if (GAME.entities.fire) {
                            for (let j = 0; j < 30; j++) {
                                const a = Math.random() * Math.PI * 2;
                                const d = Math.random() * 800;
                                GAME.entities.fire.push(new Fire(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 0, false));
                            }
                        }
                        shakeScreen(20); AudioEngine.play('hit');
                        p.addXp(10);
                    } else if (g.isMagnet) {
                        const totalXp = GAME.entities.gems.length * Math.round(10 * (p.luckFactor || 1));
                        p.addXp(totalXp);
                        GAME.entities.gems = [];
                    }
                    GAME.coinsCollected++;
                    playSound('coin');
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

    if (ctx.resetTransform) ctx.resetTransform();
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;

    try {
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
            if (GAME.entities.fire) GAME.entities.fire.forEach(f => { if (f) f.draw(ctx, { x: camX, y: camY }); });
            if (GAME.entities.meteorites) GAME.entities.meteorites.forEach(m => { if (m) m.draw(ctx, { x: camX, y: camY }); });
            if (GAME.entities.obstacles) GAME.entities.obstacles.forEach(o => { if (o) o.draw(ctx, { x: camX, y: camY }); });
            if (GAME.entities.baits) GAME.entities.baits.forEach(b => { if (b) b.draw(ctx, { x: camX, y: camY }); });
            if (GAME.entities.tombstones) GAME.entities.tombstones.forEach(t => { if (t) t.draw(ctx, { x: camX, y: camY }); });
            if (GAME.entities.gems) GAME.entities.gems.forEach(g => { if (g) g.draw(ctx, { x: camX, y: camY }); });
            if (GAME.entities.projectiles) GAME.entities.projectiles.forEach(p => { if (p) p.draw(ctx, { x: camX, y: camY }); });
            if (GAME.entities.enemies) GAME.entities.enemies.forEach(e => { if (e) e.draw(ctx, { x: camX, y: camY }); });

            for (const id in NET.others) {
                if (NET.others[id]) {
                    const op = NET.others[id];

                    if (op.shipType === 2 && op.laserTargetsIds && op.laserTargetsIds.length > 0 && GAME.entities.enemies) {
                        const chainsToDraw = op.laserTargetsIds.map(chainIds => {
                            return chainIds.map(eid => GAME.entities.enemies.find(e => e && e.id === eid)).filter(e => e);
                        }).filter(chain => chain && chain.length > 0);

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

            if (GAME.entities.minions) GAME.entities.minions.forEach(m => { if (m) m.draw(ctx, { x: camX, y: camY }); });
            if (GAME.entities.player) GAME.entities.player.draw(ctx, { x: camX, y: camY });

            if (GAME.entities.floatingTexts) {
                GAME.entities.floatingTexts.forEach(ft => { if (ft) ft.draw(ctx, { x: camX, y: camY }); });
            }
        }
    } finally {
        ctx.restore();
    }

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

        if (GAME.entities.gems) GAME.entities.gems.forEach(g => { if (g) drawDot(g.x, g.y, '#34d399', 1); });
        if (GAME.entities.enemies) GAME.entities.enemies.forEach(e => { if (e) drawDot(e.x, e.y, e.isBoss ? '#ef4444' : (e.type === 2 ? '#a855f7' : '#f59e0b'), e.isBoss ? 4 : 2); });
        if (GAME.entities.minions) GAME.entities.minions.forEach(m => { if (m) drawDot(m.x, m.y, '#818cf8', 2); });
        for (const id in NET.others) {
            const op = NET.others[id];
            if (op && !op.dead) drawDot(op.x, op.y, '#3b82f6', 3);
        }
        drawDot(pCx, pCy, '#10b981', 3);

        ctx.restore();

        if (NET.isMultiplayer) {
            let playersList = [{ name: (localStorage.getItem('neoSurvivor_user') || "Já"), kills: GAME.kills || 0, isMe: true }];
            for (const id in NET.others) {
                const op = NET.others[id];
                if (op) {
                    playersList.push({ name: op.remoteName || "Hráč", kills: op.kills || 0, isMe: false, dead: op.dead });
                }
            }
            playersList.sort((a, b) => b.kills - a.kills);

            ctx.save();
            const sbWidth = mapSize;
            const sbHeight = 35 + playersList.length * 25;
            const sbY = startY + mapSize + 15;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
            ctx.lineWidth = 2;
            if (ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(startX, sbY, sbWidth, sbHeight, 8);
                ctx.fill(); ctx.stroke();
            } else {
                ctx.fillRect(startX, sbY, sbWidth, sbHeight);
                ctx.strokeRect(startX, sbY, sbWidth, sbHeight);
            }

            ctx.fillStyle = '#a5b4fc';
            ctx.font = 'bold 12px Outfit, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(window.T('Hráči:') + ' ' + playersList.length, startX + 15, sbY + 12);
            
            ctx.textAlign = 'right';
            ctx.fillText(window.T('Zabití'), startX + sbWidth - 15, sbY + 12);

            ctx.beginPath();
            ctx.moveTo(startX + 10, sbY + 30);
            ctx.lineTo(startX + sbWidth - 10, sbY + 30);
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.stroke();

            playersList.forEach((pl, idx) => {
                ctx.fillStyle = pl.dead ? '#64748b' : (pl.isMe ? '#10b981' : '#f8fafc');
                ctx.textAlign = 'left';
                let dispName = pl.name;
                if (dispName.length > 10) dispName = dispName.substring(0, 8) + '..';
                ctx.fillText(dispName, startX + 15, sbY + 40 + idx * 25);
                ctx.textAlign = 'right';
                ctx.fillText(pl.kills.toString(), startX + sbWidth - 15, sbY + 40 + idx * 25);
            });
            ctx.restore();
        }
    }

    if (window.innerWidth < 850 && GAME.joystick) {
        ctx.save(); const sx = GAME.joystick.startX, sy = GAME.joystick.startY, jcx = GAME.joystick.currentX, jcy = GAME.joystick.currentY;
        ctx.beginPath(); ctx.arc(sx, sy, 75, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(jcx, jcy, 32, 0, Math.PI * 2); ctx.fillStyle = 'rgba(99, 102, 241, 0.5)'; ctx.shadowBlur = 20; ctx.shadowColor = '#6366f1'; ctx.fill(); ctx.restore();
    }
}

const initAudio = () => {
    AudioEngine.init();
    tryFullscreen();
    if (document.getElementById('menu-modal') && document.getElementById('menu-modal').classList.contains('active')) {
        switchMusic('menu');
    }
    // Odstraníme listenery po úspěšné inicializaci (pokud chceme, ale Fullscreen můžeme zkoušet dál)
    if (AudioEngine.ctx && AudioEngine.ctx.state === 'running' && (document.fullscreenElement || document.webkitFullscreenElement)) {
        ['click', 'keydown', 'touchstart'].forEach(type => window.removeEventListener(type, initAudio));
    }
};



['click', 'keydown', 'touchstart'].forEach(type => window.addEventListener(type, initAudio));

init();
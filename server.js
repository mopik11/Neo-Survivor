require('dotenv').config({ path: __dirname + '/.env' }); // Pojistka na absolutní cestu
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('node:crypto');
let config = {};
try {
    config = require('./server_config');
} catch (e) {
    // Soubor neexistuje (běžné v produkci/Alwaysdata), budeme se spoléhat na Environment Variables
}

// --- SECURITY CONFIGURATION ---
// Prioritně používáme Environment Variables (pro Alwaysdata/Heroku/Vercel)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY 
    ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex') 
    : (function() {
        try { return config.ENCRYPTION_KEY; } catch(e) { return null; }
    })() || Buffer.from('7f8e9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f', 'hex');

const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH || (function() {
    try { return config.ADMIN_PASS_HASH; } catch(e) { return null; }
})() || "8a7b6c5d4e3f2a1b:c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2";

const IV_LENGTH = 12;

// --- GLOBAL ERROR HANDLING ---
process.on('uncaughtException', (err) => {
    console.error('!!! UNCAUGHT EXCEPTION !!!', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('!!! UNHANDLED REJECTION !!!', reason);
});

const Security = {
    // Password Hashing (scrypt)
    hashPassword: (password) => {
        return new Promise((resolve, reject) => {
            const salt = crypto.randomBytes(16).toString('hex');
            crypto.scrypt(password, salt, 64, (err, derivedKey) => {
                if (err) reject(err);
                resolve(salt + ":" + derivedKey.toString('hex'));
            });
        });
    },

    verifyPassword: (password, hash) => {
        return new Promise((resolve, reject) => {
            if (!hash) {
                resolve(false);
                return;
            }
            
            // Očištění hashe od neviditelných znaků (CRLF z Windows), uvozovek a mezer
            const cleanHash = hash.replace(/['"\r\n]/g, '').trim(); 
            
            if (!cleanHash.includes(':')) {
                // Zpětná kompatibilita pro plain-text hesla
                resolve(password === cleanHash);
                return;
            }
            
            const [salt, key] = cleanHash.split(':');
            crypto.scrypt(password, salt.trim(), 64, (err, derivedKey) => {
                if (err) reject(err);
                // Striktní porovnání očištěných klíčů
                resolve(key.trim() === derivedKey.toString('hex'));
            });
        });
    },

    encrypt: (text) => {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ":" + encrypted;
    },

    decrypt: (data) => {
        try {
            if (!data.includes(':')) return data;
            const [ivHex, encryptedHex] = data.split(':');
            if (!ivHex || !encryptedHex) return data;
            const iv = Buffer.from(ivHex, 'hex');
            const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
            let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (e) {
            console.error("Decryption failed:", e.message);
            return data;
        }
    }
};
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://mopik11.github.io",
        methods: ["GET", "POST"]
    }
});

// TENTO ENDPOINT UDRŽÍ SERVER NAŽIVU PŘES CRON-JOB.ORG
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

const db = new sqlite3.Database('./neo_survivor.db', (err) => {
    if (err) {
        console.error("Chyba při připojování k databázi:", err.message);
    } else {
        console.log("Připojeno k SQLite databázi.");
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS accounts (
                username TEXT PRIMARY KEY,
                password TEXT,
                meta TEXT,
                max_level INTEGER,
                last_level_up INTEGER,
                currency INTEGER DEFAULT 0
            )`);
            
            // Migrace (v1.385): Přidání sloupce last_level_up pokud chybí
            db.run(`ALTER TABLE accounts ADD COLUMN last_level_up INTEGER DEFAULT 0`, (err) => {});
            db.run(`ALTER TABLE accounts ADD COLUMN currency INTEGER DEFAULT 0`, (err) => {});
            db.run(`DELETE FROM accounts WHERE username IS NULL OR username = '' OR password IS NULL OR password = ''`);
            db.run(`UPDATE accounts SET username = LOWER(username)`);

            db.run(`CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT,
                text TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
        });
    }
});

const ROOMS = {};

// NASTAVENÍ PRO ADMIN KONZOLI
let SERVER_ADMIN_PIN = null;
const ADMIN_USER = "mopik";

const CONFIG = {
    ENEMY_BASE_HEALTH: 20,
    ENEMY_BASE_SPEED: 4.5,
    SPAWN_INTERVAL: 800,
    BOSS_INTERVAL: 60,
    BOSS_LEVEL_INTERVAL: 5,
    BASE_PLAYER_HP: 120,
    BASE_PLAYER_DMG: 20
};

const UPGRADE_CONFIG = {
    hp: { base: 10, step: 0.5 },
    speed: { base: 0.02, step: 0.5 },
    luck: { base: 0.05, step: 0.5 },
    regen: { base: 0.1, step: 0.5 },
    armor: { base: 0.02, step: 0.5 },
    damage: { base: 5, step: 0.5 } // Added server-side damage tracking
};

function dist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
}

function broadcastLeaderboard() {
    db.all(`SELECT username as name, max_level as level FROM accounts ORDER BY max_level DESC`, [], (err, rows) => {
        if (!err && rows) {
            const onlineUsers = new Set();
            for (const [id, socket] of io.sockets.sockets) {
                if (socket.authenticatedUser) {
                    onlineUsers.add(socket.authenticatedUser);
                }
            }
            
            rows.forEach(row => {
                row.online = onlineUsers.has(row.name);
            });
            io.emit('leaderboardData', rows);
        }
    });
}

function broadcastServerStats() {
    let playersInRooms = 0;
    for (const id in ROOMS) {
        if (ROOMS[id] && ROOMS[id].players) {
            for (const pid in ROOMS[id].players) {
                if (!ROOMS[id].players[pid].disconnected) {
                    playersInRooms++;
                }
            }
        }
    }
    // Zjistíme počet unikátních hráčů podle playerId
    const uniquePlayers = new Set();
    for (const [id, socket] of io.sockets.sockets) {
        if (socket.playerId) {
            uniquePlayers.add(socket.playerId);
        } else {
            uniquePlayers.add(id); // Pokud nemá playerId, počítáme socket
        }
    }
    const totalOnline = uniquePlayers.size;
    io.emit('serverStats', {
        online: totalOnline,
        inBattle: playersInRooms
    });
}
setInterval(broadcastServerStats, 5000);

// --- AUTHORITATIVE ECONOMY SYSTEM (v1.402.3) ---
const PRICES = {
    ships: { 1: 0, 2: 500, 3: 1000, 4: 1500, 5: 2000 },
    abilities: { 1: 0, 2: 800, 3: 1200, 4: 1500 },
    stats: {
        hp: { base: 10, step: 0.5 },
        speed: { base: 15, step: 0.5 },
        luck: { base: 25, step: 0.5 },
        regen: { base: 40, step: 0.5 },
        armor: { base: 50, step: 0.5 }
    },
    crates: { basic: 150, premium: 1000, legendary: 5000 }
};

const EMOJIS = [
    { id: 'soap', rarity: 'common', price: 20 },
    { id: 'money', rarity: 'rare', price: 100 },
    { id: 'smile', rarity: 'common', price: 15 },
    { id: 'nerd', rarity: 'common', price: 15 },
    { id: 'laugh', rarity: 'common', price: 15 },
    { id: 'ugh', rarity: 'common', price: 15 },
    { id: 'surprise', rarity: 'uncommon', price: 30 },
    { id: 'dead', rarity: 'uncommon', price: 30 },
    { id: 'hands_up', rarity: 'uncommon', price: 35 },
    { id: 'dislike', rarity: 'common', price: 10 },
    { id: 'heart', rarity: 'rare', price: 80 },
    { id: 'open_hands', rarity: 'uncommon', price: 40 },
    { id: 'handshake', rarity: 'uncommon', price: 40 },
    { id: 'guard', rarity: 'epic', price: 250 },
    { id: 'hero', rarity: 'epic', price: 300 },
    { id: 'sunflower', rarity: 'rare', price: 120 },
    { id: 'leaf', rarity: 'common', price: 20 },
    { id: 'owl', rarity: 'epic', price: 400 },
    { id: 'chick', rarity: 'rare', price: 150 },
    { id: 'icecream', rarity: 'uncommon', price: 50 },
    { id: 'cake', rarity: 'rare', price: 180 },
    { id: 'fishcake', rarity: 'epic', price: 350 },
    { id: 'alien', rarity: 'epic', price: 500 },
    { id: 'ghost', rarity: 'uncommon', price: 60 },
    { id: 'robot', rarity: 'rare', price: 200 },
    { id: 'fire', rarity: 'rare', price: 150 },
    { id: 'star', rarity: 'uncommon', price: 45 },
    { id: 'pizza', rarity: 'uncommon', price: 55 },
    { id: 'burger', rarity: 'uncommon', price: 55 },
    { id: 'sushi', rarity: 'rare', price: 220 },
    { id: 'taco', rarity: 'rare', price: 210 },
    { id: 'coffee', rarity: 'common', price: 25 },
    { id: 'beer', rarity: 'uncommon', price: 40 },
    { id: 'rocket', rarity: 'epic', price: 600 },
    { id: 'ufo', rarity: 'legendary', price: 2000 },
    { id: 'ring', rarity: 'legendary', price: 5000 },
    { id: 'oni', rarity: 'epic', price: 450 },
    { id: 'vampire', rarity: 'epic', price: 480 },
    { id: 'zombie', rarity: 'uncommon', price: 40 },
    { id: 'dragon', rarity: 'legendary', price: 3500 },
    { id: 'volcano', rarity: 'rare', price: 180 },
    { id: 'galaxy', rarity: 'legendary', price: 6000 },
    { id: 'saturn', rarity: 'rare', price: 250 },
    { id: 'invader', rarity: 'epic', price: 550 },
    { id: 'spy', rarity: 'rare', price: 200 },
    { id: 'fox', rarity: 'uncommon', price: 45 },
    { id: 'bear', rarity: 'uncommon', price: 45 },
    { id: 'panda', rarity: 'rare', price: 120 },
    { id: 'koala', rarity: 'rare', price: 125 },
    { id: 'tiger', rarity: 'epic', price: 450 },
    { id: 'lion', rarity: 'epic', price: 500 },
    { id: 'frog', rarity: 'common', price: 20 },
    { id: 'monkey', rarity: 'uncommon', price: 50 },
    { id: 'penguin', rarity: 'rare', price: 180 },
    { id: 'unicorn', rarity: 'legendary', price: 4000 },
    { id: 'butterfly', rarity: 'rare', price: 160 },
    { id: 'turtle', rarity: 'uncommon', price: 70 },
    { id: 'octopus', rarity: 'epic', price: 600 },
    { id: 'whale', rarity: 'epic', price: 650 },
    { id: 'apple', rarity: 'common', price: 15 },
    { id: 'banana', rarity: 'common', price: 15 },
    { id: 'watermelon', rarity: 'uncommon', price: 35 },
    { id: 'sushi_roll', rarity: 'rare', price: 240 },
    { id: 'ramen', rarity: 'rare', price: 260 },
    { id: 'ice_cube', rarity: 'common', price: 10 },
    { id: 'crystal', rarity: 'epic', price: 700 },
    { id: 'rainbow', rarity: 'legendary', price: 4500 },
    { id: 'clover', rarity: 'rare', price: 300 },
    { id: 'diamond_gem', rarity: 'rare', price: 400 },
    { id: 'gold_bar', rarity: 'epic', price: 800 },
    { id: 'hat_crown', rarity: 'legendary', price: 1000 },
    { id: 'hat_wizard', rarity: 'legendary', price: 1200 },
    { id: 'hat_ninja', rarity: 'legendary', price: 1500 },
    { id: 'ultra_rare', rarity: 'legendary', price: 20000, chance: 1 }
];

const REWARD_NORMAL_KILL = 1;
const REWARD_BOSS_KILL = 500;

function generateLoot(crateType) {
    const roll = Math.random() * 100;
    const diamond = EMOJIS.find(e => e.id === 'ultra_rare');
    if (diamond && roll < (diamond.chance || 0.1)) return diamond;

    let rarity = 'common';
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
    return possible.length === 0 ? EMOJIS[0] : possible[Math.floor(Math.random() * possible.length)];
}

function rewardPlayer(socket, amount) {
    const r = socket.roomId;
    const p = socket.playerId;
    if (!r || !ROOMS[r] || !ROOMS[r].players[p]) return;

    const player = ROOMS[r].players[p];
    
    // 1. Memory tracking for Game Over stats (FOR EVERYONE)
    if (!ROOMS[r].dogeEarned) ROOMS[r].dogeEarned = {};
    ROOMS[r].dogeEarned[p] = (ROOMS[r].dogeEarned[p] || 0) + amount;

    // 2. Accumulate in memory (ONLY if logged in)
    if (player.username) {
        player.pendingRewards = (player.pendingRewards || 0) + amount;
    }

    // 3. Notify client for responsive UI (v1.431)
    socket.emit('killConfirmed', { amount: amount, totalSessionDoge: ROOMS[r].dogeEarned[p] });
}

function killEnemy(room, enemyId, rewardTarget = null) {
    const enemy = room.enemies.find(e => e.id === enemyId);
    if (!enemy) return;

    if (rewardTarget) {
        if (enemy.isBoss) {
            rewardPlayer(rewardTarget, REWARD_BOSS_KILL);
            // Better crates for higher levels
            let crateType = 'basic';
            if (room.level >= 30) crateType = 'legendary';
            else if (room.level >= 15) crateType = 'premium';
            
            rewardCrate(rewardTarget, crateType);
            io.to(room.id).emit('bossDefeated', { id: enemy.id });
            room.paused = true;
            room.readyCount = 0;
        } else {
            rewardPlayer(rewardTarget, REWARD_NORMAL_KILL);
        }
    } else {
        // Find the closest player's socket from our in-memory player state (safer)
        const activePlayerIds = Object.keys(room.players).filter(id => !room.players[id].dead && !room.players[id].disconnected);
        if (activePlayerIds.length > 0) {
            let closestId = activePlayerIds[0];
            let minDist = Infinity;
            activePlayerIds.forEach(id => {
                const d = dist(enemy.x, enemy.y, room.players[id].x, room.players[id].y);
                if (d < minDist) { minDist = d; closestId = id; }
            });
            const pObj = room.players[closestId];
            if (pObj && pObj.socketId) {
                const s = io.sockets.sockets.get(pObj.socketId);
                if (s) rewardPlayer(s, REWARD_NORMAL_KILL);
            }
        }
    }

    room.enemies = room.enemies.filter(e => e.id !== enemyId);
}

function flushPlayerRewards(socket) {
    const r = socket.roomId;
    const p = socket.playerId;
    if (!r || !ROOMS[r] || !ROOMS[r].players[p]) return;

    const player = ROOMS[r].players[p];
    const amount = player.pendingRewards || 0;
    if (amount <= 0 || !player.username) {
        player.pendingRewards = 0;
        return;
    }

    player.pendingRewards = 0;

    // ATOMIC UPDATE: Use SQL increment to prevent race conditions
    db.run(`UPDATE accounts SET currency = currency + ? WHERE username = ?`, [amount, player.username], (err) => {
        if (!err) {
            db.get(`SELECT currency, meta FROM accounts WHERE username = ?`, [player.username], (err, row) => {
                if (row) {
                    socket.emit('currencyUpdated', { amount: row.currency });
                    
                    // Also update the meta blob in background to keep it in sync (for legacy reasons)
                    let meta;
                    try { meta = JSON.parse(Security.decrypt(row.meta)); } catch(e) { meta = {}; }
                    meta.currency = row.currency;
                    const encrypted = Security.encrypt(JSON.stringify(meta));
                    db.run(`UPDATE accounts SET meta = ? WHERE username = ?`, [encrypted, player.username]);
                }
            });
        }
    });
}

function flushUsernameRewards(username, amount) {
    if (!username || amount <= 0) return;
    db.run(`UPDATE accounts SET currency = currency + ? WHERE username = ?`, [amount, username]);
}

function rewardCrate(socket, crateType = 'basic') {
    const user = socket.authenticatedUser;
    if (!user) return;

    db.get(`SELECT meta FROM accounts WHERE username = ?`, [user], (err, row) => {
        if (!err && row) {
            let meta;
            try { meta = JSON.parse(Security.decrypt(row.meta)); } catch(e) { 
                try { meta = JSON.parse(row.meta); } catch(e2) { meta = {}; }
            }
            
            if (!meta.unopenedCrates) meta.unopenedCrates = { basic: 0, premium: 0, legendary: 0 };
            meta.unopenedCrates[crateType] = (meta.unopenedCrates[crateType] || 0) + 1;
            
            const encrypted = Security.encrypt(JSON.stringify(meta));
            db.run(`UPDATE accounts SET meta = ? WHERE username = ?`, [encrypted, user], () => {
                console.log(`[REWARD] Crate ${crateType} awarded to ${user}`);
                // Notify client to re-sync
                socket.emit('syncSuccess', { meta: meta });
            });
        }
    });
}

function sanitizeMeta(meta) {
    if (!meta) return { currency: 0, maxLevel: 1, stats: { totalDogecoins: 0 } };
    
    // Check for obvious data corruption
    if (typeof meta.currency !== 'number' || isNaN(meta.currency)) meta.currency = 0;
    if (typeof meta.maxLevel !== 'number' || isNaN(meta.maxLevel)) meta.maxLevel = 1;
    
    if (meta.currency < 0) meta.currency = 0;
    if (meta.maxLevel < 1) meta.maxLevel = 1;
    
    return meta;
}

io.on('connection', (socket) => {
    console.log('Hráč připojen:', socket.id);

    socket.on('initPlayer', (data) => {
        socket.playerId = data.playerId;
        broadcastServerStats();
    });

    socket.on('globalChatMessage', (data) => {
        io.emit('chatMessage', { user: data.user, text: data.text });
    });

    broadcastServerStats();

    // --- ADMIN KONZOLE (2FA OCHRANA + RELACE) ---
    socket.on('requestAdminPin', (data) => {
        console.log(`[ADMIN] Login attempt for user: ${data.user}`);
        Security.verifyPassword(data.pass, ADMIN_PASS_HASH).then(isMatch => {
            if (data.user === ADMIN_USER && isMatch) {
                SERVER_ADMIN_PIN = Math.floor(100000 + Math.random() * 900000).toString();
                console.log(`\n===========================================`);
                console.log(`🔑 ADMIN PIN KÓD BYL VYGENEROVÁN: ${SERVER_ADMIN_PIN}`);
                console.log(`===========================================\n`);
                socket.emit('adminAuthStep', { step: 2 });
            } else {
                console.warn(`[ADMIN] Login failed for ${data.user} - Invalid credentials`);
                socket.emit('adminAuthError', "Špatné jméno nebo heslo.");
            }
        }).catch(err => {
            console.error(`[ADMIN] Critical error during verification:`, err);
            socket.emit('adminAuthError', "Chyba serveru při ověřování.");
        });
    });

    socket.on('verifyAdminPin', (data) => {
        Security.verifyPassword(data.pass, ADMIN_PASS_HASH).then(isMatch => {
            if (data.user === ADMIN_USER && isMatch && data.pin === SERVER_ADMIN_PIN) {
                socket.isAdmin = true;
                SERVER_ADMIN_PIN = null;
                socket.emit('adminAuthStep', { step: 3 });
            } else {
                socket.emit('adminAuthError', "Špatný nebo expirovaný PIN kód.");
            }
        }).catch(err => {
            socket.emit('adminAuthError', "Chyba serveru při ověřování PINu.");
        });
    });

    socket.on('adminCommand', (data) => {
        if (!socket.isAdmin) {
            return socket.emit('adminResponse', { msg: "CHYBA: Neautorizovaný přístup! Přihlaste se.", color: "red" });
        }

        const args = data.cmd.trim().split(' ');
        const cmd = args[0].toLowerCase();
        const target = args[1];

        if (cmd === 'give') {
            const amount = parseInt(args[2]);
            if (!target || isNaN(amount)) return socket.emit('adminResponse', { msg: "Použití: give <jméno> <počet>", color: "yellow" });
            const lowTarget = target.toLowerCase().trim();
            db.get(`SELECT meta FROM accounts WHERE username = ?`, [lowTarget], (err, row) => {
                if (!row) return socket.emit('adminResponse', { msg: `Hráč ${lowTarget} nenalezen.`, color: "red" });
                
                let meta;
                try {
                    const decrypted = Security.decrypt(row.meta);
                    meta = JSON.parse(decrypted);
                } catch (e) {
                    // Záloha pro případ nezašifrovaných dat
                    try { meta = JSON.parse(row.meta); } catch(e2) { meta = {}; }
                }

                meta.currency = (meta.currency || 0) + amount;
                const encryptedMeta = Security.encrypt(JSON.stringify(meta));
                
                db.run(`UPDATE accounts SET meta = ? WHERE username = ?`, [encryptedMeta, lowTarget], () => {
                    socket.emit('adminResponse', { msg: `Úspěch: ${lowTarget} dostal ${amount} Doge. (Nyní má ${meta.currency})`, color: "lime" });
                });
            });
        }
        else if (cmd === 'level') {
            const amount = parseInt(args[2]);
            if (!target || isNaN(amount)) return socket.emit('adminResponse', { msg: "Použití: level <jméno> <číslo_levelu>", color: "yellow" });
            const lowTarget = target.toLowerCase().trim();
            db.get(`SELECT meta FROM accounts WHERE username = ?`, [lowTarget], (err, row) => {
                if (!row) return socket.emit('adminResponse', { msg: `Hráč ${lowTarget} nenalezen.`, color: "red" });
                
                let meta;
                try {
                    const decrypted = Security.decrypt(row.meta);
                    meta = JSON.parse(decrypted);
                } catch (e) {
                    try { meta = JSON.parse(row.meta); } catch(e2) { meta = {}; }
                }

                meta.maxLevel = amount;
                const encryptedMeta = Security.encrypt(JSON.stringify(meta));
                
                db.run(`UPDATE accounts SET meta = ?, max_level = ? WHERE username = ?`, [encryptedMeta, amount, lowTarget], () => {
                    socket.emit('adminResponse', { msg: `Úspěch: Hráči ${lowTarget} byl nastaven Max Level ${amount}.`, color: "lime" });
                    broadcastLeaderboard();
                });
            });
        }
        else if (cmd === 'stats') {
            if (target) {
                db.get(`SELECT username, max_level, meta FROM accounts WHERE username = ?`, [target], (err, row) => {
                    if (!row) return socket.emit('adminResponse', { msg: `Hráč ${target} nenalezen.`, color: "red" });
                    // Dekryptování pro admina
                    const decryptedMeta = Security.decrypt(row.meta);
                    socket.emit('adminResponse', { msg: `Hráč: ${row.username} | Max Lvl: ${row.max_level}\nMeta: ${decryptedMeta}`, color: "cyan" });
                });
            } else {
                db.all(`SELECT username, max_level FROM accounts ORDER BY max_level DESC`, [], (err, rows) => {
                    let text = `Zaregistrováno hráčů: ${rows.length}\n`;
                    rows.forEach(r => text += `- ${r.username} (Lvl ${r.max_level})\n`);
                    socket.emit('adminResponse', { msg: text, color: "cyan" });
                });
            }
        }
        else if (cmd === 'delete') {
            if (!target) return socket.emit('adminResponse', { msg: "Použití: delete <jméno>", color: "yellow" });
            const lowTarget = target.toLowerCase().trim();
            db.run(`DELETE FROM accounts WHERE username = ?`, [lowTarget], function (err) {
                if (this.changes > 0) socket.emit('adminResponse', { msg: `Účet ${lowTarget} byl smazán.`, color: "lime" });
                else socket.emit('adminResponse', { msg: `Hráč ${lowTarget} nenalezen.`, color: "red" });
                broadcastLeaderboard();
            });
        } 
        else if (cmd === 'forcedelete') {
            if (!target) return socket.emit('adminResponse', { msg: "Použití: forcedelete <jméno>", color: "yellow" });
            const lowTarget = target.toLowerCase().trim();
            db.run(`DELETE FROM accounts WHERE username = ?`, [lowTarget], function (err) {
                if (this.changes > 0) {
                    socket.emit('adminResponse', { msg: `ÚČET ${lowTarget} BYL NATVRDO SMAZÁN.`, color: "lime" });
                    broadcastLeaderboard();
                } else {
                    socket.emit('adminResponse', { msg: `Hráč ${lowTarget} nenalezen.`, color: "red" });
                }
            });
        }
        else if (cmd === 'rooms') {
            let count = Object.keys(ROOMS).length;
            let text = `Aktivní místnosti: ${count}\n`;
            for (let id in ROOMS) {
                text += `- ID: ${id} | Hráčů: ${Object.keys(ROOMS[id].players).length} | Lvl: ${ROOMS[id].level}\n`;
            }
            socket.emit('adminResponse', { msg: text, color: "cyan" });
        }
        else if (cmd === 'feedback') {
            db.all(`SELECT * FROM feedback ORDER BY timestamp DESC`, [], (err, rows) => {
                if (!rows || rows.length === 0) return socket.emit('adminResponse', { msg: "Žádný feedback nenalezen.", color: "yellow" });
                let text = `ZPĚTNÁ VAZBA (${rows.length}):\n`;
                rows.forEach(r => {
                    const decryptedText = Security.decrypt(r.text);
                    text += `[${r.timestamp}] ${r.username}: ${decryptedText}\n`;
                });
                socket.emit('adminResponse', { msg: text, color: "pink" });
            });
        }
        else if (cmd === 'clearfeedback') {
            db.run(`DELETE FROM feedback`, [], () => {
                socket.emit('adminResponse', { msg: "Veškerý feedback byl smazán.", color: "lime" });
            });
        }
        else {
            socket.emit('adminResponse', { msg: "Neznámý příkaz. Dostupné: give, level, stats, delete, rooms, feedback, clearfeedback", color: "yellow" });
        }
    });

    // --- BĚŽNÁ LOGIKA HRY ---
    socket.on('openCrate', (data) => {
        const user = socket.authenticatedUser;
        if (!user) {
            console.warn(`[OPENCRATE] Blocked: socket is not authenticated.`);
            return;
        }
        if (!data || !data.type) {
            console.warn(`[OPENCRATE] Blocked for "${user}": missing crate type.`);
            return;
        }
        if (data.token !== socket.sessionToken) {
            console.warn(`[OPENCRATE] Blocked for "${user}": session token mismatch. Client token: "${data ? data.token : 'none'}", Server token: "${socket.sessionToken}"`);
            return;
        }

        db.get(`SELECT meta FROM accounts WHERE username = ?`, [user], (err, row) => {
            if (err || !row) return;
            let meta;
            try { meta = JSON.parse(Security.decrypt(row.meta)); } catch(e) { meta = JSON.parse(row.meta); }
            if (!meta || !meta.unopenedCrates || (meta.unopenedCrates[data.type] || 0) < 1) return;

            const count = Math.min(meta.unopenedCrates[data.type], data.count || 1);
            const results = [];
            for (let i = 0; i < count; i++) {
                const item = generateLoot(data.type);
                results.push(item);
                if (!meta.inventory) meta.inventory = [];
                const invItem = meta.inventory.find(inv => inv.id === item.id);
                if (invItem) invItem.count++; else meta.inventory.push({ id: item.id, count: 1 });
            }

            meta.unopenedCrates[data.type] -= count;
            const encrypted = Security.encrypt(JSON.stringify(meta));
            db.run(`UPDATE accounts SET meta = ? WHERE username = ?`, [encrypted, user], () => {
                socket.emit('syncSuccess', { meta: meta });
                socket.emit('crateResults', { results: results, type: data.type });
            });
        });
    });

    socket.on('sellItem', (data) => {
        const user = socket.authenticatedUser;
        if (!user) {
            console.warn(`[SELLITEM] Blocked: socket is not authenticated.`);
            return;
        }
        if (!data || !data.id) {
            console.warn(`[SELLITEM] Blocked for "${user}": missing item ID.`);
            return;
        }
        if (data.token !== socket.sessionToken) {
            console.warn(`[SELLITEM] Blocked for "${user}": session token mismatch. Client token: "${data ? data.token : 'none'}", Server token: "${socket.sessionToken}"`);
            return;
        }

        db.get(`SELECT meta FROM accounts WHERE username = ?`, [user], (err, row) => {
            if (err || !row) return;
            let meta;
            try { meta = JSON.parse(Security.decrypt(row.meta)); } catch(e) { meta = JSON.parse(row.meta); }
            if (!meta || !meta.inventory) return;

            const invIdx = meta.inventory.findIndex(inv => inv.id === data.id);
            if (invIdx === -1) return;

            const emoji = EMOJIS.find(e => e.id === data.id);
            if (!emoji) return;

            const countToSell = Math.min(meta.inventory[invIdx].count, data.count || 1);
            const gain = emoji.price * countToSell;

            meta.currency += gain;
            meta.inventory[invIdx].count -= countToSell;
            if (meta.inventory[invIdx].count <= 0) meta.inventory.splice(invIdx, 1);

            const encrypted = Security.encrypt(JSON.stringify(meta));
            db.run(`UPDATE accounts SET meta = ? WHERE username = ?`, [encrypted, user], () => {
                socket.emit('syncSuccess', { meta: meta });
            });
        });
    });

    socket.on('sellAllItems', (data) => {
        const user = socket.authenticatedUser;
        if (!user) {
            console.warn(`[SELLALLITEMS] Blocked: socket is not authenticated.`);
            return;
        }
        if (data.token !== socket.sessionToken) {
            console.warn(`[SELLALLITEMS] Blocked for "${user}": session token mismatch. Client token: "${data ? data.token : 'none'}", Server token: "${socket.sessionToken}"`);
            return;
        }

        db.get(`SELECT meta FROM accounts WHERE username = ?`, [user], (err, row) => {
            if (err || !row) return;
            let meta;
            try { meta = JSON.parse(Security.decrypt(row.meta)); } catch(e) { meta = JSON.parse(row.meta); }
            if (!meta || !meta.inventory) return;

            let totalGain = 0;
            const newInventory = [];
            meta.inventory.forEach(inv => {
                const emoji = EMOJIS.find(e => e.id === inv.id);
                if (!emoji) return;
                const isEquipped = (meta.upgrades && meta.upgrades.hat === emoji.id);
                if (isEquipped) {
                    newInventory.push(inv);
                } else {
                    totalGain += emoji.price * (inv.count || 1);
                }
            });

            if (totalGain > 0) {
                meta.currency = (meta.currency || 0) + totalGain;
                if (!meta.stats) meta.stats = { totalDogecoins: 0 };
                meta.stats.totalDogecoins = (meta.stats.totalDogecoins || 0) + totalGain;
            }
            meta.inventory = newInventory;

            const encrypted = Security.encrypt(JSON.stringify(meta));
            db.run(`UPDATE accounts SET meta = ? WHERE username = ?`, [encrypted, user], () => {
                socket.emit('syncSuccess', { meta: meta });
                socket.emit('currencyUpdated', { amount: meta.currency });
            });
        });
    });

    socket.on('claimDailyGift', (data) => {
        const user = socket.authenticatedUser;
        if (!user) {
            console.warn(`[DAILYGIFT] Blocked: socket is not authenticated.`);
            return;
        }
        if (data.token !== socket.sessionToken) {
            console.warn(`[DAILYGIFT] Blocked for "${user}": session token mismatch. Client token: "${data ? data.token : 'none'}", Server token: "${socket.sessionToken}"`);
            return;
        }

        db.get(`SELECT meta FROM accounts WHERE username = ?`, [user], (err, row) => {
            if (err || !row) return;
            let meta;
            try { meta = JSON.parse(Security.decrypt(row.meta)); } catch(e) { meta = JSON.parse(row.meta); }
            
            const now = Date.now();
            const day = 24 * 3600 * 1000;
            const lastClaim = meta.lastDailyGift || 0;
            if (now - lastClaim < day) return;

            if (now - lastClaim > 2 * day) meta.dailyStreak = 1;
            else meta.dailyStreak = (meta.dailyStreak || 0) + 1;

            const rewards = [50, 100, 200, 400, 800];
            const reward = rewards[Math.min(meta.dailyStreak - 1, rewards.length - 1)];

            const newCurrency = (meta.currency || 0) + reward;
            meta.currency = newCurrency;
            meta.lastDailyGift = now;
            if (!meta.stats) meta.stats = { totalDogecoins: 0 };
            meta.stats.totalDogecoins = (meta.stats.totalDogecoins || 0) + reward;

            const encrypted = Security.encrypt(JSON.stringify(meta));
            db.run(`UPDATE accounts SET meta = ?, currency = ? WHERE username = ?`, [encrypted, newCurrency, user], () => {
                socket.emit('syncSuccess', { meta: meta });
                socket.emit('currencyUpdated', { amount: meta.currency });
            });
        });
    });

    socket.on('claimAchievement', (data) => {
        const user = socket.authenticatedUser;
        if (!user) {
            console.warn(`[ACHIEVEMENT] Claim blocked: socket is not authenticated.`);
            return;
        }
        if (!data || !data.id) {
            console.warn(`[ACHIEVEMENT] Claim blocked for "${user}": missing achievement ID.`);
            return;
        }
        if (data.token !== socket.sessionToken) {
            console.warn(`[ACHIEVEMENT] Claim blocked for "${user}": session token mismatch. Client token: "${data ? data.token : 'none'}", Server token: "${socket.sessionToken}"`);
            return;
        }

        db.get(`SELECT meta, currency FROM accounts WHERE username = ?`, [user], (err, row) => {
            if (err || !row) return;
            let meta;
            try { meta = JSON.parse(Security.decrypt(row.meta)); } catch(e) { meta = JSON.parse(row.meta); }
            
            // Achievement reward mapping (matched with main.js)
            const rewards = {
                wide: 100, cheapskate: 250, boss_slayer: 300, veteran: 500, collector: 400, gambling: 200, 
                cookie: 1000, millionaire: 2000, crate_opener: 500, murderer: 100, genocide: 500, 
                god_of_death: 2000, boss_hunter: 500, boss_nightmare: 1000, elite_pilot: 500, 
                legendary_pilot: 1000, explorer_fan: 300, laser_fan: 300, defender_fan: 300, 
                shotgun_fan: 300, necro_fan: 300, nuke_happy: 200, magnet_master: 200, 
                medic: 200, time_master: 300, puppet_master: 300, healer: 400, gem_collector: 500, 
                speed_demon: 200, tank: 200, glass_cannon: 300, multiplayer_fan: 300, rich_kid: 500, 
                lucky_star: 1000, asteroid_miner: 200, asteroid_destroyer: 500, first_win: 200, 
                survivor: 500, immortal: 1000, first_battle: 50
            };

            const reward = rewards[data.id];
            if (!reward) return;

            if (!meta.achievements || !meta.achievements[data.id]) return;
            if (meta.claimedAchievements && meta.claimedAchievements[data.id]) return;

            if (!meta.claimedAchievements) meta.claimedAchievements = {};
            meta.claimedAchievements[data.id] = true;
            
            // Místo meta.currency použijeme přesnou databázovou hodnotu
            const newCurrency = (row.currency || 0) + reward;
            meta.currency = newCurrency;
            
            if (!meta.stats) meta.stats = { totalDogecoins: 0 };
            meta.stats.totalDogecoins = (meta.stats.totalDogecoins || 0) + reward;

            const encrypted = Security.encrypt(JSON.stringify(meta));
            db.run(`UPDATE accounts SET meta = ?, currency = ? WHERE username = ?`, [encrypted, newCurrency, user], (err) => {
                if (err) return socket.emit('syncError', "DB Error in claimAchievement: " + err.message);
                socket.emit('syncSuccess', { meta: meta });
                socket.emit('currencyUpdated', { amount: newCurrency });
            });
        });
    });
    socket.on('purchase', (data) => {
        const user = socket.authenticatedUser;
        if (!user) {
            console.warn(`[PURCHASE] Blocked: socket is not authenticated.`);
            return;
        }
        if (data.token !== socket.sessionToken) {
            console.warn(`[PURCHASE] Blocked for "${user}": session token mismatch. Client token: "${data ? data.token : 'none'}", Server token: "${socket.sessionToken}"`);
            return;
        }

        db.get(`SELECT currency, meta FROM accounts WHERE username = ?`, [user], (err, row) => {
            if (err || !row) return;
            let meta;
            try { meta = JSON.parse(Security.decrypt(row.meta)); } catch(e) { meta = JSON.parse(row.meta); }
            if (!meta) return;

            let cost = 0;
            let success = false;

            if (data.type === 'ship') {
                cost = (PRICES.ships && PRICES.ships[data.id]) || 0;
                if (!meta.ships) meta.ships = { 1: true };
                if (row.currency >= cost && !meta.ships[data.id]) {
                    meta.ships[data.id] = true;
                    meta.selectedShip = data.id;
                    success = true;
                }
            } else if (data.type === 'ability') {
                cost = (PRICES.abilities && PRICES.abilities[data.id]) || 0;
                if (!meta.abilities) meta.abilities = { 1: true };
                if (row.currency >= cost && !meta.abilities[data.id]) {
                    meta.abilities[data.id] = true;
                    meta.selectedAbility = data.id;
                    success = true;
                }
            } else if (data.type === 'stat') {
                const cfg = PRICES.stats && PRICES.stats[data.id];
                if (!cfg) return;
                if (!meta.upgrades) meta.upgrades = { hp:0, speed:0, luck:0, regen:0, armor:0 };
                const currentVal = meta.upgrades[data.id] || 0;
                cost = Math.floor(cfg.base * (1 + currentVal * cfg.step));
                if (row.currency >= cost) {
                    meta.upgrades[data.id] = currentVal + 1;
                    success = true;
                }
            } else if (data.type === 'crate') {
                const baseCost = (PRICES.crates && PRICES.crates[data.id]) || 0;
                const count = data.count || 1;
                cost = baseCost * count;
                if (row.currency >= cost) {
                    // INSTANT UNBOXING (no inventory for bought crates)
                    const results = [];
                    for (let i = 0; i < count; i++) {
                        const item = generateLoot(data.id);
                        results.push(item);
                        if (!meta.inventory) meta.inventory = [];
                        const invItem = meta.inventory.find(inv => inv.id === item.id);
                        if (invItem) invItem.count++; else meta.inventory.push({ id: item.id, count: 1 });
                    }
                    socket.emit('crateResults', { results: results, type: data.id, bulk: true });
                    success = true;
                }
            }

            if (success) {
                const newCurrency = row.currency - cost;
                meta.currency = newCurrency;
                const encrypted = Security.encrypt(JSON.stringify(meta));
                db.run(`UPDATE accounts SET meta = ?, currency = ? WHERE username = ?`, [encrypted, newCurrency, user], () => {
                    socket.emit('syncSuccess', { meta: meta });
                    socket.emit('purchaseSuccess', { type: data.type, id: data.id });
                });
            } else {
                socket.emit('purchaseError', "Nedostatek Dogecoinu nebo neplatná položka.");
            }
        });
    });

    socket.on('register', (data) => {
        let { user, pass } = data;
        if (!user || user.length < 3 || user.length > 15 || !pass || pass.length < 1) {
            return socket.emit('registerResponse', { success: false, msg: 'Jméno musí mít 3 až 15 znaků a heslo nesmí být prázdné.' });
        }
        user = user.toLowerCase().trim();

        db.get(`SELECT username FROM accounts WHERE username = ?`, [user], (err, row) => {
            if (row) {
                return socket.emit('registerResponse', { success: false, msg: 'Toto jméno už někdo používá.' });
            }

            const defaultMeta = {
                playerName: user,
                maxLevel: 1,
                currency: 0,
                selectedShip: 1,
                abilities: { 1: true, 2: false, 3: false },
                selectedAbility: 1,
                inventory: [],
                settings: { musicMenu: true, musicGame: true, sfx: true },
                selectedLanguage: 'cs',
                achievements: {},
                claimedAchievements: {},
                stats: { totalBossKills: 0, totalDogecoins: 0, totalGames: 0, totalRandomPicks: 0, totalPlayTime: 0 }
            };

            console.log(`[REGISTER] Creating new account: "${user}"`);
            Security.hashPassword(pass).then(hashedPass => {
                const encryptedMeta = Security.encrypt(JSON.stringify(defaultMeta));
                db.run(`INSERT INTO accounts (username, password, meta, max_level, currency) VALUES (?, ?, ?, ?, ?)`,
                    [user, hashedPass, encryptedMeta, 1, 0],
                    (err) => {
                        if (err) {
                            console.error(`[REGISTER] DB Error:`, err);
                            return socket.emit('registerResponse', { success: false, msg: 'Chyba při zápisu do databáze.' });
                        }
                        console.log(`[REGISTER] Success: "${user}"`);
                        socket.authenticatedUser = user;
                        socket.sessionToken = crypto.randomBytes(16).toString('hex');
                        socket.emit('registerResponse', { success: true, meta: defaultMeta, token: socket.sessionToken });
                        broadcastLeaderboard();
                    });
            });
        });
    });

    socket.on('deleteAccount', (data) => {
        let { user, pass } = data;
        if (!user) return;
        user = user.toLowerCase().trim();
        console.log(`[DELETE] Žádost o smazání účtu: "${user}"`);
        if (!pass) {
            console.log(`[DELETE] Neúspěch: Chybějící heslo.`);
            return;
        }
        console.log(`[DELETE] Checking credentials for: "${user}"`);
        db.get(`SELECT password FROM accounts WHERE username = ?`, [user], (err, row) => {
            if (err) console.error(`[DELETE] DB Get Error:`, err);
            
            if (row) {
                console.log(`[DELETE] Found user. Comparing passwords...`);
                Security.verifyPassword(pass, row.password).then(isMatch => {
                    if (isMatch) {
                        console.log(`[DELETE] Password match. Deleting...`);
                        db.run(`DELETE FROM accounts WHERE username = ?`, [user], function (err) {
                            if (err) {
                                console.error(`[DELETE] DB Delete Error:`, err);
                                socket.emit('accountDeleted', { success: false, msg: "Chyba při mazání." });
                            } else {
                                console.log(`[DELETE] Success. Changes: ${this.changes}`);
                                broadcastLeaderboard();
                                socket.emit('accountDeleted', { success: true });
                            }
                        });
                    } else {
                        console.log(`[DELETE] Password mismatch!`);
                        socket.emit('accountDeleted', { success: false, msg: "Špatné heslo." });
                    }
                });
            } else {
                console.log(`[DELETE] User "${user}" not found in DB.`);
                socket.emit('accountDeleted', { success: false, msg: "Účet nenalezen." });
            }
        });
    });

    socket.on('login', (data) => {
        let { user, pass } = data;
        if (!user) return;
        user = user.toLowerCase().trim();
        console.log(`[LOGIN] Attempt: "${user}"`);
        db.get(`SELECT password, meta, currency FROM accounts WHERE username = ?`, [user], (err, row) => {
            if (err) console.error(`[LOGIN] DB Error:`, err);
            
            if (row) {
                Security.verifyPassword(pass, row.password).then(isMatch => {
                    if (isMatch) {
                        try {
                            // Dekryptování metadat
                             // Sanitize Meta (Anti-Cheat Cleanup for existing exploited accounts)
                             const parsedMeta = sanitizeMeta(JSON.parse(Security.decrypt(row.meta)));
                             if (!parsedMeta.abilities) parsedMeta.abilities = { 1: true, 2: false, 3: false };
                             if (!parsedMeta.selectedAbility) parsedMeta.selectedAbility = 1;

                             // Update DB if metadata was sanitized
                             const resanitizedMeta = JSON.stringify(parsedMeta);
                             if (resanitizedMeta !== Security.decrypt(row.meta)) {
                                 const encryptedMeta = Security.encrypt(resanitizedMeta);
                                 db.run(`UPDATE accounts SET meta = ? WHERE username = ?`, [encryptedMeta, user]);
                             }

                            // Lazy Migration: Pokud heslo bylo plain-text, zahashujeme ho
                            if (!row.password.includes(':')) {
                                Security.hashPassword(pass).then(hashed => {
                                    db.run(`UPDATE accounts SET password = ? WHERE username = ?`, [hashed, user]);
                                }).catch(e => console.error("[LOGIN] Migration error:", e));
                            }

                             // Lazy Migration (v1.424): Ensure currency column is synced with meta
                             if (parsedMeta.currency !== undefined && row.currency === 0 && parsedMeta.currency > 0) {
                                 db.run(`UPDATE accounts SET currency = ? WHERE username = ?`, [parsedMeta.currency, user]);
                                 row.currency = parsedMeta.currency;
                             }
                             parsedMeta.currency = row.currency;

                             console.log(`[LOGIN] Success: "${user}"`);
                             socket.authenticatedUser = user; socket.sessionToken = crypto.randomBytes(16).toString('hex'); socket.emit('loginResponse', { success: true, meta: parsedMeta, token: socket.sessionToken });
                        } catch (e) {
                            console.error(`[LOGIN] Meta parse error for "${user}":`, e.message);
                            socket.emit('loginResponse', { success: false, msg: "Chyba při načítání dat účtu." });
                        }
                    } else {
                        console.log(`[LOGIN] Wrong password for "${user}"`);
                        socket.emit('loginResponse', { success: false, msg: "Špatné heslo!" });
                    }
                }).catch(err => {
                    console.error(`[LOGIN] Verification error for "${user}":`, err);
                    socket.emit('loginResponse', { success: false, msg: "Chyba při ověřování hesla." });
                });
            } else {
                console.log(`[LOGIN] User "${user}" not found.`);
                socket.emit('loginResponse', { success: false, msg: "Účet neexistuje. Zaregistruj se!" });
            }
        });
    });

    socket.on('syncAccount', (data) => {
        // SECURITY: Whitelist of fields the client CAN update
        let user = socket.authenticatedUser || (data.user ? data.user.toLowerCase().trim() : null);
        if (!user) return socket.emit('syncError', "Nutné přihlášení.");

        const { meta, pass } = data;
        if (!meta) return;

        db.get(`SELECT password, max_level, meta, currency FROM accounts WHERE username = ?`, [user], (err, row) => {
            if (err || !row) return socket.emit('syncError', "Účet nenalezen.");

            const proceedWithSync = () => {
                if (!socket.sessionToken) socket.sessionToken = data.token;
                let oldMeta;
                try {
                    const decrypted = Security.decrypt(row.meta);
                    oldMeta = JSON.parse(decrypted);
                } catch (e) {
                    try { oldMeta = JSON.parse(row.meta); } catch(e2) { oldMeta = {}; }
                }

                // --- ZERO TRUST SMART MERGE (v1.405.9) ---
                // Trust ONLY specific non-sensitive fields from the client
                const serverMeta = oldMeta || {};
                const merged = { ...serverMeta }; 
                
                // Whitelist of fields the client CAN update
                if (meta.settings !== undefined) merged.settings = meta.settings;
                if (meta.selectedLanguage !== undefined) merged.selectedLanguage = meta.selectedLanguage;
                if (meta.autoUpgrade !== undefined) merged.autoUpgrade = meta.autoUpgrade;
                if (meta.autoSelect !== undefined) merged.autoSelect = meta.autoSelect;
                if (meta.selectedShip !== undefined) merged.selectedShip = meta.selectedShip;
                if (meta.selectedAbility !== undefined) merged.selectedAbility = meta.selectedAbility;
                if (meta.metaLastUpdated !== undefined) merged.metaLastUpdated = meta.metaLastUpdated;
                // Union merge achievements and claimedAchievements (once true, always true) to prevent client-side rollbacks
                if (meta.claimedAchievements) {
                    if (!merged.claimedAchievements) merged.claimedAchievements = {};
                    for (let id in meta.claimedAchievements) {
                        if (meta.claimedAchievements[id]) {
                            merged.claimedAchievements[id] = true;
                        }
                    }
                }
                if (meta.achievements) {
                    if (!merged.achievements) merged.achievements = {};
                    for (let id in meta.achievements) {
                        if (meta.achievements[id]) {
                            merged.achievements[id] = true;
                        }
                    }
                }
                if (meta.stats) merged.stats = meta.stats;
                
                // Use atomic column value
                merged.currency = row.currency;
                
                // CRITICAL: If player is currently in a room, include their PENDING rewards in the sync
                if (socket.roomId && ROOMS[socket.roomId] && ROOMS[socket.roomId].players[socket.playerId]) {
                    const p = ROOMS[socket.roomId].players[socket.playerId];
                    if (p.pendingRewards > 0) {
                        const reward = p.pendingRewards;
                        p.pendingRewards = 0;
                        merged.currency += reward;
                        db.run(`UPDATE accounts SET currency = currency + ? WHERE username = ?`, [reward, user]);
                    }
                }
                
                // Server-authoritative fields (client cannot fake these)
                merged.inventory       = serverMeta.inventory || [];
                merged.upgrades        = serverMeta.upgrades  || { hp:0, speed:0, luck:0, regen:0, armor:0 };
                merged.unopenedCrates  = serverMeta.unopenedCrates || { basic: 0, premium: 0, legendary: 0 };
                merged.maxLevel        = Math.max(serverMeta.maxLevel || 1, (row ? row.max_level : 1) || 1);
                
                // Ships/abilities: union (once unlocked, always unlocked - merge server + client)
                merged.ships     = Object.assign({}, serverMeta.ships    || { 1: true }, merged.ships    || {});
                merged.abilities = Object.assign({}, serverMeta.abilities || { 1: true }, merged.abilities || {});
                
                // NOTE: selectedShip, selectedAbility, autoSelect, autoUpgrade, settings
                // are already correctly set from client data above (lines 1117-1122)

                
                console.log(`[SYNC] Ukládám pro "${user}": selectedShip=${merged.selectedShip}, selectedAbility=${merged.selectedAbility}, autoSelect=${merged.autoSelect}, musicMenu=${merged.settings?.musicMenu}`);
                const encryptedMeta = Security.encrypt(JSON.stringify(merged));
                db.run(`UPDATE accounts SET meta = ? WHERE username = ?`,
                    [encryptedMeta, user],
                    (err) => {
                        if (err) return socket.emit('syncError', "DB Error in syncAccount: " + err.message);
                        // Sync success - Return the AUTHORITATIVE merged meta to the client
                        socket.emit('syncSuccess', { meta: merged });
                    });
            };

            if (socket.authenticatedUser === user) {
                proceedWithSync();
            } else {
                Security.verifyPassword(pass, row.password).then(isMatch => {
                    if (isMatch) {
                        socket.authenticatedUser = user;
                        proceedWithSync();
                    } else {
                        socket.emit('syncError', "Chyba ověření hesla.");
                    }
                }).catch(e => {
                    socket.emit('syncError', "Chyba při ověřování hesla: " + e.message);
                });
            }
        });
    });

    socket.on('requestLeaderboard', () => {
        broadcastLeaderboard();
    });

    socket.on('submitScore', (data) => {
        const user = socket.authenticatedUser;
        if (!user) {
            console.warn(`[SUBMITSCORE] Blocked: socket is not authenticated.`);
            return;
        }
        if (!data || !data.level) {
            console.warn(`[SUBMITSCORE] Blocked for "${user}": missing level data.`);
            return;
        }
        if (data.token !== socket.sessionToken) {
            console.warn(`[SUBMITSCORE] Blocked for "${user}": session token mismatch. Client token: "${data ? data.token : 'none'}", Server token: "${socket.sessionToken}"`);
            return;
        }

        db.get(`SELECT max_level, last_level_up FROM accounts WHERE username = ?`, [user], (err, row) => {
            if (!row) return;

            const currentMax = row.max_level || 1;
            let reportedLevel = parseInt(data.level);
            
            // ZERO TRUST: If player is in a room, use room level as the only truth
            const r = socket.roomId;
            if (r && ROOMS[r]) {
                reportedLevel = ROOMS[r].level;
            }

            if (reportedLevel > currentMax) {
                // --- PROOF OF PLAY VALIDATION (v1.385) ---
                // It takes at least 15 seconds of real gameplay to gain a level after level 5
                const now = Date.now();
                const lastTime = row.last_level_up || 0;
                const levelsGained = reportedLevel - currentMax;
                const minTimeRequired = levelsGained * 10000; // 10s per level minimum
                
                if (now - lastTime < minTimeRequired) {
                    console.warn(`[ANTI-CHEAT] ${user} too fast level up: ${currentMax} -> ${reportedLevel} in ${now - lastTime}ms. Rejected.`);
                    return;
                }

                db.run(`UPDATE accounts SET max_level = ?, last_level_up = ? WHERE username = ?`, [reportedLevel, now, user], () => {
                    broadcastLeaderboard();
                });
            }
        });
    });

    socket.on('sendFeedback', (data) => {
        if (data && data.text) {
            const encryptedText = Security.encrypt(data.text);
            db.run(`INSERT INTO feedback (username, text) VALUES (?, ?)`, [data.user || 'Anonym', encryptedText]);
        }
    });

    socket.on('requestRooms', () => {
        // ZERO TRUST: Filter out private solo, finished, or abandoned rooms (v1.432)
        const activeRooms = Object.values(ROOMS)
            .filter(r => {
                const activePlayers = Object.values(r.players).filter(p => !p.disconnected);
                return !r.isGameOver && !r.isSolo && !r.isFinished && activePlayers.length > 0;
            })
            .map(r => {
                const activePlayersCount = Object.values(r.players).filter(p => !p.disconnected).length;
                return { id: r.id, players: activePlayersCount, level: r.level };
            });
        socket.emit('roomList', activeRooms);
    });

    socket.on('joinRoom', (data) => {
        if (!data || !data.roomId || !data.playerId) return;

        const roomId = data.roomId.toUpperCase();
        const playerId = data.playerId;

        // Prevent joining if room is finished or in game over state (v1.426)
        if (ROOMS[roomId]) {
            if (ROOMS[roomId].isGameOver || ROOMS[roomId].isFinished) {
                socket.emit('error', { msg: "Místnost je již uzavřena nebo hra skončila. Vytvoř novou." });
                return;
            }
        }

        // Zabráníme vytvoření "duchů" při rychlém dvojkliku (odstraní starého hráče pro daný socket)
        if (socket.roomId && socket.playerId && ROOMS[socket.roomId] && ROOMS[socket.roomId].players[socket.playerId]) {
            delete ROOMS[socket.roomId].players[socket.playerId];
        }

        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerId = playerId;

        if (!ROOMS[roomId]) {
            ROOMS[roomId] = {
                id: roomId,
                players: {},
                enemies: [],
                gems: [],
                baits: [],
                time: 0,
                lastBossTime: 0,
                level: 1,
                xp: 0,
                nextLevelXp: 100,
                paused: data.isSolo ? false : true,
                readyCount: 0,
                isGameOver: false,
                cleanupTimer: null,
                frozenUntil: 0, // Logika pro zamrznutí času
                tombstones: [],
                obstacles: [],
                lastBossLevelSpawned: 0,
                isSolo: data.isSolo || false,
                dogeEarned: {},
                lastRewardFlush: Date.now()
            };
        } else {
            if (ROOMS[roomId].cleanupTimer) {
                clearTimeout(ROOMS[roomId].cleanupTimer);
                ROOMS[roomId].cleanupTimer = null;
            }
        }

        if (!ROOMS[roomId].players[playerId]) {
            // AUTHORITATIVE STAT LOADING (v1.430)
            let authDmg = CONFIG.BASE_PLAYER_DMG;
            let authMaxHp = CONFIG.BASE_PLAYER_HP;
            
            if (data.username) {
                db.get(`SELECT meta FROM accounts WHERE username = ?`, [data.username.toLowerCase()], (err, row) => {
                    if (row) {
                        try {
                            const meta = JSON.parse(Security.decrypt(row.meta));
                            const upg = meta.upgrades || {};
                            // Damage: 20 + (level * 5)
                            authDmg += (upg.damage || 0) * 5;
                            authMaxHp += (upg.hp || 0) * 10;
                            
                            if (ROOMS[roomId] && ROOMS[roomId].players[playerId]) {
                                ROOMS[roomId].players[playerId].damage = authDmg;
                                ROOMS[roomId].players[playerId].maxHp = authMaxHp;
                                ROOMS[roomId].players[playerId].hp = authMaxHp;
                            }
                        } catch(e) {}
                    }
                });
            }

            ROOMS[roomId].players[playerId] = {
                id: playerId, x: 0, y: 0, hp: authMaxHp, maxHp: authMaxHp, damage: authDmg, 
                dead: false, hat: null, level: 1, disconnected: false, 
                name: data.name || "Hráč",
                username: data.username || null,
                pendingRewards: 0,
                socketId: socket.id 
            };
        } else {
            ROOMS[roomId].players[playerId].disconnected = false;
            if (data.username) ROOMS[roomId].players[playerId].username = data.username;
        }

        socket.emit('joined', {
            roomId: roomId,
            playerState: ROOMS[roomId].players[playerId]
        });
    });

    socket.on('playerUpdate', (data) => {
        const r = socket.roomId;
        const p = socket.playerId;
        if (r && ROOMS[r] && ROOMS[r].players[p]) {
            // ZERO TRUST: Strict Whitelist for visual/non-critical properties only
            const whitelist = ['x', 'y', 'rot', 'anim', 'hat', 'dead', 'hp', 'maxHp', 'flipX', 'aura', 'auraRange', 'auraLevel', 'fireTrail', 'kaktus', 'shipType', 'laserTargetsIds', 'orbitals', 'portals'];
            whitelist.forEach(key => {
                if (data[key] !== undefined) {
                    ROOMS[r].players[p][key] = data[key];
                }
            });

            if (data.dead && !ROOMS[r].isGameOver) {
                // Hráč umřel -> Vytvořit náhrobek
                if (!ROOMS[r].tombstones.find(t => t.playerId === p)) {
                    ROOMS[r].tombstones.push({ id: Math.random().toString(36).substr(2, 9), playerId: p, x: ROOMS[r].players[p].x, y: ROOMS[r].players[p].y, reviveProgress: 0 });
                }

                // Zkontrolovat, zda žije ještě někdo jiný
                const allDead = Object.values(ROOMS[r].players).every(pl => pl.dead || pl.disconnected);

                if (allDead) {
                    ROOMS[r].isGameOver = true;
                    ROOMS[r].isFinished = true; // Block new joins immediately (v1.428)
                    
                    const finalLevel = ROOMS[r].level;
                    Object.values(ROOMS[r].players).forEach(p => {
                        if (p.username) {
                            // 1. Save max level
                            db.run(`UPDATE accounts SET max_level = MAX(max_level, ?) WHERE username = ?`, [finalLevel, p.username]);
                            
                            // 2. Authoritative Final Flush (v1.428)
                            if (p.pendingRewards > 0) {
                                flushUsernameRewards(p.username, p.pendingRewards);
                                p.pendingRewards = 0;
                            }
                        }
                    });

                    io.to(r).emit('teamGameOver', { dogeEarned: ROOMS[r].dogeEarned });

                    // v1.428: Completely shut down the room after 5 seconds
                    setTimeout(() => {
                        if (ROOMS[r]) {
                            console.log(`[ROOM] Shutting down room ${r}`);
                            delete ROOMS[r];
                        }
                    }, 5000);
                }
            }
        }
    });

    socket.on('shoot', (projData) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('shoot', projData);
        }
    });

    // PŘIJETÍ SCHOPNOSTÍ OD HRÁČE
    socket.on('useAbility', (data) => {
        const r = socket.roomId;
        if (r && ROOMS[r]) {
            if (data.type === 2) {
                ROOMS[r].frozenUntil = Date.now() + 5000;
            } else if (data.type === 3 && data.enemyIds) {
                data.enemyIds.forEach(id => {
                    const e = ROOMS[r].enemies.find(en => en.id === id);
                    if (e && !e.isBoss) e.possessed = true;
                });
            } else if (data.type === 'medic') {
                // Léčivá aura zapnuta - klient posílá heal eventy
            }
        }
    });

    socket.on('healPlayers', (data) => {
        const r = socket.roomId;
        if (r && ROOMS[r] && data.targets) {
            data.targets.forEach(tid => {
                if (ROOMS[r].players[tid] && !ROOMS[r].players[tid].dead) {
                    ROOMS[r].players[tid].hp = Math.min(ROOMS[r].players[tid].maxHp, ROOMS[r].players[tid].hp + data.amount);
                }
            });
        }
    });

    socket.on('reviveProgress', (data) => {
        const r = socket.roomId;
        if (r && ROOMS[r]) {
            const t = ROOMS[r].tombstones.find(tb => tb.id === data.tombstoneId);
            if (t) {
                t.reviveProgress += data.amount;
                if (t.reviveProgress >= 100) {
                    // Oživení!
                    if (ROOMS[r].players[t.playerId]) {
                        ROOMS[r].players[t.playerId].dead = false;
                        ROOMS[r].players[t.playerId].hp = ROOMS[r].players[t.playerId].maxHp / 2;
                    }
                    ROOMS[r].tombstones = ROOMS[r].tombstones.filter(tb => tb.id !== t.id);
                    io.to(r).emit('playerRevived', { playerId: t.playerId });
                }
            }
        }
    });

    socket.on('enemyHit', (data) => {
        handleSingleHit(socket, data.id, data.damage);
    });

    socket.on('batchEnemyHit', (data) => {
        if (data) {
            for (let id in data) handleSingleHit(socket, id, data[id]);
        }
    });

    socket.on('batchEnemyKnockback', (data) => {
        const r = socket.roomId;
        if (!r || !ROOMS[r] || !data) return;
        const room = ROOMS[r];
        for (let id in data) {
            const enemy = room.enemies.find(e => e.id === id);
            if (enemy) {
                enemy.knockback = enemy.knockback || {x:0, y:0};
                enemy.knockback.x += data[id].x;
                enemy.knockback.y += data[id].y;
            }
        }
    });

    socket.on('gemPickup', (gemId) => {
        handleSingleGem(socket, gemId);
    });

    socket.on('batchGemPickup', (gemIds) => {
        if (Array.isArray(gemIds)) {
            gemIds.forEach(id => handleSingleGem(socket, id));
        }
    });

    function handleSingleHit(socket, enemyId, damage) {
        const r = socket.roomId;
        if (!r || !ROOMS[r]) return;
        const room = ROOMS[r];
        const enemy = room.enemies.find(e => e.id === enemyId);
        if (enemy && room.players[socket.playerId]) {
            const p = room.players[socket.playerId];
            const dx = enemy.x - p.x;
            const dy = enemy.y - p.y;
            const d = Math.sqrt(dx*dx + dy*dy);
            if (d > 3000) return; // Anti-cheat distance

            // SERVER-AUTHORITATIVE DAMAGE (v1.430)
            // We ignore the 'damage' value from the client and use our internal one
            const effectiveDamage = p.damage || 20;
            enemy.hp -= effectiveDamage;
            
            if (enemy.hp <= 0) {
                killEnemy(room, enemyId, socket);

                if (enemy.type === 4) { // Loot goblin drop
                    const drops = (enemy.stolenGems || 0) + 5;
                    for (let i = 0; i < drops; i++) {
                        room.gems.push({ id: Math.random().toString(36).substr(2, 9), x: enemy.x + (Math.random() - 0.5) * 100, y: enemy.y + (Math.random() - 0.5) * 100 });
                    }
                } else if (!enemy.isBoss) {
                    room.gems.push({ id: Math.random().toString(36).substr(2, 9), x: enemy.x, y: enemy.y });
                }
            }
        }
    }

    function handleSingleGem(socket, gemId) {
        const r = socket.roomId;
        if (!r || !ROOMS[r]) return;
        const room = ROOMS[r];
        const gemIndex = room.gems.findIndex(g => g.id === gemId);
        if (gemIndex === -1) return;
        const gem = room.gems[gemIndex];
        const p = room.players[socket.playerId];
        if (p) {
            const dx = gem.x - p.x;
            const dy = gem.y - p.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist > 800) return; // Anti-Vacuum

            room.gems.splice(gemIndex, 1);
            io.to(r).emit('gemCollected', { gemId: gemId, playerId: socket.playerId, isNuke: gem.isNuke, isMagnet: gem.isMagnet });

            if (gem.isNuke) {
                room.enemies.forEach(e => {
                    if (!e.isBoss) {
                        e.hp = 0;
                        room.gems.push({ id: Math.random().toString(36).substr(2, 9), x: e.x, y: e.y });
                    }
                });
                room.enemies = room.enemies.filter(e => e.hp > 0);
                io.to(r).emit('explosion', { x: p.x, y: p.y, radius: 1000, isNuke: true });
            }

            if (gem.isMagnet) {
                const count = room.gems.length;
                room.xp += count * 10;
                room.gems = [];
            }

            room.xp += 10;
            if (room.xp >= room.nextLevelXp) {
                room.level++;
                room.xp -= room.nextLevelXp;
                room.nextLevelXp = Math.floor(room.nextLevelXp * 1.25);
                room.readyCount = 0;

                // Flush rewards on Level Up
                flushPlayerRewards(socket);

                // --- SERVER-AUTHORITATIVE LEADERBOARD UPDATE ---
                Object.values(room.players).forEach(p_lb => {
                    if (p_lb.name) {
                        db.run(`UPDATE accounts SET max_level = ? WHERE username = ? AND max_level < ?`, [room.level, p_lb.name.toLowerCase(), room.level], (err) => {
                            if (!err) broadcastLeaderboard();
                        });
                    }
                });

                // CLEAR ENEMIES (except bosses) on level up for multiplayer
                room.enemies = room.enemies.filter(e => e.isBoss);
                io.to(r).emit('teamLevelUp', { level: room.level });

                // Early Boss Warning for next boss (Level 4, 9, 14...)
                if (room.level % CONFIG.BOSS_LEVEL_INTERVAL === CONFIG.BOSS_LEVEL_INTERVAL - 1) {
                    const nextBossType = Math.floor(Math.random() * 7) + 1;
                    room.nextBossType = nextBossType; // Store it for spawning
                    io.to(r).emit('bossWarning', { type: nextBossType, soon: true });
                }
            }
        }
    }

    socket.on('spawnBait', (data) => {
        const r = socket.roomId;
        if (r && ROOMS[r]) {
            ROOMS[r].baits.push({
                id: Math.random().toString(36).substr(2, 9),
                x: data.x, y: data.y, hp: data.hp, maxHp: data.hp
            });
        }
    });

    socket.on('baitHit', (data) => {
        const r = socket.roomId;
        if (r && ROOMS[r]) {
            const bait = ROOMS[r].baits.find(b => b.id === data.id);
            if (bait) {
                bait.hp -= data.damage;
                if (bait.hp <= 0) {
                    ROOMS[r].baits = ROOMS[r].baits.filter(b => b.id !== data.id);
                }
            }
        }
    });

    socket.on('upgradePicked', () => {
        const r = socket.roomId;
        if (r && ROOMS[r]) {
            const room = ROOMS[r];
            room.readyCount++;
            const activePlayersCount = Object.values(room.players).filter(p => !p.disconnected && !p.dead).length;

            if (room.readyCount >= activePlayersCount && activePlayersCount > 0) {
                room.paused = false;
                room.readyCount = 0;
                io.to(r).emit('resumeGame');
            }
        }
    });

    socket.on('playerReady', () => {
        // v1.428: Logic removed, rooms now fresh-start on join
    });

    socket.on('disconnect', () => {
        const r = socket.roomId;
        const p = socket.playerId;
        if (r && ROOMS[r] && ROOMS[r].players[p]) {
            ROOMS[r].players[p].disconnected = true;

            let anyActive = false;
            let activePlayersCount = 0;
            for (const key in ROOMS[r].players) {
                if (!ROOMS[r].players[key].disconnected) {
                    anyActive = true;
                    if (!ROOMS[r].players[key].dead) activePlayersCount++;
                }
            }

            if (!anyActive) {
                ROOMS[r].cleanupTimer = setTimeout(() => {
                    delete ROOMS[r];
                }, 10 * 60 * 1000);
            } else if (ROOMS[r].paused) {
                if (ROOMS[r].readyCount >= activePlayersCount && activePlayersCount > 0) {
                    ROOMS[r].paused = false;
                    ROOMS[r].readyCount = 0;
                    io.to(r).emit('resumeGame');
                }
            }
        }
        flushPlayerRewards(socket); // Flush on disconnect
        broadcastServerStats();
    });
});

setInterval(() => {
    const now = Date.now();
    for (const roomId in ROOMS) {
        try {
            const room = ROOMS[roomId];
            if (!room) continue;
            if (room.paused || room.isGameOver) continue;

            // Periodic Reward Flush (every 5 seconds)
            if (now - (room.lastRewardFlush || 0) > 5000) {
                room.lastRewardFlush = now;
                Object.keys(room.players).forEach(pId => {
                    const socketId = Array.from(io.sockets.adapter.rooms.get(roomId) || []).find(sid => {
                        const s = io.sockets.sockets.get(sid);
                        return s && s.playerId === pId;
                    });
                    if (socketId) {
                        const s = io.sockets.sockets.get(socketId);
                        if (s) flushPlayerRewards(s);
                    }
                });
            }

            room.time += 1 / 20;

            const playersArr = Object.values(room.players).filter(p => !p.dead && !p.disconnected);

            const currentInterval = Math.max(100, CONFIG.SPAWN_INTERVAL / (1 + room.time / 60));
            const spawnChance = 1 / (currentInterval / 50);

            if (playersArr.length > 0 && Math.random() < spawnChance) {
                const pivot = playersArr[Math.floor(Math.random() * playersArr.length)];
                const a = Math.random() * Math.PI * 2;
                const radius = 700;
                const x = pivot.x + Math.cos(a) * radius;
                const y = pivot.y + Math.sin(a) * radius;
                const mod = Math.floor(room.time / 60) + 1;

                let isBoss = false;
                let hp = CONFIG.ENEMY_BASE_HEALTH * mod;
                let type = 1;
                let speedMod = 1;

                const rnd = Math.random();
                if (room.level >= 2 && rnd < 0.2) type = 2; // Shooter
                else if (room.level >= 3 && rnd < 0.1) type = 3; // Kamikadze
                else if (room.level >= 4 && rnd < 0.15) type = 4; // Goblin
                else if (room.level >= 5 && rnd < 0.05) type = 5; // Support
                else if (room.level >= 8 && rnd < 0.08) type = 6; // Skokan
                else if (room.level >= 10 && rnd < 0.08) type = 7; // Sebevrah
                else if (room.level >= 12 && rnd < 0.1) type = 8; // Štítonoš

                const hasBoss = room.enemies.some(e => e.isBoss);
                const isBossLevel = room.level > 0 && room.level % CONFIG.BOSS_LEVEL_INTERVAL === 0;
                const bossAlreadySpawned = room.lastBossLevelSpawned === room.level;

                if (isBossLevel && !bossAlreadySpawned && !hasBoss) {
                    isBoss = true;
                    hp = (CONFIG.ENEMY_BASE_HEALTH * mod) * 150; // 150x HP
                    type = room.nextBossType || Math.floor(Math.random() * 7) + 1;
                    if (type === 7) type = 8; // Preskocime Sebevraha (7) a dame Stitonose (8)
                    speedMod = 2; // 2x Speed for Boss
                    room.lastBossLevelSpawned = room.level;
                    room.nextBossType = null;
                    io.to(roomId).emit('bossWarning', { type: type, soon: false });
                }

                room.enemies.push({
                    id: Math.random().toString(36).substr(2, 9),
                    x: x, y: y, hp: hp, maxHp: hp, isBoss: isBoss, type: type,
                    lastShot: room.time,
                    mod: mod * speedMod,
                    possessed: false,
                    stolenGems: 0,
                    exploding: false,
                    explodeTime: 0,
                    jumpState: 'WALKING',
                    jumpProgress: 0,
                    jumpStart: { x: x, y: y },
                    jumpTarget: { x: x, y: y },
                    prepTime: 0
                });

                // Náhodné generování meteorů (překážek)
                if (Math.random() < 0.1 && room.obstacles.length < 30) {
                    room.obstacles.push({
                        id: Math.random().toString(36).substr(2, 9),
                        x: pivot.x + (Math.random() - 0.5) * 1500,
                        y: pivot.y + (Math.random() - 0.5) * 1500,
                        radius: 40 + Math.random() * 60
                    });
                }
            }

            // ZASTAVENÍ ČASU - Pokud je aktivní, nepřátelé nic nedělají
            if (now < room.frozenUntil) {
                io.to(roomId).emit('stateUpdate', {
                    players: room.players,
                    enemies: room.enemies,
                    gems: room.gems,
                    baits: room.baits,
                    tombstones: room.tombstones,
                    obstacles: room.obstacles,
                    time: room.time,
                    roomInfo: { level: room.level, xp: room.xp, nextLevelXp: room.nextLevelXp },
                    frozen: true
                });
                continue;
            }

            const possessedEnemies = room.enemies.filter(e => e.possessed);
            const normalEnemies = room.enemies.filter(e => !e.possessed);
            const targetsForNormal = [...playersArr, ...room.baits, ...possessedEnemies];

            room.enemies.forEach(enemy => {
                if (enemy.possessed) {
                    // POSEDNUTÝ UFOUN ÚTOČÍ NA NORMÁLNÍ UFOUNY
                    if (normalEnemies.length > 0) {
                        const target = normalEnemies.sort((a, b) => dist(enemy.x, enemy.y, a.x, a.y) - dist(enemy.x, enemy.y, b.x, b.y))[0];
                        const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
                        const speed = (CONFIG.ENEMY_BASE_SPEED + ((enemy.mod || 1) * 0.15)) * 1.5; // Zrychlený pohyb posedlých

                        let nextX = enemy.x + Math.cos(angle) * speed;
                        let nextY = enemy.y + Math.sin(angle) * speed;

                        room.obstacles.forEach(obs => {
                            if (dist(nextX, nextY, obs.x, obs.y) < 15 + obs.radius) {
                                const pushAngle = Math.atan2(nextY - obs.y, nextX - obs.x);
                                nextX = obs.x + Math.cos(pushAngle) * (15 + obs.radius);
                                nextY = obs.y + Math.sin(pushAngle) * (15 + obs.radius);
                            }
                        });

                        enemy.x = nextX;
                        enemy.y = nextY;

                        if (dist(enemy.x, enemy.y, target.x, target.y) < 30) {
                            target.hp -= 50;
                            enemy.hp -= 20;
                            if (target.hp <= 0) {
                                killEnemy(room, target.id);
                                room.gems.push({ id: Math.random().toString(36).substr(2, 9), x: target.x, y: target.y });
                            }
                            if (enemy.hp <= 0) {
                                killEnemy(room, enemy.id);
                            }
                        }
                    }
                } else {
                    // NORMÁLNÍ UFOUN
                    if (targetsForNormal.length === 0 && enemy.type !== 4) return;

                    let target = targetsForNormal.find(t => t.isBait);
                    if (!target) {
                        target = targetsForNormal.sort((a, b) => dist(enemy.x, enemy.y, a.x, a.y) - dist(enemy.x, enemy.y, b.x, b.y))[0];
                    }

                    if (enemy.type === 4) { // Zloděj
                        let gemTarget = room.gems.sort((a, b) => dist(enemy.x, enemy.y, a.x, a.y) - dist(enemy.x, enemy.y, b.x, b.y))[0];
                        if (gemTarget) target = gemTarget;
                        else target = { x: enemy.x * 2, y: enemy.y * 2 }; // Útěk
                    }

                    if (!target) return;

                    const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
                    let speedMult = 1;
                    if (enemy.isBoss) speedMult = 1.0; // Původní speedMod z push už je započítán
                    if (enemy.type === 2) speedMult = 0.5;
                    if (enemy.type === 5) speedMult = 0.4;
                    if (enemy.type === 3 && enemy.exploding) speedMult = 0; // Kamikadze stojí před výbuchem
                    if (enemy.type === 6) {
                        if (enemy.jumpState === 'PREPARING' || enemy.jumpState === 'JUMPING') speedMult = 0;
                        else speedMult = 0.7; // Skokan walking speed
                    }
                    if (enemy.type === 7) speedMult = 1.6; // Sebevrah
                    if (enemy.type === 8) speedMult = 0.4; // Štítonoš

                    const enemyMod = enemy.mod || 1;
                    const speed = (CONFIG.ENEMY_BASE_SPEED + (enemyMod * 0.15)) * speedMult;
                    
                    enemy.knockback = enemy.knockback || {x:0, y:0};

                    let nextX = enemy.x + Math.cos(angle) * speed + enemy.knockback.x;
                    let nextY = enemy.y + Math.sin(angle) * speed + enemy.knockback.y;
                    enemy.knockback.x *= 0.8;
                    enemy.knockback.y *= 0.8;

                    room.obstacles.forEach(obs => {
                        if (dist(nextX, nextY, obs.x, obs.y) < 15 + obs.radius) {
                            const pushAngle = Math.atan2(nextY - obs.y, nextX - obs.x);
                            nextX = obs.x + Math.cos(pushAngle) * (15 + obs.radius);
                            nextY = obs.y + Math.sin(pushAngle) * (15 + obs.radius);
                        }
                    });

                    enemy.x = nextX;
                    enemy.y = nextY;

                    if (enemy.type === 4 && target.id && room.gems.find(g => g.id === target.id)) {
                        if (dist(enemy.x, enemy.y, target.x, target.y) < 30) {
                            room.gems = room.gems.filter(g => g.id !== target.id);
                            enemy.stolenGems++;
                        }
                    }

                    if (enemy.type === 3 && !enemy.exploding) {
                        if (dist(enemy.x, enemy.y, target.x, target.y) < 80 && !target.isBait && target.hp !== undefined) {
                            enemy.exploding = true;
                            enemy.explodeTime = now + 1500;
                        }
                    }

                    if (enemy.type === 3 && enemy.exploding && now > enemy.explodeTime) {
                        enemy.hp = 0;
                        playersArr.forEach(p => { if (dist(p.x, p.y, enemy.x, enemy.y) < 150) p.hp -= 40; });
                        
                        // Kill all enemies in blast radius (properly rewarded)
                        const nearby = room.enemies.filter(e => e.id !== enemy.id && dist(e.x, e.y, enemy.x, enemy.y) < 150);
                        nearby.forEach(e => { e.hp = 0; killEnemy(room, e.id); });
                        
                        io.to(roomId).emit('explosion', { x: enemy.x, y: enemy.y, radius: 150, isNuke: false });
                        killEnemy(room, enemy.id);
                    }

                    if (enemy.type === 5) { // Support UFO Heal
                        room.enemies.forEach(e => {
                            if (e.id !== enemy.id && !e.possessed && dist(e.x, e.y, enemy.x, enemy.y) < 250) {
                                e.hp = Math.min(e.maxHp, e.hp + 0.5);
                            }
                        });
                    }
                    if (enemy.type === 2) {
                        let dynamicInterval = Math.max(1500, 5000 - (room.level * 150));
                        if (now - enemy.lastShot > dynamicInterval) {
                            let inaccuracy = Math.max(0, 0.6 - (room.level * 0.03));
                            let baseAngle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
                            let shootAngle = baseAngle + (Math.random() - 0.5) * inaccuracy;

                            let tx = enemy.x + Math.cos(shootAngle) * 100;
                            let ty = enemy.y + Math.sin(shootAngle) * 100;

                            io.to(roomId).emit('enemyShoot', {
                                x: enemy.x, y: enemy.y, tx: tx, ty: ty,
                                dmg: 10, speed: CONFIG.PROJECTILE_SPEED * 1.2, size: 8, type: 'default'
                            });
                            enemy.lastShot = now;
                        }
                    }

                    if (enemy.type === 6) { // SKOKAN (Server logic - v1.385)
                        if (!enemy.jumpState) enemy.jumpState = 'WALKING';

                        if (enemy.jumpState === 'WALKING') {
                            if (dist(enemy.x, enemy.y, target.x, target.y) < 250) {
                                enemy.jumpState = 'PREPARING';
                                enemy.prepTime = now + 1000;
                                enemy.jumpTarget = { x: target.x, y: target.y };
                            }
                        } else if (enemy.jumpState === 'PREPARING') {
                            if (now > enemy.prepTime) {
                                enemy.jumpState = 'JUMPING';
                                enemy.jumpStart = { x: enemy.x, y: enemy.y };
                                enemy.jumpProgress = 0;
                            }
                            // Stojí a míří (nedělat nic v x,y)
                        } else if (enemy.jumpState === 'JUMPING') {
                            enemy.jumpProgress += 0.04;
                            enemy.x = enemy.jumpStart.x + (enemy.jumpTarget.x - enemy.jumpStart.x) * enemy.jumpProgress;
                            enemy.y = enemy.jumpStart.y + (enemy.jumpTarget.y - enemy.jumpStart.y) * enemy.jumpProgress;

                            if (enemy.jumpProgress >= 1) {
                                enemy.jumpState = 'WALKING';
                                playersArr.forEach(p => { if (dist(enemy.x, enemy.y, p.x, p.y) < 50) p.hp -= 15; });
                            }
                        }
                    }
                    
                    if (enemy.type === 7 && !enemy.dead) { // SEBEVRAH
                        if (dist(enemy.x, enemy.y, target.x, target.y) < 55) {
                            enemy.hp = 0;
                            playersArr.forEach(p => { if (dist(enemy.x, enemy.y, p.x, p.y) < 60) p.hp -= 35; });
                        }
                    }

                    // Finální kontrola souřadnic (proti NaN)
                    if (isNaN(enemy.x) || isNaN(enemy.y)) {
                        enemy.x = 0; enemy.y = 0;
                    }
                }
            });

            io.to(roomId).emit('stateUpdate', {
                players: room.players,
                enemies: room.enemies,
                gems: room.gems,
                baits: room.baits,
                tombstones: room.tombstones,
                obstacles: room.obstacles,
                time: room.time,
                roomInfo: { level: room.level, xp: room.xp, nextLevelXp: room.nextLevelXp },
                frozen: false
            });
        } catch (err) {
            console.error(`Chyba v místnosti ${roomId}:`, err);
        }
    }
}, 33);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server běží na portu ${PORT}`));
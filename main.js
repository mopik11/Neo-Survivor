/**
 * NEO SURVIVOR - Core Game Logic
 */
window.onerror = function(msg, url, line, col, error) {
    alert("KRITICKÁ CHYBA: " + msg + "\nNa lince: " + line);
    return false;
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

const NET = { peer: null, conn: null, isHost: false, others: {}, roomId: null, lastSync: 0, pThrottle: 0, wThrottle: 0 };
const META = { currency: 0, upgrades: { hp: 0, speed: 0, luck: 0, hat: null } };
const saveMeta = () => localStorage.setItem('neoSurvivor_meta', JSON.stringify(META));
const loadMeta = () => { const d = localStorage.getItem('neoSurvivor_meta'); if (d) Object.assign(META, JSON.parse(d)); };

const GAME = {
  active: false, paused: false, kills: 0, time: 0, lastBossTime: 0, speedFactor: 1.0, zoom: 1.0, 
  entities: { player: null, enemies: [], projectiles: [], gems: [], fire: [] },
  camera: { x: 0, y: 0 }, input: {}, joystick: { active: false, startX: 80, startY: 0, currentX: 80, currentY: 0 },
  stars: [], orbiters: [], lastSniperTime: 0, canvas: null, ctx: null
};

const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const generateShortId = () => Math.random().toString(36).substr(2, 6).toUpperCase();

const AudioEngine = {
    ctx: null, music: false, menu: false,
    init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
    play(t) {
        if (!this.ctx) return; const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.connect(g); g.connect(this.ctx.destination); const n = this.ctx.currentTime;
        if (t === 'shoot') { o.type = 'triangle'; o.frequency.setValueAtTime(440, n); o.frequency.exponentialRampToValueAtTime(110, n+0.1); g.gain.setValueAtTime(0.05, n); o.start(); o.stop(n+0.1); }
        else if (t === 'hit') { o.type = 'sawtooth'; o.frequency.setValueAtTime(100, n); g.gain.setValueAtTime(0.05, n); o.start(); o.stop(n+0.1); }
        else if (t === 'lvlup') { o.type = 'sine'; o.frequency.setValueAtTime(220, n); o.frequency.exponentialRampToValueAtTime(880, n+0.5); g.gain.setValueAtTime(0.1, n); o.start(); o.stop(n+0.5); }
        else if (t === 'gem') { o.type = 'sine'; o.frequency.setValueAtTime(660, n); g.gain.setValueAtTime(0.03, n); o.start(); o.stop(n+0.1); }
    },
    playNote(f, s, d, v=0.05) { if(!this.ctx)return; const o=this.ctx.createOscillator(), g=this.ctx.createGain(); o.type='sine'; o.frequency.setValueAtTime(f, s); g.gain.setValueAtTime(v, s); g.gain.exponentialRampToValueAtTime(0.001, s+d); o.connect(g); g.connect(this.ctx.destination); o.start(s); o.stop(s+d); },
    startMenu() {
        if (this.menu || !this.ctx) return; this.menu = true;
        const freqs = { 'c': 261, 'd': 293, 'e': 329, 'f': 349, 'g': 392 }, mel = ['e','f','g','r','e','f','g','d','c'];
        let s = 0; setInterval(() => { if (!GAME.active) { const n = this.ctx.currentTime; if (mel[s%mel.length]!=='r') this.playNote(freqs[mel[s%mel.length]], n, 0.4); s++; } }, 300);
    },
    startMusic() {
        if (this.music || !this.ctx) return; this.music = true;
        let s = 0; setInterval(() => { if (GAME.active && !GAME.paused) { const n = this.ctx.currentTime; this.playNote([55, 55, 62, 49][s%4], n, 0.4, 0.02); if(s%2===1) this.playNote(110, n, 0.1, 0.01); s++; } }, 150);
    }
};

class Projectile {
  constructor(x, y, tx, ty, dmg, stats = {}) {
    this.x = x; this.y = y; const a = Math.atan2(ty - y, tx - x);
    this.vx = Math.cos(a) * CONFIG.PROJECTILE_SPEED; this.vy = Math.sin(a) * CONFIG.PROJECTILE_SPEED;
    this.damage = dmg; this.radius = stats.size || 6; this.life = 200; this.ownerId = stats.ownerId || 'local';
  }
  update() { this.x += this.vx * GAME.speedFactor; this.y += this.vy * GAME.speedFactor; this.life--; }
  draw(ctx, cam) { ctx.shadowBlur = 15; ctx.shadowColor = (this.ownerId==='local'?'#6366f1':'#f43f5e'); ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0; }
}

class Gem {
  constructor(x, y, id) { this.x = x; this.y = y; this.radius = 5; this.id = id || Math.random(); this.a = false; }
  update(p) { if(p.dead)return; if(dist(this.x,this.y,p.x,p.y)<p.magnetRange)this.a=true; if(this.a){ const ang=Math.atan2(p.y-this.y, p.x-this.x); this.x+=Math.cos(ang)*14; this.y+=Math.sin(ang)*14; } }
  draw(ctx, cam) { ctx.fillStyle = '#34d399'; ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI*2); ctx.fill(); }
}

class Enemy {
  constructor(x, y, l, id, b) { this.x = x; this.y = y; this.radius = b ? 50 : 18; this.id = id; this.isBoss = b; this.hp = CONFIG.ENEMY_BASE_HEALTH * (b?30:1) * l; this.s = (CONFIG.ENEMY_BASE_SPEED + l*0.15)*(b?0.8:1); }
  update() {
      const p = getAllAlivePlayers(); if(!p.length)return; const t = p.sort((a,b)=>dist(this.x,this.y,a.x,a.y)-dist(this.x,this.y,b.x,b.y))[0];
      const a = Math.atan2(t.y-this.y, t.x-this.x); this.x += Math.cos(a)*this.s; this.y += Math.sin(a)*this.s;
  }
  draw(ctx, cam) { ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.radius, 0, Math.PI*2); ctx.fill(); }
}

class Player {
  constructor(isLocal) {
    this.x = 0; this.y = 0; this.radius = 22; this.isLocal = isLocal; this.maxHp = CONFIG.PLAYER_BASE_HEALTH + (isLocal?META.upgrades.hp*10:0); this.hp = this.maxHp;
    this.speed = CONFIG.PLAYER_BASE_SPEED; this.damage = 10; this.fireRate = 1000; this.magnetRange = 150; this.dead = false; this.level = 1; this.xp = 0; this.nextLevelXp = 100;
  }
  update() {
    if (this.dead) return; if (!this.isLocal) { this.x += (this.targetX - this.x) * 0.25; this.y += (this.targetY - this.y) * 0.25; return; }
    let dx = 0, dy = 0; if (GAME.joystick.active) { const d = dist(GAME.joystick.startX, GAME.joystick.startY, GAME.joystick.currentX, GAME.joystick.currentY); if(d>5){ dx=(GAME.joystick.currentX-GAME.joystick.startX)/d; dy=(GAME.joystick.currentY-GAME.joystick.startY)/d; } }
    else { if(GAME.input['w']) dy-=1; if(GAME.input['s']) dy+=1; if(GAME.input['a']) dx-=1; if(GAME.input['d']) dx+=1; }
    if(dx!==0||dy!==0){ const a=Math.atan2(dy,dx); this.x+=Math.cos(a)*this.speed; this.y+=Math.sin(a)*this.speed; }
    if(Date.now()-this.lastFired>this.fireRate){ this.attack(); this.lastFired=Date.now(); }
  }
  attack() {
    const e = GAME.entities.enemies; if(!e.length)return; const t=e.sort((a,b)=>dist(this.x,this.y,a.x,a.y)-dist(this.x,this.y,b.x,b.y))[0];
    const proj = new Projectile(this.x, this.y, t.x, t.y, this.damage); GAME.entities.projectiles.push(proj); if(NET.conn) syncShot(proj); AudioEngine.play('shoot');
  }
  draw(ctx, cam) { if(this.dead)ctx.globalAlpha=0.2; ctx.fillStyle=this.isLocal?'#6366f1':'#f43f5e'; ctx.beginPath(); ctx.arc(this.x-cam.x, this.y-cam.y, this.radius, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha=1.0; }
  addXp(a) { if(NET.conn && !NET.isHost){ NET.conn.send({type:'P_XP', a}); return; } this.xp+=a; if(this.xp>=this.nextLevelXp) this.levelUp(); updateUI(); }
  levelUp() { this.level++; this.xp=0; this.nextLevelXp*=1.2; AudioEngine.play('lvlup'); if(NET.isHost){ GAME.paused=true; if(NET.conn) NET.conn.send({type:'S_LVL'}); showLevelUp(); } }
}

function getAllAlivePlayers() { const l=[]; if(GAME.entities.player&&!GAME.entities.player.dead)l.push(GAME.entities.player); for(const id in NET.others) if(!NET.others[id].dead)l.push(NET.others[id]); return l; }

function syncShot(p) { const a=Math.atan2(p.vy, p.vx); NET.conn.send({type:'SHOT', x:p.x, y:p.y, tx:p.x+Math.cos(a)*100, ty:p.y+Math.sin(a)*100, d:p.damage}); }
function syncWorld() { if(!NET.isHost||!NET.conn)return; const now=Date.now(); if(now-NET.wThrottle<100)return; NET.wThrottle=now; const p=GAME.entities.player;
    const e = GAME.entities.enemies.filter(en=>dist(en.x,en.y,p.x,p.y)<1000).slice(0,30).map(en=>({i:en.id, x:en.x, y:en.y, h:en.hp, b:en.isBoss}));
    NET.conn.send({type:'W_S', e, g:GAME.entities.gems.slice(0,15).map(g=>({i:g.id, x:g.x, y:g.y}))});
}
function syncState() { if(!NET.isHost||!NET.conn)return; const p=GAME.entities.player; NET.conn.send({type:'S_S', l:p.level, x:p.xp, n:p.nextLevelXp, h:p.hp, p:GAME.paused}); }

function setupConn() {
    NET.conn.on('data', d => {
        if(d.type==='P_S'){ if(!NET.others[d.id])NET.others[d.id]=new Player(false); const o=NET.others[d.id]; o.targetX=d.x; o.targetY=d.y; o.dead=d.dead; }
        if(d.type==='SHOT'){ GAME.entities.projectiles.push(new Projectile(d.x, d.y, d.tx, d.ty, d.d, {ownerId:'rem'})); }
        if(d.type==='P_XP' && NET.isHost) GAME.entities.player.addXp(d.a);
        if(d.type==='S_LVL' && !NET.isHost) showLevelUp();
        if(d.type==='S_S'){ const p=GAME.entities.player; p.level=d.l; p.xp=d.x; p.nextLevelXp=d.n; p.hp=d.h; GAME.paused=d.p; updateUI(); }
        if(d.type==='W_S' && !NET.isHost){ GAME.entities.enemies=d.e.map(he=> { const e=new Enemy(he.x,he.y,1,he.i,he.b); e.hp=he.h; return e; }); GAME.entities.gems=d.g.map(hg=>new Gem(hg.x,hg.y,hg.i)); }
    });
}

const LOBBY = {
    gun: null, servers: {},
    init() { if(typeof Gun==='undefined'||this.gun)return; this.gun=Gun(['https://gun-manhattan.herokuapp.com/gun','https://gun-sjc.herokuapp.com/gun']); this.scan(); },
    broadcast(id) { if(!this.gun||!id||id==='Načítám...')return; this.gun.get('neo-lobby-v4').get(id).put({id, t:Date.now()}); },
    scan() { this.gun.get('neo-lobby-v4').map().on((d,id)=>{ if(d && Date.now()-d.t<60000){ this.servers[id]=d; this.updateUI(); } }); },
    updateUI() { const c=document.getElementById('server-list'); if(!c)return; c.innerHTML=''; Object.values(this.servers).forEach(s=>{ if(Date.now()-s.t>30000)return; const i=document.createElement('div'); i.className='server-item'; i.style='display:flex;justify-content:space-between;padding:10px;background:rgba(255,255,255,0.05);margin-bottom:5px;border-radius:8px;'; i.innerHTML=`<b>${s.id}</b><button onclick="connectToId('${s.id}')" style="background:#6366f1;border:none;color:white;padding:5px 10px;border-radius:4px;cursor:pointer;">PŘIPOJIT</button>`; c.appendChild(i); }); }
}
window.connectToId = id => { document.getElementById('input-join-id').value=id; document.getElementById('btn-join-room').click(); };

function init() {
  GAME.canvas = document.getElementById('game-canvas'); GAME.ctx = GAME.canvas.getContext('2d'); loadMeta();
  window.addEventListener('resize', () => { GAME.canvas.width=window.innerWidth; GAME.canvas.height=window.innerHeight; });
  GAME.canvas.width=window.innerWidth; GAME.canvas.height=window.innerHeight;
  AudioEngine.init(); AudioEngine.startMenu();
  
  document.getElementById('btn-start').onclick = () => { AudioEngine.startMusic(); startGame(); };
  document.getElementById('btn-multiplayer').onclick = () => { if(!NET.peer){ const id=generateShortId(); NET.peer=new Peer(id); NET.peer.on('open', rid=>{ NET.roomId=rid; document.getElementById('my-id-display').innerText=rid; }); NET.peer.on('connection', c=>{ NET.conn=c; NET.isHost=true; setupConn(); AudioEngine.startMusic(); startGame(); }); LOBBY.init(); } document.getElementById('multiplayer-modal').classList.add('active'); };
  document.getElementById('btn-create-host').onclick = () => { if(!NET.roomId)return; LOBBY.broadcast(NET.roomId); NET.isHost=true; startGame(); };
  document.getElementById('btn-join-room').onclick = () => { const id=document.getElementById('input-join-id').value.trim().toUpperCase(); if(!id)return; NET.conn=NET.peer.connect(id); NET.isHost=false; setupConn(); AudioEngine.startMusic(); };
  document.getElementById('btn-close-mp').onclick = () => document.getElementById('multiplayer-modal').classList.remove('active');
  document.getElementById('btn-refresh-lobby').onclick = () => { LOBBY.servers={}; LOBBY.scan(); };
  document.getElementById('btn-copy-id').onclick = () => { navigator.clipboard.writeText(NET.roomId); alert("Kód zkopírován!"); };
  document.getElementById('btn-resume').onclick = () => { GAME.paused=false; document.getElementById('pause-modal').classList.remove('active'); if(NET.isHost&&NET.conn)syncState(); };
  document.querySelectorAll('.btn-reload').forEach(b=>b.onclick=()=>location.reload());
  
  requestAnimationFrame(loop);
}

function startGame() { GAME.active=true; document.querySelectorAll('.modal').forEach(m=>m.classList.remove('active')); GAME.entities.player=new Player(true); spawnLoop(); }
function spawnLoop() { if(GAME.active && !GAME.paused && (!NET.peer || NET.isHost)){ const a=Math.random()*Math.PI*2; const x=GAME.entities.player.x+Math.cos(a)*700, y=GAME.entities.player.y+Math.sin(a)*700; GAME.entities.enemies.push(new Enemy(x,y,1,Math.random())); } setTimeout(spawnLoop, 1000); }
function updateUI() { const p=GAME.entities.player; document.getElementById('level-display').innerText=`LVL ${p.level}`; document.getElementById('xp-bar-fill').style.width=`${(p.xp/p.nextLevelXp)*100}%`; document.getElementById('hp-bar-fill').style.width=`${(p.hp/p.maxHp)*100}%`; }
function showLevelUp() { GAME.paused=true; const m=document.getElementById('levelup-modal'), c=document.getElementById('upgrade-options'); c.innerHTML=''; [{n:'Damage',id:'d'},{n:'Speed',id:'s'}].forEach(u=>{ const b=document.createElement('div'); b.className='upgrade-card'; b.innerHTML=`<h3>${u.n}</h3>`; b.onclick=()=>{ if(u.id==='d')GAME.entities.player.damage*=2; else GAME.entities.player.speed*=1.2; m.classList.remove('active'); if(NET.isHost){GAME.paused=false; if(NET.conn)syncState();} }; c.appendChild(b); }); m.classList.add('active'); }

function loop() {
  if(GAME.active && !GAME.paused){
    const p=GAME.entities.player; p.update(); GAME.camera.x=p.x-GAME.canvas.width/2; GAME.camera.y=p.y-GAME.canvas.height/2;
    if(NET.conn){ const now=Date.now(); if(now-NET.pThrottle>20){ NET.pThrottle=now; NET.conn.send({type:'P_S', id:NET.roomId, x:p.x, y:p.y, dead:p.dead}); } if(NET.isHost){ syncWorld(); syncState(); } }
    for(const id in NET.others) NET.others[id].update();
    GAME.entities.enemies.forEach(e=>{ e.update(); getAllAlivePlayers().forEach(ap=>{ if(dist(ap.x,ap.y,e.x,e.y)<ap.radius+e.radius){ ap.hp-=0.2; if(ap.hp<=0)ap.dead=true; } }); });
    GAME.entities.projectiles.forEach((pr,pi)=>{ pr.update(); if(pr.life<=0)GAME.entities.projectiles.splice(pi,1); GAME.entities.enemies.forEach((e,ei)=>{ if(dist(pr.x,pr.y,e.x,e.y)<pr.radius+e.radius){ e.hp-=pr.damage; if(e.hp<=0){ GAME.entities.enemies.splice(ei,1); if(NET.isHost)GAME.entities.gems.push(new Gem(e.x,e.y)); } } }); });
    GAME.entities.gems.forEach((g,i)=>{ g.update(p); if(!p.dead && dist(p.x,p.y,g.x,g.y)<p.radius+g.radius){ p.addXp(10); GAME.entities.gems.splice(i,1); } });
    updateUI();
  }
  const ctx=GAME.ctx, cam=GAME.camera; ctx.fillStyle='#020617'; ctx.fillRect(0,0,GAME.canvas.width,GAME.canvas.height);
  if(GAME.active){ ctx.save(); ctx.translate(-cam.x, -cam.y); GAME.entities.gems.forEach(g=>g.draw(ctx,{x:0,y:0})); GAME.entities.projectiles.forEach(pr=>pr.draw(ctx,{x:0,y:0})); GAME.entities.enemies.forEach(e=>e.draw(ctx,{x:0,y:0})); for(const id in NET.others) NET.others[id].draw(ctx,{x:0,y:0}); GAME.entities.player.draw(ctx,{x:0,y:0}); ctx.restore(); }
  requestAnimationFrame(loop);
}
init();

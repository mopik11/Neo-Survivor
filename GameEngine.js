/**
 * NEO SURVIVOR - Shared Game Engine
 * This module contains ALL game logic, physics, and state management.
 * It is environment-agnostic (works in Node.js and Browser).
 */

class GameEngine {
    constructor(config = {}) {
        this.config = {
            width: 2000,
            height: 2000,
            enemyBaseHp: 20,
            playerBaseHp: 120,
            ...config
        };

        this.state = {
            players: {},
            enemies: [],
            projectiles: [],
            gems: [],
            time: 0,
            level: 1,
            xp: 0,
            nextLevelXp: 100,
            isGameOver: false
        };

        this.lastUpdateTime = Date.now();
    }

    // --- PLAYER MANAGEMENT ---
    addPlayer(id, name, hat = null) {
        this.state.players[id] = {
            id,
            name,
            x: this.config.width / 2,
            y: this.config.height / 2,
            hp: this.config.playerBaseHp,
            maxHp: this.config.playerBaseHp,
            level: 1,
            speed: 3.5,
            angle: 0,
            inputs: { up: false, down: false, left: false, right: false, mouseAngle: 0 },
            hat: hat,
            dead: false,
            score: 0,
            stats: { dmg: 10, crit: 0.05, critDmg: 2, fireRate: 0.5, lastShot: 0 }
        };
    }

    removePlayer(id) {
        delete this.state.players[id];
    }

    handleInput(id, input) {
        const p = this.state.players[id];
        if (!p || p.dead) return;
        p.inputs = { ...p.inputs, ...input };
    }

    // --- CORE LOOP ---
    update(dt) {
        if (this.state.isGameOver) return;

        this.state.time += dt;

        this.updatePlayers(dt);
        this.updateEnemies(dt);
        this.updateProjectiles(dt);
        this.checkCollisions();
        
        // Spawn logic (should be moved to an internal timer or handled by caller)
        this.spawnLogic(dt);
    }

    updatePlayers(dt) {
        for (const id in this.state.players) {
            const p = this.state.players[id];
            if (p.dead) continue;

            let vx = 0;
            let vy = 0;
            if (p.inputs.left) vx -= 1;
            if (p.inputs.right) vx += 1;
            if (p.inputs.up) vy -= 1;
            if (p.inputs.down) vy += 1;

            if (vx !== 0 || vy !== 0) {
                const mag = Math.sqrt(vx * vx + vy * vy);
                p.x += (vx / mag) * p.speed * (dt / 16.66);
                p.y += (vy / mag) * p.speed * (dt / 16.66);
            }

            // Boundary check
            p.x = Math.max(0, Math.min(this.config.width, p.x));
            p.y = Math.max(0, Math.min(this.config.height, p.y));
            
            p.angle = p.inputs.mouseAngle;

            // Shooting logic
            if (p.inputs.shooting && this.state.time - p.stats.lastShot > p.stats.fireRate * 1000) {
                this.state.projectiles.push({
                    id: Math.random().toString(36).substr(2, 9),
                    playerId: p.id,
                    x: p.x,
                    y: p.y,
                    angle: p.angle,
                    speed: 8,
                    dmg: p.stats.dmg,
                    life: 2000
                });
                p.stats.lastShot = this.state.time;
            }
        }
    }

    updateEnemies(dt) {
        // Find nearest player for each enemy
        this.state.enemies.forEach(e => {
            let nearest = null;
            let minDist = Infinity;

            for (const id in this.state.players) {
                const p = this.state.players[id];
                if (p.dead) continue;
                const d = Math.sqrt((p.x - e.x) ** 2 + (p.y - e.y) ** 2);
                if (d < minDist) {
                    minDist = d;
                    nearest = p;
                }
            }

            if (nearest) {
                const angle = Math.atan2(nearest.y - e.y, nearest.x - e.x);
                e.x += Math.cos(angle) * e.speed * (dt / 16.66);
                e.y += Math.sin(angle) * e.speed * (dt / 16.66);
            }
        });
    }

    updateProjectiles(dt) {
        this.state.projectiles = this.state.projectiles.filter(proj => {
            proj.x += Math.cos(proj.angle) * proj.speed * (dt / 16.66);
            proj.y += Math.sin(proj.angle) * proj.speed * (dt / 16.66);
            proj.life -= dt;
            
            // Check if out of bounds or dead
            return proj.life > 0 && 
                   proj.x >= 0 && proj.x <= this.config.width && 
                   proj.y >= 0 && proj.y <= this.config.height;
        });
    }

    checkCollisions() {
        // Player vs Gem
        for (const id in this.state.players) {
            const p = this.state.players[id];
            if (p.dead) continue;

            this.state.gems = this.state.gems.filter(gem => {
                const d = Math.sqrt((p.x - gem.x) ** 2 + (p.y - gem.y) ** 2);
                if (d < 30) {
                    this.addXp(gem.xp || 10);
                    return false;
                }
                return true;
            });
        }

        // Projectile vs Enemy
        this.state.projectiles.forEach(proj => {
            this.state.enemies.forEach(enemy => {
                if (enemy.hp <= 0) return;
                const d = Math.sqrt((proj.x - enemy.x) ** 2 + (proj.y - enemy.y) ** 2);
                if (d < enemy.radius) {
                    enemy.hp -= proj.dmg;
                    proj.life = 0; // Destroy projectile
                    if (enemy.hp <= 0) {
                        this.state.gems.push({ x: enemy.x, y: enemy.y, xp: 20 });
                    }
                }
            });
        });
        
        this.state.enemies = this.state.enemies.filter(e => e.hp > 0);
    }

    addXp(amount) {
        this.state.xp += amount;
        if (this.state.xp >= this.state.nextLevelXp) {
            this.state.level++;
            this.state.xp -= this.state.nextLevelXp;
            this.state.nextLevelXp = Math.floor(this.state.nextLevelXp * 1.2);
            // Trigger Level Up choice? (Should be handled by state flag)
        }
    }

    spawnLogic(dt) {
        // Simplified spawn logic for demonstration
        if (this.state.enemies.length < 5 + this.state.level * 2) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 600;
            // Pick a random player as center
            const playerIds = Object.keys(this.state.players);
            if (playerIds.length === 0) return;
            const p = this.state.players[playerIds[0]];
            
            this.state.enemies.push({
                id: Math.random().toString(36).substr(2, 9),
                x: p.x + Math.cos(angle) * dist,
                y: p.y + Math.sin(angle) * dist,
                hp: this.config.enemyBaseHp,
                maxHp: this.config.enemyBaseHp,
                speed: 1.5 + Math.random(),
                radius: 15
            });
        }
    }

    // --- SERIALIZATION ---
    getState() {
        return this.state;
    }
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameEngine;
} else {
    window.GameEngine = GameEngine;
}

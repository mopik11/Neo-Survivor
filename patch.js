const fs = require('fs');
let content = fs.readFileSync('main.js', 'utf8');

const upgrades = {
    "Zvýšení Síly": ["Damage Boost", "Schadens-Boost", "Aumento de Daño"],
    "Poškození x2": ["Damage x2", "Schaden x2", "Daño x2"],
    "Rychlé Boty": ["Fast Boots", "Schnelle Stiefel", "Botas Rápidas"],
    "+15% rychlost pohybu": ["+15% movement speed", "+15% Bewegungsgeschwindigkeit", "+15% velocidad de movimiento"],
    "Rychlá Palba": ["Rapid Fire", "Schnellfeuer", "Fuego Rápido"],
    "-20% prodleva útoku": ["-20% attack delay", "-20% Angriffsverzögerung", "-20% retraso de ataque"],
    "Energetický Štít": ["Energy Shield", "Energieschild", "Escudo de Energía"],
    "Snížení poškození o 20%": ["Damage reduced by 20%", "Schaden um 20% reduziert", "Daño reducido en 20%"],
    "Růst": ["Growth", "Wachstum", "Crecimiento"],
    "+10% max HP a plný heal": ["+10% max HP and full heal", "+10% max HP und volle Heilung", "+10% HP máx y curación completa"],
    "Více Střel": ["More Projectiles", "Mehr Projektile", "Más Proyectiles"],
    "+1 projektil navíc": ["+1 extra projectile", "+1 extra Projektil", "+1 proyectil extra"],
    "Průraznost": ["Piercing", "Durchschlag", "Perforación"],
    "Paprsek/Střela projde více nepřátely": ["Shot passes through more enemies", "Schuss durchschlägt mehr Feinde", "El tiro atraviesa más enemigos"],
    "Dosah Zdi": ["Wall Range", "Wandreichweite", "Alcance del Muro"],
    "+25% dolet a životnost tvé zdi": ["+25% range and life for your wall", "+25% Reichweite und Lebensdauer der Wand", "+25% alcance y vida para tu muro"],
    "Zaměřovač": ["Scope", "Zielfernrohr", "Mira"],
    "+150 dosah laseru": ["+150 laser range", "+150 Laserreichweite", "+150 alcance de láser"],
    "Širší Zeď": ["Wider Wall", "Breitere Wand", "Muro más Ancho"],
    "+25% šířka zdi": ["+25% wall width", "+25% Wandbreite", "+25% ancho del muro"],
    "Obří Střely": ["Giant Shots", "Riesenschüsse", "Tiros Gigantes"],
    "+30% velikost projektilu": ["+30% projectile size", "+30% Projektilgröße", "+30% tamaño del proyectil"],
    "XP Multiplikátor": ["XP Multiplier", "XP-Multiplikator", "Multiplicador de XP"],
    "+20% bonus k XP": ["+20% XP bonus", "+20% XP-Bonus", "+20% bono de XP"],
    "Odraz": ["Bounce", "Abpraller", "Rebote"],
    "Střely se odráží k dalšímu cíli": ["Shots bounce to next target", "Schüsse prallen zum nächsten Ziel ab", "Los tiros rebotan al siguiente objetivo"],
    "Magnet na XP": ["XP Magnet", "XP-Magnet", "Imán de XP"],
    "+50% dosah sběru": ["+50% collect range", "+50% Sammelreichweite", "+50% alcance de recolección"],
    "Zlepšená Muška": ["Better Aim", "Besseres Zielen", "Mejor Puntería"],
    "+15% šance na kritický zásah": ["+15% crit chance", "+15% Krit-Chance", "+15% prob. de crítico"],
    "Kritické Poškození": ["Crit Damage", "Krit-Schaden", "Daño Crítico"],
    "Zvyšuje násobič krit. zásahu (+1x)": ["Increases crit multiplier (+1x)", "Erhöht Krit-Multiplikator (+1x)", "Aumenta el multiplicador crítico (+1x)"],
    "Silný Odhoz": ["Strong Knockback", "Starker Rückstoß", "Fuerte Empuje"],
    "+50% síla odhozu": ["+50% knockback power", "+50% Rückstoßkraft", "+50% fuerza de empuje"],
    "Regenerace": ["Regeneration", "Regeneration", "Regeneración"],
    "Obnova 1 HP/s": ["Restores 1 HP/s", "Stellt 1 HP/s wieder her", "Restaura 1 HP/s"],
    "Ultra Magnet": ["Ultra Magnet", "Ultra-Magnet", "Ultra Imán"],
    "Pomalý sběr z celé mapy": ["Slow collect from whole map", "Langsames Sammeln von der ganzen Karte", "Recolección lenta de todo el mapa"],
    "Orbitální Štít": ["Orbital Shield", "Orbitalschild", "Escudo Orbital"],
    "Vypustí rotující projektil": ["Releases rotating projectile", "Lässt rotierendes Projektil ab", "Libera proyectil rotatorio"],
    "Lifesteal": ["Lifesteal", "Lebensraub", "Robo de Vida"],
    "10% šance vyléčit si 8% HP při killu": ["10% chance to heal 8% HP on kill", "10% Chance, bei einem Kill 8% HP zu heilen", "10% de prob. de curar 8% de HP al matar"],
    "Ohnivá Stopa": ["Fire Trail", "Feuerspur", "Rastro de Fuego"],
    "Zanecháváš za sebou oheň": ["Leave fire trail behind you", "Hinterlässt Feuerspur", "Deja un rastro de fuego"],
    "Kaktus": ["Cactus", "Kaktus", "Cactus"],
    "Zabíjí dotykem (10s on, 30s off)": ["Kills on touch (10s on, 30s off)", "Tötet bei Berührung (10s an, 30s aus)", "Mata al tocar (10s on, 30s off)"],
    "Zkušenostní Pole": ["XP Field", "XP-Feld", "Campo de XP"],
    "Generuje 1 XP automaticky": ["Generates 1 XP automatically", "Generiert automatisch 1 XP", "Genera 1 XP automáticamente"],
    "Větší Výběr": ["Bigger Choice", "Größere Auswahl", "Mayor Elección"],
    "+1 možnost při levelu": ["+1 choice on level up", "+1 Auswahl beim Levelaufstieg", "+1 opción al subir de nivel"],
    "Mraziv Aura": ["Freezing Aura", "Frost-Aura", "Aura Congelante"],
    "Zpomaluje blízké nepřátele": ["Slows nearby enemies", "Verlangsamt nahe Feinde", "Ralentiza a los enemigos cercanos"],
    "Návnada": ["Bait", "Köder", "Cebo"],
    "Vypouští chutné cíle pro ufony": ["Releases tasty targets for aliens", "Lässt schmackhafte Ziele für Aliens frei", "Libera objetivos deliciosos para alienígenas"],
    "Velitel Duchů": ["Ghost Commander", "Geisterkommandant", "Comandante Fantasma"],
    "Ability: Posedne o +2 více nepřátel": ["Ability: Possess +2 more enemies", "Fähigkeit: Übernimm +2 weitere Feinde", "Habilidad: Posee +2 enemigos más"],
    "Hráči:": ["Players:", "Spieler:", "Jugadores:"],
    "Zabití": ["Kills", "Kills", "Bajas"]
};

let enLines = Object.entries(upgrades).map(([k,v]) => `            "${k}": "${v[0]}"`).join(",\n");
let deLines = Object.entries(upgrades).map(([k,v]) => `            "${k}": "${v[1]}"`).join(",\n");
let esLines = Object.entries(upgrades).map(([k,v]) => `            "${k}": "${v[2]}"`).join(",\n");

// Inject into I18N
content = content.replace(/("ZRUŠIT": "CANCEL")\n        },/, `$1,\n${enLines}\n        },`);
content = content.replace(/("ZRUŠIT": "ABBRECHEN")\n        },/, `$1,\n${deLines}\n        },`);
content = content.replace(/("ZRUŠIT": "CANCELAR")\n        }/, `$1,\n${esLines}\n        }`);

fs.writeFileSync('main.js', content, 'utf8');
console.log('Patch complete!');

import re

strings = {
    "PAUZA": ["PAUSE", "PAUSE", "PAUSA"],
    "❤️ HP": ["❤️ HP", "❤️ HP", "❤️ HP"],
    "⚔️ Poškození": ["⚔️ Damage", "⚔️ Schaden", "⚔️ Daño"],
    "👟 Rychlost": ["👟 Speed", "👟 Geschwindigkeit", "👟 Velocidad"],
    "🌀 Počet Střel": ["🌀 Projectiles", "🌀 Projektile", "🌀 Proyectiles"],
    "🔥 Prodleva": ["🔥 Fire Rate", "🔥 Feuerrate", "🔥 Cadencia"],
    "🎯 Krit. Šance": ["🎯 Crit Chance", "🎯 Krit-Chance", "🎯 Prob. Crítico"],
    "💥 Krit. Násobič": ["💥 Crit Multi", "💥 Krit-Multi", "💥 Multi. Crítico"],
    "🛡️ Štít": ["🛡️ Shield", "🛡️ Schild", "🛡️ Escudo"],
    "💊 Regenerace": ["💊 Regen", "💊 Regen", "💊 Regeneración"],
    "🧛 Lifesteal": ["🧛 Lifesteal", "🧛 Lebensraub", "🧛 Robo de Vida"],
    "Tvoje zpráva...": ["Your message...", "Deine Nachricht...", "Tu mensaje..."],
    "ODESLAT ZPRÁVU": ["SEND MESSAGE", "NACHRICHT SENDEN", "ENVIAR MENSAJE"],
    "ČEKÁNÍ...": ["WAITING...", "WARTEN...", "ESPERANDO..."],
    "Čekáme, až si ostatní hráči vyberou vylepšení.": ["Waiting for other players to choose upgrades.", "Warten darauf, dass andere Spieler Upgrades wählen.", "Esperando a que otros jugadores elijan mejoras."],
    "Napiš mi, co bys chtěl vylepšit nebo nahlásit chybu.": ["Tell me what to improve or report a bug.", "Sag mir, was ich verbessern soll oder melde einen Fehler.", "Dime qué mejorar o reporta un error."],
    "ROZUMÍM, CHCI DO BOJE!": ["UNDERSTOOD, LET'S FIGHT!", "VERSTANDEN, LASS UNS KÄMPFEN!", "¡ENTENDIDO, A LUCHAR!"],
    "VESMÍRNÝ MANUÁL": ["SPACE MANUAL", "WELTRAUM-HANDBUCH", "MANUAL ESPACIAL"],
    "Vše, co potřebuješ vědět k přežití v hlubokém vesmíru.": ["Everything you need to know to survive in deep space.", "Alles, was du wissen musst, um im tiefen Weltraum zu überleben.", "Todo lo que necesitas saber para sobrevivir en el espacio profundo."],
    "🕹️ ZÁKLADNÍ OVLÁDÁNÍ": ["🕹️ BASIC CONTROLS", "🕹️ GRUNDSTEUERUNG", "🕹️ CONTROLES BÁSICOS"],
    "Klávesy": ["Keys", "Tasten", "Teclas"],
    "nebo": ["or", "oder", "o"],
    "na mobilu.": ["on mobile.", "auf dem Handy.", "en el móvil."],
    "Levý klik": ["Left click", "Linksklick", "Clic izquierdo"],
    "Klepnutí": ["Tap", "Tippen", "Toque"],
    "(pravá strana mobilu).": ["(right side of mobile).", "(rechte Seite des Handys).", "(lado derecho del móvil)."],
    "Klávesa": ["Key", "Taste", "Tecla"],
    "pro statistiky a pauzu.": ["for stats and pause.", "für Statistiken und Pause.", "para estadísticas y pausa."],
    "🧬 VÝVOJ A LEVELY": ["🧬 EVOLUTION AND LEVELS", "🧬 ENTWICKLUNG UND LEVEL", "🧬 EVOLUCIÓN Y NIVELES"],
    "Zabíjej nepřátele a sbírej": ["Kill enemies and collect", "Töte Feinde und sammle", "Mata enemigos y recoge"],
    ". Každý nový level ti nabídne 3 náhodná vylepšení.": [". Each new level offers 3 random upgrades.", ". Jedes neue Level bietet 3 zufällige Upgrades.", ". Cada nuevo nivel ofrece 3 mejoras aleatorias."],
    "Tip: Zaměř se nejdřív na poškození (Damage) a pak na dosah (Magnet)!": ["Tip: Focus on damage first, then magnet range!", "Tipp: Konzentriere dich zuerst auf Schaden, dann auf Magnetreichweite!", "Consejo: ¡Concéntrate primero en el daño, luego en el alcance del imán!"],
    "🚀 FLOTILA LODÍ": ["🚀 SHIP FLEET", "🚀 SCHIFFSFLOTTE", "🚀 FLOTA DE NAVES"],
    "🚀 Průzkumník:": ["🚀 Explorer:", "🚀 Entdecker:", "🚀 Explorador:"],
    "Základní vyvážená loď.": ["Basic balanced ship.", "Ausgewogenes Basisschiff.", "Nave básica equilibrada."],
    "⚡ Laserový křižník:": ["⚡ Laser Cruiser:", "⚡ Laserkreuzer:", "⚡ Crucero Láser:"],
    "Střílí zničující lasery na více cílů.": ["Shoots devastating lasers at multiple targets.", "Schießt verheerende Laser auf mehrere Ziele.", "Dispara láseres devastadores a múltiples objetivos."],
    "🛡️ Obránce:": ["🛡️ Defender:", "🛡️ Verteidiger:", "🛡️ Defensor:"],
    "Základní útok tvoří rotující bariéru.": ["Basic attack forms a rotating barrier.", "Standardangriff bildet eine rotierende Barriere.", "El ataque básico forma una barrera rotatoria."],
    "💥 Brokovnice:": ["💥 Shotgun:", "💥 Schrotflinte:", "💥 Escopeta:"],
    "Střílí salvu nábojů zblízka.": ["Fires a shotgun blast at close range.", "Feuert eine Schrotladung auf kurze Distanz ab.", "Dispara una ráfaga de escopeta a corta distancia."],
    "💀 Nekromancer:": ["💀 Necromancer:", "💀 Nekromant:", "💀 Nigromante:"],
    "Vyvolává armádu pomocníků z mrtvých.": ["Summons an army of helpers from the dead.", "Beschwört eine Armee von Helfern von den Toten.", "Invoca un ejército de ayudantes de entre los muertos."],
    "👾 ATLAS MIMOZEMŠŤANŮ": ["👾 ALIEN ATLAS", "👾 ALIEN-ATLAS", "👾 ATLAS ALIENÍGENA"],
    "Základní červený nepřítel, útočí ve vlnách.": ["Basic red enemy, attacks in waves.", "Einfacher roter Feind, greift in Wellen an.", "Enemigo rojo básico, ataca en oleadas."],
    "Zvláštní fialový/modrý tvar, pohybuje se jinak.": ["Special purple/blue shape, moves differently.", "Spezielle lila/blaue Form, bewegt sich anders.", "Forma especial morada/azul, se mueve de manera diferente."],
    "Rychle se přiblíží a vybuchne, když zasáhne cíl.": ["Quickly approaches and explodes on impact.", "Nähert sich schnell und explodiert beim Aufprall.", "Se acerca rápidamente y explota al impactar."],
    "Zlatá hvězdička, je neuvěřitelně rychlý!": ["Golden star, incredibly fast!", "Goldener Stern, unglaublich schnell!", "¡Estrella dorada, increíblemente rápido!"],
    "Léčí a posiluje ostatní ufony v okolí.": ["Heals and buffs other aliens nearby.", "Heilt und stärkt andere Aliens in der Nähe.", "Cura y mejora a otros alienígenas cercanos."],
    "Vyznačí si cíl a bleskově tam doskočí.": ["Marks a target and leaps there lightning fast.", "Markiert ein Ziel und springt blitzschnell dorthin.", "Marca un objetivo y salta allí a la velocidad del rayo."],
    "Obří mnohostěn s velkým HP. Každou minutu.": ["Giant polygon with huge HP. Every minute.", "Riesiges Polygon mit viel HP. Jede Minute.", "Polígono gigante con mucho HP. Cada minuto."],
    "🎁 TAKTICKÁ VÝBAVA": ["🎁 TACTICAL GEAR", "🎁 TAKTISCHE AUSRÜSTUNG", "🎁 EQUIPO TÁCTICO"],
    "☢️ Nuke:": ["☢️ Nuke:", "☢️ Atombombe:", "☢️ Bomba Nuclear:"],
    "Vymaže vše na obrazovce.": ["Wipes everything on screen.", "Löscht alles auf dem Bildschirm.", "Elimina todo en la pantalla."],
    "🧲 Magnet:": ["🧲 Magnet:", "🧲 Magnet:", "🧲 Imán:"],
    "Přitáhne všechny gemy z dálky.": ["Pulls all gems from afar.", "Zieht alle Edelsteine aus der Ferne an.", "Atrae todas las gemas desde lejos."],
    "➕ Lékárna:": ["➕ Medkit:", "➕ Medkit:", "➕ Botiquín:"],
    "Opraví poškozený trup lodi.": ["Repairs damaged ship hull.", "Repariert beschädigte Schiffshülle.", "Repara el casco dañado de la nave."],
    "💡 POKROČILÉ TIPY": ["💡 ADVANCED TIPS", "💡 ERWEITERTE TIPPS", "💡 CONSEJOS AVANZADOS"],
    "Skvělá kombinace pro nesmrtelnost.": ["Great combo for immortality.", "Tolle Kombination für Unsterblichkeit.", "Gran combinación para la inmortalidad."],
    "Objevuje se každou minutu. Vždy se mu snaž uhýbat do stran!": ["Spawns every minute. Always try to dodge sideways!", "Spawnt jede Minute. Versuche immer, seitwärts auszuweichen!", "Aparece cada minuto. ¡Intenta siempre esquivar hacia los lados!"],
    "Za 10 killů máš 1 Doge. Kupuj za ně trvalá vylepšení!": ["10 kills = 1 Doge. Buy permanent upgrades with them!", "10 Kills = 1 Doge. Kaufe damit permanente Upgrades!", "10 bajas = 1 Doge. ¡Compra mejoras permanentes con ellos!"]
}

en_lines = ',\n'.join([f'            "{k}": "{v[0]}"' for k,v in strings.items()])
de_lines = ',\n'.join([f'            "{k}": "{v[1]}"' for k,v in strings.items()])
es_lines = ',\n'.join([f'            "{k}": "{v[2]}"' for k,v in strings.items()])

with open('main.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r'("Zabití": "Kills")\n        },', r'\1,\n' + en_lines + '\n        },', content)
content = re.sub(r'("Zabití": "Kills")\n        },', r'\1,\n' + de_lines + '\n        },', content)
content = re.sub(r'("Zabití": "Bajas")\n        }', r'\1,\n' + es_lines + '\n        }', content)

with open('main.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated main.js I18N.")

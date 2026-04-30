import re

strings = {
    "Hráč:": ["Player:", "Spieler:", "Jugador:"],
    "Nej. Level:": ["Max Level:", "Max Level:", "Nivel Máx:"],
    "Aktivních hráčů online:": ["Active players online:", "Aktive Spieler online:", "Jugadores activos online:"],
    "v bitvě": ["in battle", "im Kampf", "en batalla"]
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

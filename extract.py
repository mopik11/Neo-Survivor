import json
import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# remove scripts and styles
html = re.sub(r'<script.*?>.*?</script>', '', html, flags=re.DOTALL)
html = re.sub(r'<style.*?>.*?</style>', '', html, flags=re.DOTALL)
# get text between tags
texts = re.findall(r'>([^<]+)<', html)
# get placeholders
placeholders = re.findall(r'placeholder="([^"]+)"', html)

all_texts = set(t.strip() for t in texts + placeholders if t.strip() and not t.strip().isascii())

with open('texts.json', 'w', encoding='utf-8') as f:
    json.dump(list(all_texts), f, ensure_ascii=False, indent=2)

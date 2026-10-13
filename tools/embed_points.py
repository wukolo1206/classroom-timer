"""Embed independent points assets without rebuilding other embedded tools."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def embed():
    path = ROOT / 'index.html'
    text = path.read_text(encoding='utf-8')
    assets = [('AVATAR_STYLE', 'avatars.css', 'style'), ('POINTS_STYLE', 'points.css', 'style'),
              ('AVATAR_SCRIPT', 'avatars.js', 'script'), ('POINTS_SCRIPT', 'points.js', 'script')]
    for kind, filename, tag in assets:
        start, end = kind + '_START', kind + '_END'
        source = (ROOT / 'points' / filename).read_text(encoding='utf-8').rstrip()
        block = '<!-- ' + start + ' -->\n<' + tag + '>\n' + source + '\n</' + tag + '>\n<!-- ' + end + ' -->'
        pattern = r'<!-- ' + start + r' -->.*?<!-- ' + end + r' -->'
        if re.search(pattern, text, flags=re.S):
            text = re.sub(pattern, lambda _: block, text, flags=re.S)
        else:
            anchor = '</head>' if tag == 'style' else ('<!-- POINTS_SCRIPT_START -->' if kind == 'AVATAR_SCRIPT' else '</body>\n</html>')
            assert anchor in text, 'Missing insertion anchor'
            before, after = text.split(anchor, 1) if tag == 'style' else text.rsplit(anchor, 1)
            text = before + block + '\n' + anchor + after
    for target in [path, ROOT / 'gas' / 'index.html']:
        if target.exists():
            target.with_name(target.name + '.bak').write_bytes(target.read_bytes())
        target.write_text(text, encoding='utf-8', newline='\n')

if __name__ == '__main__':
    embed()

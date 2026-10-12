"""Embed independent points assets without rebuilding other embedded tools."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def embed():
    path = ROOT / 'index.html'
    text = path.read_text(encoding='utf-8')
    for kind, ext, tag in [('STYLE', 'css', 'style'), ('SCRIPT', 'js', 'script')]:
        start, end = 'POINTS_' + kind + '_START', 'POINTS_' + kind + '_END'
        source = (ROOT / 'points' / ('points.' + ext)).read_text(encoding='utf-8').rstrip()
        block = '<!-- ' + start + ' -->\n<' + tag + '>\n' + source + '\n</' + tag + '>\n<!-- ' + end + ' -->'
        pattern = r'<!-- ' + start + r' -->.*?<!-- ' + end + r' -->'
        if re.search(pattern, text, flags=re.S):
            text = re.sub(pattern, lambda _: block, text, flags=re.S)
        else:
            anchor = '</head>' if kind == 'STYLE' else '</body>\n</html>'
            assert anchor in text, 'Missing insertion anchor'
            before, after = text.rsplit(anchor, 1)
            text = before + block + '\n' + anchor + after
    for target in [path, ROOT / 'gas' / 'index.html']:
        if target.exists():
            target.with_name(target.name + '.bak').write_bytes(target.read_bytes())
        target.write_text(text, encoding='utf-8', newline='\n')

if __name__ == '__main__':
    embed()

"""Embed only the garden opener and shared projection engine; preserve other tools."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def embed():
    for filename, mode in [('index.html', 'c408'), ('universal.html', 'universal')]:
        path = ROOT / filename
        text = path.read_text(encoding='utf-8')
        for marker, source in [('GARDEN_CORE', 'core.js'), ('GARDEN_LAUNCHER', 'launcher.js')]:
            code = (ROOT / 'garden' / source).read_text(encoding='utf-8').rstrip()
            assert '`' not in code and '</script' not in code.lower()
            block = '<!-- '+marker+'_START -->\n<script>\n'+code+'\n</script>\n<!-- '+marker+'_END -->'
            pattern = r'<!-- '+marker+r'_START -->.*?<!-- '+marker+'_END -->'
            if re.search(pattern, text, re.S):
                text = re.sub(pattern, lambda _: block, text, flags=re.S)
            else:
                before, after = text.rsplit('</body>', 1)
                text = before + block + '\n</body>' + after
        if 'data-garden-launch=' not in text:
            anchor = '        <div id="noise-display"'
            assert anchor in text
            banner = ('        <div class="mb-4 p-4 rounded-xl border border-emerald-200 bg-emerald-50 flex flex-wrap items-center gap-3">'
                      '<div class="flex-1"><b class="text-emerald-900">🌿 班級祕密花園</b>'
                      '<p class="text-sm text-emerald-800">輕聲專注，班級夥伴就會慢慢出現。另開視窗使用麥克風，請保留本頁以更新頭像。</p></div>'
                      '<button type="button" data-garden-launch="'+mode+'" class="px-4 py-2 rounded-lg bg-emerald-700 text-white font-bold">開啟班級祕密花園 ↗</button></div>\n')
            text = text.replace(anchor, banner + anchor, 1)
        path.with_name(path.name+'.bak').write_bytes(path.read_bytes())
        path.write_text(text, encoding='utf-8', newline='\n')
    target = ROOT / 'gas' / 'index.html'
    target.with_name(target.name+'.bak').write_bytes(target.read_bytes())
    target.write_bytes((ROOT/'index.html').read_bytes())

if __name__ == '__main__':
    embed()

"""Embed board sync source while preserving existing points assets."""
from pathlib import Path
import re
ROOT = Path(__file__).resolve().parents[1]
def embed():
    path = ROOT / 'index.html'
    text = path.read_text(encoding='utf-8')
    source = (ROOT / 'board-sync/board-sync.js').read_text(encoding='utf-8-sig').rstrip()
    block = '// BOARD_SCORE_SYNC_START\n' + source + '\n// BOARD_SCORE_SYNC_END'
    pattern = r'// BOARD_SCORE_SYNC_START.*?// BOARD_SCORE_SYNC_END'
    if re.search(pattern,text,re.S):
        text = re.sub(pattern,lambda _:block,text,flags=re.S)
    else:
        anchor = '    initGroupPanel();\n'
        assert text.count(anchor) == 1
        text = text.replace(anchor, anchor + block + '\n', 1)
    for target in (path, ROOT / 'gas/index.html'):
        if target.exists():
            target.with_name(target.name+'.bak').write_bytes(target.read_bytes())
        target.write_text(text,encoding='utf-8',newline='\n')
if __name__ == '__main__':
    embed()

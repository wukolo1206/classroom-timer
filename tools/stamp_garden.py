"""Stamp cache-busting versions into garden.html.

Run after changing anything garden.html loads (garden/*.js|css, points/avatars*.js):
    python tools/stamp_garden.py

- Every local <script src> / <link href> gets ?v=<content hash>, so a changed file is a new URL.
- garden/build.txt holds the build id; the inline check in garden.html compares it (no-store fetch)
  and reloads once with ?b=<build> when a stale cached garden.html is open.
Re-running without changes leaves the files byte-identical.
"""
import hashlib
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = ROOT / 'garden.html'
BUILD = ROOT / 'garden' / 'build.txt'
ASSET = re.compile(r'((?:src|href)=")((?:garden|points)/[^"?#]+)(?:\?v=[0-9a-f]+)?(")')
BUILD_LINE = re.compile(r"var b='[0-9a-f]*'")
CHECK = ("  <script>(function(){var b='';try{fetch('garden/build.txt?t='+Date.now(),{cache:'no-store'})"
         ".then(function(r){return r.ok?r.text():null;}).then(function(t){t=t&&t.trim();if(!t||t===b)return;"
         "var u=new URL(location.href);if(u.searchParams.get('b')===t)return;u.searchParams.set('b',t);location.replace(u.href);})"
         ".catch(function(){});}catch(e){}})();</script>\n")


def digest(data):
    return hashlib.sha256(data.replace(b'\r\n', b'\n')).hexdigest()[:10]


def main():
    html = PAGE.read_bytes().decode('utf-8')
    if "fetch('garden/build.txt" not in html:
        html = html.replace('  <link rel="stylesheet"', CHECK + '  <link rel="stylesheet"', 1)

    def stamp(m):
        path = ROOT / m.group(2)
        if not path.is_file():
            raise SystemExit('missing asset: ' + m.group(2))
        return m.group(1) + m.group(2) + '?v=' + digest(path.read_bytes()) + m.group(3)

    html = ASSET.sub(stamp, html)
    build = digest(BUILD_LINE.sub("var b=''", html).encode('utf-8'))
    html = BUILD_LINE.sub("var b='" + build + "'", html)
    PAGE.write_bytes(html.encode('utf-8'))
    BUILD.write_bytes((build + '\n').encode('utf-8'))
    print('build', build, '·', len(ASSET.findall(html)), 'assets stamped')


if __name__ == '__main__':
    main()

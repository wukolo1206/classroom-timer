"""把 sr-reading/sr-tool.html 嵌入 universal.html 的 #sr-source 區塊。

用法（在專案根目錄）：python tools/embed_sr.py

嵌入時把 `<!--`、`</script` 跳脫成 `<\\!--`、`<\\/script`（同 SH150 嵌入方式），
universal.html 的 ctuLoadSr 載入時再還原。原始檔本身不可以出現這兩種跳脫字串，
否則還原時會被誤改。
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "sr-reading" / "sr-tool.html"
TARGET = ROOT / "universal.html"
START = '<script type="text/plain" id="sr-source">\n'
END = "</script><!-- end #sr-source -->"


def main():
    src = SRC.read_text(encoding="utf-8").replace("\r\n", "\n")
    for bad in ("<\\!--", "<\\/script", "<\\/SCRIPT"):
        if bad in src:
            sys.exit(f"原始檔含有 {bad!r}，載入時會被還原成真的標籤，請改寫（例如 '<' + '/script>'）")
    escaped = (src.replace("<!--", "<\\!--")
                  .replace("</script", "<\\/script")
                  .replace("</SCRIPT", "<\\/SCRIPT"))

    html = TARGET.read_text(encoding="utf-8")
    nl = "\r\n" if "\r\n" in html else "\n"
    start_tag = START.replace("\n", nl)
    i = html.find(start_tag)
    if i == -1:
        sys.exit("universal.html 找不到 #sr-source 起始標記")
    j = html.find(END, i)
    if j == -1:
        sys.exit("universal.html 找不到 #sr-source 結束標記")
    body = escaped.replace("\n", nl)
    if not body.endswith(nl):
        body += nl
    new = html[:i + len(start_tag)] + body + html[j:]
    TARGET.write_text(new, encoding="utf-8", newline="")
    print(f"已嵌入 {SRC.relative_to(ROOT)}（{len(src)} 字元）到 {TARGET.name}")


if __name__ == "__main__":
    main()

"""把 sr-reading/sr-tool.html 嵌入班級工具箱與 408 版的 #sr-source 區塊。

用法（在專案根目錄）：python tools/embed_sr.py

- 全校版 universal.html、408 版 index.html 都會更新；408 版接著複製到 gas/index.html
  （GAS 版是 root index.html 的複本，部署前兩份必須相同）。
- 嵌入時把 `<!--`、`</script` 跳脫成 `<\\!--`、`<\\/script`（同 SH150 嵌入方式），
  載入時再還原。原始檔本身不可以出現這兩種跳脫字串，否則還原時會被誤改。
"""
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "sr-reading" / "sr-tool.html"
TARGETS = [ROOT / "universal.html", ROOT / "index.html"]
GAS_COPY = (ROOT / "index.html", ROOT / "gas" / "index.html")
START = '<script type="text/plain" id="sr-source">\n'
END = "</script><!-- end #sr-source -->"


def embed(target, escaped):
    html = target.read_text(encoding="utf-8")
    nl = "\r\n" if "\r\n" in html else "\n"
    start_tag = START.replace("\n", nl)
    i = html.find(start_tag)
    if i == -1:
        sys.exit(f"{target.name} 找不到 #sr-source 起始標記")
    j = html.find(END, i)
    if j == -1:
        sys.exit(f"{target.name} 找不到 #sr-source 結束標記")
    body = escaped.replace("\n", nl)
    if not body.endswith(nl):
        body += nl
    target.write_text(html[:i + len(start_tag)] + body + html[j:], encoding="utf-8", newline="")
    print(f"已嵌入到 {target.name}")


def main():
    src = SRC.read_text(encoding="utf-8").replace("\r\n", "\n")
    for bad in ("<\\!--", "<\\/script", "<\\/SCRIPT"):
        if bad in src:
            sys.exit(f"原始檔含有 {bad!r}，載入時會被還原成真的標籤，請改寫（例如 '<' + '/script>'）")
    escaped = (src.replace("<!--", "<\\!--")
                  .replace("</script", "<\\/script")
                  .replace("</SCRIPT", "<\\/SCRIPT"))
    print(f"原始檔 {SRC.relative_to(ROOT)}（{len(src)} 字元）")
    for t in TARGETS:
        embed(t, escaped)
    shutil.copyfile(*GAS_COPY)
    print("已複製 index.html → gas/index.html")


if __name__ == "__main__":
    main()

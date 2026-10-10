"""部署前唯讀備份「上課表現紀錄」A～H 到 backups/（含學生姓名，已 gitignore）。

用法：python tools/backup_seat_sheet.py
成功印出列數並以 0 結束；任何錯誤都以非 0 結束，讓部署指令（set -e／&&）停下來。
"""
import datetime
import json
import os
import sys

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

TOKEN = r'D:\備課ai\google workspace\token.json'
SHEET_ID = '19zxbbVSalkk4OzfVYDWYVwDUKJyyvCBJD_NdKGHKfJA'
RANGE = "'上課表現紀錄'!A:H"
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backups')


def main():
    creds = Credentials.from_authorized_user_file(TOKEN)
    svc = build('sheets', 'v4', credentials=creds)
    res = svc.spreadsheets().values().get(spreadsheetId=SHEET_ID, range=RANGE).execute()   # 唯讀
    rows = res.get('values', [])
    if not rows or rows[0][:7] != ['日期', '座號', '姓名', '項目', '次數', '最後更新', '項目代碼']:
        sys.exit('表頭不對，停止：%r' % (rows[0] if rows else None))
    os.makedirs(OUT_DIR, exist_ok=True)
    stamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    path = os.path.join(OUT_DIR, '上課表現紀錄_A-H_部署前_%s.json' % stamp)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'range': res.get('range'), 'exportedAt': stamp, 'rows': rows}, f, ensure_ascii=False, indent=1)
    with open(path, encoding='utf-8') as f:
        back = json.load(f)['rows']
    if len(back) != len(rows):
        sys.exit('讀回列數不符，停止')
    print('備份完成：%d 列（H 欄有值 %d 列）→ %s' % (len(rows) - 1, sum(1 for r in rows[1:] if len(r) > 7 and r[7]), os.path.basename(path)))


if __name__ == '__main__':
    main()

"""
Локальный сервер для разработки: раздаёт сайт и имитирует send.php
(PHP на компьютере не нужен). Письма НЕ отправляются — заявка печатается в консоль.

Запуск:  python dev_server.py        → http://localhost:5190
На хостинге этот файл не нужен: там заявки обрабатывает настоящий send.php.
"""
import json
from email.parser import BytesParser
from email.policy import default as email_policy
from urllib.parse import parse_qs
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 5190
ROOT = Path(__file__).parent


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.split("?")[0] != "/send.php":
            return self._json(404, {"ok": False, "error": "Not found"})
        raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        ctype = self.headers.get("Content-Type", "")
        fields = {}
        if ctype.startswith("multipart/form-data"):
            msg = BytesParser(policy=email_policy).parsebytes(b"Content-Type: " + ctype.encode() + b"\r\n\r\n" + raw)
            for part in msg.iter_parts():
                name = part.get_param("name", header="content-disposition")
                if name:
                    fields[name] = part.get_content() if isinstance(part.get_content(), str) else part.get_content().decode("utf-8", "replace")
        else:
            fields = {k: v[0] for k, v in parse_qs(raw.decode("utf-8", "replace")).items()}
        get = lambda k: str(fields.get(k, "")).strip()
        if get("website"):
            return self._json(200, {"ok": True})
        digits = re.sub(r"\D", "", get("phone"))
        if len(digits) == 11 and digits[0] == "8":
            digits = "7" + digits[1:]
        if len(digits) != 11 or digits[0] != "7":
            return self._json(422, {"ok": False, "error": "Введите номер телефона полностью"})
        if not get("agree"):
            return self._json(422, {"ok": False, "error": "Нужно согласие на обработку данных"})
        print("\n=== ЗАЯВКА (dev, письмо не отправлено) ===")
        for key in ("form", "phone", "page", "cart"):
            if get(key):
                print(f"{key}: {get(key)}")
        print("==========================================\n", flush=True)
        return self._json(200, {"ok": True})


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print(f"ARTCAMINHO dev: http://localhost:{PORT}")
    ThreadingHTTPServer(("", PORT), Handler).serve_forever()

"""Minimal HTTP service for LIS or middleware integration (standard library only).

POST /check  {"sample_id": "...", "time": "...", "hba1c": 7.2, "glucose": 8.1, "glucose_unit": "mmol/L"}
-> {"status": "ok" | "watch" | "alarm" | "no_partner", "message": "...", ...}
GET /health -> {"ok": true}
"""
import json, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from .monitor import PartnerMonitor


def serve(params, state, host="127.0.0.1", port=8765):
    mon = PartnerMonitor.load(params, state); lock = threading.Lock()

    class H(BaseHTTPRequestHandler):
        def _send(self, code, obj):
            body = json.dumps(obj).encode(); self.send_response(code)
            self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body)

        def do_GET(self):
            self._send(200, {"ok": True}) if self.path == "/health" else self._send(404, {"error": "not found"})

        def do_POST(self):
            if self.path != "/check":
                return self._send(404, {"error": "not found"})
            try:
                d = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
                g = d.get("glucose"); g = None if g in (None, "") else float(g)
                if g is not None and d.get("glucose_unit", "mmol/L") == "mg/dL":
                    g /= 18.016
                with lock:
                    res = mon.check(float(d["hba1c"]), g, d.get("sample_id"), d.get("time")); mon.save_state(state)
                self._send(200, res)
            except (KeyError, ValueError) as e:
                self._send(400, {"error": f"invalid request: {e}"})

        def log_message(self, *a):
            pass

    print(f"PartnerQC listening on http://{host}:{port}  (POST /check)")
    ThreadingHTTPServer((host, port), H).serve_forever()

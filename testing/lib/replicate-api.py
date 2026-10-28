#!/usr/bin/env python3
"""A stand-in for the Replicate API endpoints the site calls, and for
Replicate's webhook deliveries.

    replicate-api.py <port-file> <log-file> --token <api-token> --secret <whsec_…>

Serves what apps/web reaches through the `replicate` client
(REPLICATE_API_BASE points it here):

    GET  /v1/webhooks/default/secret → {"key": <secret>}   (verifying deliveries)
    POST /v1/predictions             (Prefer: wait, the prompt classifier)
                                     → succeeded at once, output ["2"], or ["10"]
                                       for a prompt containing "forbidden"
    POST /v1/predictions             (the emoji model, the background remover)
                                     → "starting"; then, a moment later, the
                                       prediction is DELIVERED to its webhook:
                                       POSTed to the URL it named, signed the
                                       Standard Webhooks way with <secret> —
                                       output a PNG this server serves (a list
                                       for the emoji model, a URL for the
                                       remover), or an error for a prompt
                                       containing "explode"
    GET  /v1/predictions/<id>        → the prediction as it stands
    GET  /files/<name>.png           → a PNG (the "model output")

and refuses (401), as Replicate does, any API request whose bearer is not
<api-token>. Every request and every delivery (with the status the site
answered it with) is written to <log-file> as one JSON line. It binds a free
port on 127.0.0.1 and writes it to <port-file>.
"""
import argparse
import base64
import hashlib
import hmac
import json
import re
import threading
import time
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ap = argparse.ArgumentParser()
ap.add_argument("port_file")
ap.add_argument("log_file")
ap.add_argument("--token", required=True)
ap.add_argument("--secret", required=True)
opts = ap.parse_args()
log = open(opts.log_file, "a", buffering=1)
lock = threading.Lock()

CLASSIFIER = "1ffac777bf2c1f5a4a5073faf389fefe59a8b9326b3ca329e9d576cce658a00f"
EMOJI = "dee76b5afde21b0f01ed7925f0665b7e879c50ee718c5f78a9d38e04d523cc5e"
REMBG = "fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003"

# A 1×1 transparent PNG.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)
predictions = {}


def write(entry):
    with lock:
        log.write(json.dumps(entry) + "\n")


def sign(body: bytes, msg_id: str, ts: int) -> str:
    key = base64.b64decode(opts.secret.split("_", 1)[1])
    mac = hmac.new(key, f"{msg_id}.{ts}.".encode() + body, hashlib.sha256).digest()
    return "v1," + base64.b64encode(mac).decode()


def deliver(prediction):
    time.sleep(0.5)
    body = json.dumps(prediction).encode()
    msg_id = f"msg_{uuid.uuid4().hex}"
    ts = int(time.time())
    req = urllib.request.Request(prediction["webhook"], data=body, method="POST", headers={
        "content-type": "application/json",
        "webhook-id": msg_id,
        "webhook-timestamp": str(ts),
        "webhook-signature": sign(body, msg_id, ts),
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            status = r.status
    except urllib.error.HTTPError as e:
        status = e.code
    except Exception as e:  # noqa: BLE001
        status = f"error: {e}"
    write({"delivery": prediction["id"], "version": prediction["version"], "webhook": prediction["webhook"],
           "status": status})


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj, ctype="application/json"):
        body = obj if isinstance(obj, bytes) else json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self, body=b""):
        ok = self.headers.get("authorization", "") == f"Bearer {opts.token}"
        write({"method": self.command, "path": self.path, "token": ok, "prefer": self.headers.get("prefer"),
               "body": body.decode(errors="replace")})
        if not ok:
            self._send(401, {"title": "Unauthenticated", "detail": "You did not pass a valid authentication token",
                             "status": 401})
        return ok

    def _base(self):
        return f"http://127.0.0.1:{self.server.server_address[1]}"

    def do_GET(self):
        if self.path.startswith("/files/"):
            write({"method": "GET", "path": self.path})
            return self._send(200, PNG, "image/png")
        if not self._authorized():
            return
        if self.path == "/v1/webhooks/default/secret":
            return self._send(200, {"key": opts.secret})
        m = re.fullmatch(r"/v1/predictions/([\w-]+)", self.path)
        if m and m.group(1) in predictions:
            return self._send(200, predictions[m.group(1)])
        return self._send(404, {"detail": "Not found", "status": 404})

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("content-length") or 0))
        if not self._authorized(body):
            return
        if self.path != "/v1/predictions":
            return self._send(404, {"detail": "Not found", "status": 404})
        data = json.loads(body or b"{}")
        pid = uuid.uuid4().hex[:20]
        version = data.get("version")
        base = self._base()
        prediction = {"id": pid, "version": version, "input": data.get("input", {}), "status": "starting",
                      "output": None, "error": None,
                      "urls": {"get": f"{base}/v1/predictions/{pid}", "cancel": f"{base}/v1/predictions/{pid}/cancel"}}
        if version == CLASSIFIER:
            prompt = str(prediction["input"].get("prompt", ""))
            prediction.update(status="succeeded", output=["1", "0"] if "forbidden" in prompt else ["2"])
            predictions[pid] = prediction
            return self._send(201, prediction)
        if version not in (EMOJI, REMBG) or not data.get("webhook"):
            return self._send(422, {"detail": "unknown version, or no webhook", "status": 422})
        predictions[pid] = dict(prediction)
        done = dict(prediction, webhook=data["webhook"])
        if version == EMOJI and "explode" in str(prediction["input"].get("prompt", "")):
            done.update(status="failed", error="NSFW content detected. Try running it again, or try a different prompt.")
        elif version == EMOJI:
            done.update(status="succeeded", output=[f"{base}/files/{pid}.png"])
        else:
            done.update(status="succeeded", output=f"{base}/files/{pid}-no-background.png")
        predictions[pid] = done
        threading.Thread(target=deliver, args=(done,), daemon=True).start()
        return self._send(201, prediction)

    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
with open(opts.port_file, "w") as f:
    f.write(str(server.server_address[1]))
server.serve_forever()

#!/usr/bin/env python3
"""Minimal OTLP HTTP server that dumps received data to filesystem."""

import json
import os
import sys
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler

DATA_DIR = os.environ.get("OTEL_DUMP_DIR", "./otel_data")
PORT = int(os.environ.get("OTEL_DUMP_PORT", "4318"))

ENDPOINTS = {
    "/v1/logs",
    "/v1/metrics",
    "/v1/traces",
}


class OTLPHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b"{}")

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)
        content_type = self.headers.get("Content-Type", "")

        # Determine signal type from path
        signal = self.path.strip("/").replace("v1/", "")  # "logs", "metrics", "traces"
        if self.path not in ENDPOINTS:
            self.send_response(404)
            self.end_headers()
            return

        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
        signal_dir = os.path.join(DATA_DIR, signal)
        os.makedirs(signal_dir, exist_ok=True)

        # Save raw body
        if "json" in content_type:
            ext = "json"
            try:
                parsed = json.loads(body)
                body_to_write = json.dumps(parsed, indent=2, ensure_ascii=False).encode()
            except json.JSONDecodeError:
                body_to_write = body
        else:
            ext = "bin"
            body_to_write = body

        filename = f"{ts}.{ext}"
        filepath = os.path.join(signal_dir, filename)
        with open(filepath, "wb") as f:
            f.write(body_to_write)

        print(f"[{ts}] {self.path} <- {len(body)} bytes -> {filepath}")

        # OTLP expects empty JSON response
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b"{}")

    def log_message(self, format, *args):
        pass  # suppress default access logs


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    server = HTTPServer(("0.0.0.0", PORT), OTLPHandler)
    print(f"OTLP dump server listening on :{PORT}")
    print(f"Saving to {os.path.abspath(DATA_DIR)}/")
    print(f"Configure Claude Code:")
    print(f"  export CLAUDE_CODE_ENABLE_TELEMETRY=1")
    print(f"  export OTEL_LOGS_EXPORTER=otlp")
    print(f"  export OTEL_METRICS_EXPORTER=otlp")
    print(f"  export OTEL_EXPORTER_OTLP_PROTOCOL=http/json")
    print(f"  export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:{PORT}")
    print(f"  export OTEL_LOG_USER_PROMPTS=1")
    print(f"  export OTEL_LOG_TOOL_DETAILS=1")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()

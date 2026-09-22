#!/usr/bin/env python3
"""Minimal static server with SPA fallback to index.html, for previewing
the frontend outside Tauri. Not part of the app build."""
import http.server
import os
import socketserver

PORT = 4173
ROOT = os.path.join(os.path.dirname(__file__), "..", "public")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        path = self.translate_path(self.path.split("?")[0])
        if not os.path.exists(path) or os.path.isdir(path) and not os.path.exists(
            os.path.join(path, "index.html")
        ):
            self.path = "/index.html"
        return super().do_GET()


with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()

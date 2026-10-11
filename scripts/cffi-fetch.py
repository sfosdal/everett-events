# /// script
# dependencies = ["curl_cffi"]
# ///
"""Fetch one URL the way Chrome would (TLS fingerprint included) and print
the body, for the sites whose bot wall turns Node's fetch away: the City of
Everett's CivicPlus calendar and Songkick (the Historic Everett Theatre's
stand-in while its own site is down). fetch-events.mjs runs it as
`uv run scripts/cffi-fetch.py <url>` locally and `python3 scripts/cffi-fetch.py
<url>` in Actions (after `pip install curl_cffi`), and falls back to a plain
fetch when neither works. Exit 1 on an HTTP error so the caller knows."""
import sys
from curl_cffi import requests

r = requests.get(sys.argv[1], impersonate='chrome', timeout=45)
if r.status_code >= 400:
    sys.stderr.write(f'HTTP {r.status_code}\n'); sys.exit(1)
sys.stdout.buffer.write(r.content)

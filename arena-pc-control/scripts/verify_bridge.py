#!/usr/bin/env python3
"""Verify that the Arena PC Control Bridge is listening on a TCP port.

This is a lightweight connectivity check — it opens a raw TCP socket to
127.0.0.1:<port> and confirms the port is open. It does NOT speak the
Bridge's WebSocket protocol; it only confirms the Bridge process has
successfully bound to the listening port.
"""

from __future__ import annotations

import argparse
import socket
import sys
import time


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify the Arena PC Control Bridge is listening on a port."
    )
    parser.add_argument(
        "--port",
        type=int,
        required=True,
        help="TCP port the Bridge should be listening on.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=8.0,
        help="Maximum seconds to wait for the port to become available.",
    )
    args = parser.parse_args()

    deadline = time.time() + args.timeout
    last_error: str | None = None

    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", args.port), timeout=1.0):
                print(
                    f"Bridge is listening on ws://127.0.0.1:{args.port}",
                    flush=True,
                )
                return 0
        except OSError as exc:
            last_error = str(exc)
            time.sleep(0.5)

    print(
        f"ERROR: Bridge is not listening on ws://127.0.0.1:{args.port}",
        file=sys.stderr,
        flush=True,
    )
    if last_error:
        print(f"Last socket error: {last_error}", file=sys.stderr, flush=True)
    return 1


if __name__ == "__main__":
    sys.exit(main())

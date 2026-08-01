#!/usr/bin/env python3
"""Report managed OfficeCLI presence, version drift, and read-only capabilities."""

from __future__ import annotations

import argparse
from typing import Sequence

from officecli_adapter import print_json, probe_officecli


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", help="Optional managed target override for isolated tests")
    parser.add_argument("--timeout", type=int, default=30)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    result = probe_officecli(target=args.target, timeout=args.timeout)
    print_json(result)
    return 0 if result["present"] and not result["errors"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

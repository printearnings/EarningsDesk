"""Emit the OpenAPI schema so the frontend can generate TypeScript types.

This is what keeps the Python Pydantic models and the TypeScript interfaces
from drifting: `npm run gen:types` runs this, pipes the result through
openapi-typescript, and writes src/lib/schema.d.ts. Rename a field in
app/schemas.py without updating the components that read it and the Next.js
build fails, rather than the page rendering `undefined`.

Run:  python -m app.dump_openapi > ../web/openapi.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from app.main import create_app


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", help="write here instead of stdout")
    args = parser.parse_args()

    schema = json.dumps(create_app().openapi(), indent=2)

    if args.out:
        Path(args.out).write_text(schema, encoding="utf-8")
    else:
        sys.stdout.write(schema)


if __name__ == "__main__":
    main()

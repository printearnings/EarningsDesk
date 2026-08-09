"""Environment bootstrap — MUST be imported before anything from `earnings`.

`earnings.config` calls `load_dotenv()` at import time, which searches upward
from the *current working directory*. Since this API runs out of
EarningsDesk/api and the credentials live in the Earnings repo, that search
would come up empty and every `settings.has_*` flag would silently read False —
the app would boot fine and then serve empty pages.

So we load the env file explicitly, first, and let `earnings.config` find the
values already sitting in `os.environ`. Two supported layouts:

  1. EARNINGS_ENV_FILE points at the Earnings repo's .env  (preferred — one
     copy of the secrets, no duplication)
  2. EarningsDesk/.env holds its own copy

Import order matters. `main.py` imports this module on its first line.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# EarningsDesk/api/app/bootstrap.py -> EarningsDesk/
_PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Where we expect the sibling engine repo to live, if EARNINGS_ENV_FILE is unset.
_SIBLING_ENV = _PROJECT_ROOT.parent / "Earnings" / "Earnings" / ".env"


def load_env() -> list[Path]:
    """Populate os.environ. Returns the files actually read, in load order.

    Earlier files win: python-dotenv's `override=False` means the first value
    seen for a key sticks. Real process env beats every file, which is what a
    container deploy needs.
    """
    loaded: list[Path] = []

    candidates: list[Path] = []
    explicit = os.getenv("EARNINGS_ENV_FILE")
    if explicit:
        candidates.append(Path(explicit))
    candidates.append(_PROJECT_ROOT / ".env")
    candidates.append(_SIBLING_ENV)

    for path in candidates:
        if path.is_file():
            load_dotenv(path, override=False)
            loaded.append(path)

    return loaded


LOADED_ENV_FILES = load_env()

"""Entry script for PyInstaller. The package's __main__.py uses relative
imports, which fail when frozen as a top-level script."""
import os
import sys
from pathlib import Path


def _wire_bundled_torch_home() -> None:
    """When running as a PyInstaller bundle, point TORCH_HOME at the bundled
    Demucs weights so torch.hub never tries to download them.

    Must run BEFORE any `import torch` to take effect — torch caches the hub
    dir lazily but only on first call. Setting the env var early is safest.
    Skipped if the user already set TORCH_HOME explicitly."""
    if not getattr(sys, "frozen", False):
        return
    if os.environ.get("TORCH_HOME"):
        return
    bundle_root = Path(getattr(sys, "_MEIPASS", ""))
    if not bundle_root:
        return
    bundled = bundle_root / "_models" / "torch"
    if (bundled / "hub" / "checkpoints").is_dir():
        os.environ["TORCH_HOME"] = str(bundled)


_wire_bundled_torch_home()

from stem_splitter.main import main  # noqa: E402  — must follow env wiring

if __name__ == "__main__":
    sys.exit(main())

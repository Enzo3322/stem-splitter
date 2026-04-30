"""Entry script for PyInstaller. The package's __main__.py uses relative
imports, which fail when frozen as a top-level script."""
import sys

from stem_splitter.main import main

if __name__ == "__main__":
    sys.exit(main())

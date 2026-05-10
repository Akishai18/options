"""pytest config: make the schema package's `examples/` importable in engine
tests, mirroring the schema package's own conftest.
"""

import sys
from pathlib import Path

# .../packages/engine/ → sibling .../packages/schema/
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "schema"))

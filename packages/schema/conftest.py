"""pytest config: make the local `examples/` package importable in tests.

`examples/` is part of the source tree but not part of the installable wheel
(see pyproject.toml: only `stratlab_schema` is packaged). This conftest puts
`packages/schema/` on sys.path so tests can `import examples.<name>`.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

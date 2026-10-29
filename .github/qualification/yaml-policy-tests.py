import importlib.util
from pathlib import Path
import yaml
spec = importlib.util.spec_from_file_location("guard", Path(".github/qualification/strict-yaml-pnpm-guard.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
lock = Path("hulpgids/pnpm-lock.yaml").read_text(encoding="utf8")
assert module.inspect(lock) == ["cheerio@1.0.0-rc.12", "postject@1.0.0-alpha.6"]
header = "lockfileVersion: '9.0'\n"
assert module.inspect(header + "packages:\n  foo@1.2.3:\n    resolution: {}\n") == []
assert module.inspect(header + "packages:\n  '@scope/foo@1.2.3-rc.1':\n    resolution: {}\n") == ["@scope/foo@1.2.3-rc.1"]
for invalid in [header + "packages:\n  foo@1.2.3:\n    resolution: {broken\n", header + "packages:\n  foo@1.2.3: {}\n  foo@1.2.3: {}\n", header + "packages:\n  foo@wat: {}\n", header + "snapshots: {}\n"]:
    try:
        module.inspect(invalid)
    except (ValueError, yaml.YAMLError):
        continue
    raise AssertionError("Unsupported or malformed YAML was accepted")
print("Exact default lock and stable, prerelease, duplicate, malformed and missing-package cases verified.")

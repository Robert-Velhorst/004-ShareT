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
for filename, guarded in [("ci.yml", {"verify", "browser-smoke"}), ("windows-installer.yml", {"installer"})]:
    original = yaml.safe_load(Path("hulpgids/.github/workflows", filename).read_text(encoding="utf8"))
    candidate = yaml.safe_load(Path(".github/qualification", "candidate-" + filename).read_text(encoding="utf8"))
    policy = candidate["jobs"].pop("pnpm-stability-policy")
    assert policy["runs-on"] == "ubuntu-latest"
    assert policy["steps"][-1]["run"] == "python .github/qualification/strict-yaml-pnpm-guard.py"
    for name in guarded:
        assert candidate["jobs"][name].pop("needs") == "pnpm-stability-policy"
    assert candidate == original, "Existing workflow behavior changed beyond policy prerequisites"
print("Original workflow jobs preserved behind prerequisites; exact lock and boundary cases verified.")

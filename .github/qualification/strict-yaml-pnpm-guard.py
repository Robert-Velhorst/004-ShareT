"""Inspect pnpm package keys with a duplicate-rejecting safe YAML parser."""
import re
import sys
from pathlib import Path
import yaml

class StrictLoader(yaml.SafeLoader):
    pass

def unique_mapping(loader, node, deep=False):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if not isinstance(key, (str, int, float, bool)) or key in result:
            raise ValueError("Invalid or duplicate YAML mapping key")
        result[key] = loader.construct_object(value_node, deep=deep)
    return result

StrictLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)
VERSION = re.compile(r"@(?P<version>[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$")

def inspect(text):
    documents = list(yaml.load_all(text, Loader=StrictLoader))
    if not documents: raise ValueError("Missing lockfile documents")
    bad = []
    for doc in documents:
        if not isinstance(doc, dict) or str(doc.get("lockfileVersion")) != "9.0":
            raise ValueError("Unsupported lockfile document")
        packages = doc.get("packages")
        if not isinstance(packages, dict) or not packages:
            raise ValueError("Missing or empty package mapping")
        for key, metadata in packages.items():
            if not isinstance(key, str) or not isinstance(metadata, dict):
                raise ValueError("Unsupported package record")
            match = VERSION.search(key)
            if not match: raise ValueError("Unsupported package version syntax")
            if "-" in match.group("version").split("+", 1)[0]: bad.append(key)
    return bad

def main():
    try: bad = inspect(Path("pnpm-lock.yaml").read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError, yaml.YAMLError) as error:
        print("Lock policy could not verify package records:", error, file=sys.stderr)
        return 2
    if bad:
        print("Unapproved prerelease package records:", file=sys.stderr)
        for key in bad: print(key, file=sys.stderr)
        return 1
    print("No prerelease package records found")
    return 0

if __name__ == "__main__": sys.exit(main())

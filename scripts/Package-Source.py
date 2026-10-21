"""Build and independently verify a manifest-only source ZIP. Maintainer tool.

Requires Python 3.10+. Never replaces an existing archive, extraction or receipt.
No subprocesses, service actions, dependency installs, or credential access.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
import zipfile


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def source_file(root: Path, name: str) -> Path:
    relative = PurePosixPath(name)
    if not name or "\\" in name or ":" in name or relative.is_absolute() or any(p in ("", ".", "..") for p in name.split("/")):
        raise ValueError(f"Unsafe manifest entry: {name}")
    target = root.joinpath(*relative.parts)
    cursor = target
    while cursor != root:
        if cursor.is_symlink() or (hasattr(cursor, "is_junction") and cursor.is_junction()):
            raise ValueError(f"Linked source entry: {name}")
        cursor = cursor.parent
    if not target.resolve(strict=True).is_relative_to(root) or not target.is_file():
        raise ValueError(f"Not a regular source entry: {name}")
    return target


def package(source: Path, archive: Path, extraction: Path, receipt: Path) -> dict:
    source = source.resolve(strict=True)
    for output in (archive, extraction, receipt):
        if output.exists():
            raise FileExistsError(f"Output already exists; inspect before a new attempt: {output}")
        if output.resolve().is_relative_to(source):
            raise ValueError("Keep packaging outputs outside the source checkout")
    manifest_bytes = source_file(source, "release-manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest.get("schemaVersion") != "desksom.release/v1" or not manifest.get("files"):
        raise ValueError("Unsupported or empty source manifest")
    payload: dict[str, bytes] = {"release-manifest.json": manifest_bytes}
    seen = {"release-manifest.json"}
    for entry in manifest["files"]:
        name = entry["path"]
        if name.casefold() in seen:
            raise ValueError(f"Duplicate source entry: {name}")
        seen.add(name.casefold())
        data = source_file(source, name).read_bytes()
        if len(data) != entry["bytes"] or digest(data) != entry["sha256"]:
            raise ValueError(f"Source differs from manifest: {name}")
        payload[name] = data
    archive.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for name, data in sorted(payload.items()):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            output.writestr(info, data)
    extraction.mkdir(parents=True, exist_ok=False)
    with zipfile.ZipFile(archive, "r") as packed:
        if set(packed.namelist()) != set(payload) or len(packed.infolist()) != len(payload):
            raise ValueError("Archive entries differ from the reviewed file set")
        for name in packed.namelist():
            target = extraction.joinpath(*PurePosixPath(name).parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("xb") as output:
                output.write(packed.read(name))
    for name, expected in payload.items():
        actual = source_file(extraction.resolve(), name).read_bytes()
        if actual != expected:
            raise ValueError(f"Extracted bytes differ: {name}")
    result = {
        "schema": "desksom.source-package/v2", "passed": True,
        "at": datetime.now(timezone.utc).isoformat(), "version": manifest["version"],
        "archive": str(archive.resolve()), "extracted": str(extraction.resolve()),
        "sourceManifestSha256": digest(manifest_bytes), "sourceEntries": len(manifest["files"]),
        "archiveEntries": len(payload), "archiveSha256": digest(archive.read_bytes()),
        "allExtractedBytesVerified": True, "subprocessesStarted": False,
    }
    receipt.parent.mkdir(parents=True, exist_ok=True)
    with receipt.open("x", encoding="utf-8", newline="\n") as output:
        json.dump(result, output, indent=2)
        output.write("\n")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    for argument in ("source", "archive", "extract", "receipt"):
        parser.add_argument("--" + argument, required=True, type=Path)
    args = parser.parse_args()
    result = package(args.source, args.archive, args.extract, args.receipt)
    print(json.dumps(result))


if __name__ == "__main__":
    main()

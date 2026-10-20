#!/usr/bin/env python3
"""Harvest cog-* tags + English fallbacks from view JS into plugin/translations/_COG.json."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIEW = ROOT / "view"
HELP = VIEW / "help"
OUT = ROOT / "plugin" / "translations" / "_COG.json"
# Prefix → per-type catalog under gizmos/<typeId>/translations/_COG.json
GIZMO_PACKS = {
    "cog-clock-": ROOT / "plugin" / "gizmos" / "cog-clock" / "translations" / "_COG.json",
    "cog-feed-": ROOT / "plugin" / "gizmos" / "cog-feed" / "translations" / "_COG.json",
}

HELP_OPEN = re.compile(r"^\+\+\+\s+(.+?)\s+(#cog-[a-z0-9-]+)\s*$", re.I)
HELP_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s+(#cog-[a-z0-9-]+)\s*$", re.I | re.M)

# setTranslated*(el, "tag", "fallback") / tagFieldLabel(el, "tag", "fallback")
PAT_CALL = re.compile(
    r"(?:setTranslated(?:Text|Title|Placeholder|Option|AriaLabel)|tagFieldLabel)\s*\(\s*[^,]+,\s*"
    r"""(['"])(cog-[a-z0-9-]+)\1\s*,\s*(['"])((?:\\.|[^\\])*?)\3""",
    re.S,
)
# makeInfoTip("fallback", "cog-tag") — tag is second arg
PAT_INFO = re.compile(
    r"""makeInfoTip\s*\(\s*(['"])((?:\\.|[^\\])*?)\1\s*,\s*(['"])(cog-[a-z0-9-]+)\3""",
    re.S,
)
# map entries: "cog-x": ["cog-x", "Label"] or value: ["cog-x", "Label"]
PAT_PAIR = re.compile(
    r"""(['"])(cog-[a-z0-9-]+)\1\s*,\s*(['"])((?:\\.|[^\\])*?)\3"""
)


def unesc(s: str) -> str:
    """Decode JS string escapes without mangling already-decoded UTF-8."""
    out: list[str] = []
    i = 0
    while i < len(s):
        if s[i] != "\\" or i + 1 >= len(s):
            out.append(s[i])
            i += 1
            continue
        n = s[i + 1]
        if n == "n":
            out.append("\n")
            i += 2
        elif n == "t":
            out.append("\t")
            i += 2
        elif n == "r":
            out.append("\r")
            i += 2
        elif n == "\\":
            out.append("\\")
            i += 2
        elif n in "'\"":
            out.append(n)
            i += 2
        elif n == "u" and i + 6 <= len(s):
            try:
                out.append(chr(int(s[i + 2 : i + 6], 16)))
                i += 6
            except ValueError:
                out.append(s[i])
                i += 1
        else:
            out.append(s[i])
            i += 1
    return "".join(out)


def harvest_help_markdown(tags: dict[str, str]) -> int:
    """Pull +++ Title #cog-tag blocks and about.md into the catalog."""
    added = 0
    if not HELP.is_dir():
        return added
    about = HELP / "about.md"
    if about.is_file():
        body = about.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n").strip()
        if body:
            tags.setdefault("cog-help-about", body)
            added += 1
    for path in sorted(HELP.glob("*.md")):
        text = path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
        if path.name.lower() != "about.md":
            lines = text.split("\n")
            i = 0
            while i < len(lines):
                m = HELP_OPEN.match(lines[i].rstrip())
                if not m:
                    i += 1
                    continue
                title, tag = m.group(1).strip(), m.group(2)[1:].lower()
                i += 1
                body_lines: list[str] = []
                while i < len(lines):
                    if re.search(r"\s\+\+\+\s*$", lines[i]):
                        i += 1
                        break
                    if HELP_OPEN.match(lines[i].rstrip()):
                        break
                    body_lines.append(lines[i])
                    i += 1
                body = "\n".join(body_lines).strip()
                if title and tag not in tags:
                    tags[tag] = title
                    added += 1
                body_tag = f"{tag}-body"
                if body and body_tag not in tags:
                    tags[body_tag] = body
                    added += 1
        for hm in HELP_HEADING.finditer(text):
            title, tag = hm.group(2).strip(), hm.group(3)[1:].lower()
            if title and tag not in tags:
                tags[tag] = title
                added += 1
    return added


def pack_for_tag(tag: str) -> Path | None:
    for prefix, path in GIZMO_PACKS.items():
        if tag.startswith(prefix):
            return path
    return None


def load_catalog(path: Path) -> dict:
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    return {}


def write_catalog(path: Path, catalog: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    out = {k: catalog[k] for k in sorted(catalog.keys())}
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    existing_global = load_catalog(OUT)
    existing_packs = {str(path): load_catalog(path) for path in GIZMO_PACKS.values()}

    tags: dict[str, str] = {}
    for path in sorted(VIEW.glob("*.js")):
        text = path.read_text(encoding="utf-8")
        for m in PAT_CALL.finditer(text):
            tag, fb = m.group(2), unesc(m.group(4))
            if fb and tag not in tags:
                tags[tag] = fb
        for m in PAT_INFO.finditer(text):
            fb, tag = unesc(m.group(2)), m.group(4)
            if fb and tag not in tags:
                tags[tag] = fb
        for m in PAT_PAIR.finditer(text):
            tag, fb = m.group(2), unesc(m.group(4))
            if fb and tag not in tags:
                tags[tag] = fb

    help_n = harvest_help_markdown(tags)

    for tag, fb in tags.items():
        dest_path = pack_for_tag(tag)
        if dest_path is not None:
            catalog = existing_packs[str(dest_path)]
            # Keep type-owned tags out of the global file.
            existing_global.pop(tag, None)
        else:
            catalog = existing_global
        cell = catalog.get(tag)
        if not isinstance(cell, dict):
            cell = {}
        cell["en-CA"] = fb
        catalog[tag] = cell

    # Single-letter coordinate labels — drop if previously harvested.
    existing_global.pop("cog-x", None)
    existing_global.pop("cog-y", None)
    for catalog in existing_packs.values():
        catalog.pop("cog-x", None)
        catalog.pop("cog-y", None)

    probe = existing_global.get("cog-smoke-probe")
    if not isinstance(probe, dict):
        probe = {"en-CA": "Smoke probe", "fr-CA": "Sonde de test"}
    else:
        probe.setdefault("en-CA", "Smoke probe")
        probe.setdefault("fr-CA", "Sonde de test")
    existing_global["cog-smoke-probe"] = probe

    # Keep a known badge title if referenced but not harvested with a string literal.
    existing_global.setdefault(
        "cog-missing-translation-title",
        {
            "en-CA": "Missing {missing} — showing {fallback} fallback",
            "fr-CA": "Traduction {missing} manquante — repli {fallback}",
        },
    )

    write_catalog(OUT, existing_global)
    pack_counts = []
    for path in GIZMO_PACKS.values():
        catalog = existing_packs[str(path)]
        write_catalog(path, catalog)
        pack_counts.append(f"{path.parent.parent.name}={len(catalog)}")
    print(
        f"Wrote {len(existing_global)} global tags to {OUT} "
        f"(help entries ~{help_n}; packs: {', '.join(pack_counts)})"
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Render every Graphviz DOT source to the public SVG and PNG assets."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "source" / "diagrams"
DETAIL_SOURCE_DIR = SOURCE_DIR / "details"
OUTPUT_DIR = ROOT / "assets" / "diagrams"
SOURCE_MANIFEST = OUTPUT_DIR / "source-manifest.json"
RENDER_PROFILE = "chalkboard-dark-v1"
THEME_MARKER = f'data-diagram-theme="{RENDER_PROFILE}"'

CANVAS = "#1E1E1E"
SURFACE = "#272727"
INK = "#EFEFEF"
MUTED_INK = "#BFC3C8"
DARK_LABEL = "#161924"
SCOPE = "#FFA94D"
CORE = "#B93D8E"
UTILITY = "#1971C2"
EXTENSION = "#FD7E14"
EXTERNAL = "#868E96"
SUCCESS = "#14745B"
CYAN = "#176B80"
DANGER = "#A63B4E"


def color_map() -> dict[str, str]:
    """Map the legacy light palette to the shared dark diagram vocabulary."""

    groups = {
        SURFACE: (
            "#ffffff",
        ),
        EXTERNAL: (
            "#f0f3f9", "#f7f7f7", "#f7f8fb", "#f7f9fc", "#f8fafc",
        ),
        UTILITY: (
            "#e8f0fe", "#eaf0ff", "#edf5ff",
        ),
        SUCCESS: (
            "#cfe8de", "#dff7e4", "#eefbf6", "#f1f8e9",
        ),
        CYAN: (
            "#b7dce5", "#d5e7ef", "#e0f7fa", "#e9fbff",
        ),
        EXTENSION: (
            "#e7d59a", "#eadfbe", "#fff3cd", "#fff7e6", "#fff8e7", "#fffde7",
        ),
        DANGER: (
            "#fce8e6", "#fff0f3", "#fff1f2",
        ),
        SCOPE: (
            "#d0d7de", "#d8dee9", "#dbe3ef", "#dfe5ee",
        ),
        INK: (
            "#182033", "#3b4a5a", "#425466", "#b8c5d8", "#bac7db",
        ),
        MUTED_INK: (
            "#46566e", "#59687e", "#607086", "#8292a8", "#8fa3c2", "#99a8bd",
        ),
        "#70B7FF": (
            "#4338ca", "#5b6f8f", "#6366f1", "#7aa7df", "#8292f7", "#8aa4f5",
        ),
        "#70D0A8": (
            "#3d8b6d", "#3f735f", "#4f7a68", "#4f8b74", "#5ac39b", "#5b7f4a", "#61b99a",
            "#c7ddb0",
        ),
        "#77D3E5": (
            "#317487", "#397b8c", "#3b7f91", "#3f8fa7", "#497488", "#54a0b7", "#54b7cf",
        ),
        "#FFB45C": (
            "#806b35", "#8a6d3b", "#a78b53", "#b28a2f", "#e0ad4e", "#e4ad4f",
        ),
        "#FF8DA1": (
            "#9d4358", "#b45d69", "#c35f76", "#c45c6d", "#dc2626", "#e07b91",
        ),
        "#E487C7": (
            "#6d28d9", "#7251aa", "#7257a6", "#7c3aed", "#8d6cc7", "#a884e8", "#ab8fe0",
        ),
        CORE: (
            "#111827", "#c9b9e8", "#f3e5f5", "#f3eefc", "#f4efff",
        ),
    }
    return {
        legacy.upper(): replacement
        for replacement, legacy_colors in groups.items()
        for legacy in legacy_colors
    }


LEGACY_COLORS = color_map()


def replace_attribute(line: str, name: str, value: str) -> str:
    pattern = re.compile(rf"\b{re.escape(name)}\s*=\s*(?:\"[^\"]*\"|[^\s,\]]+)", re.IGNORECASE)
    replacement = f'{name}="{value}"'
    if pattern.search(line):
        return pattern.sub(replacement, line, count=1)
    closing = line.rfind("]")
    if closing < 0:
        return line
    separator = "" if line[:closing].rstrip().endswith("[") else ", "
    return f"{line[:closing]}{separator}{replacement}{line[closing:]}"


def append_graph_defaults(text: str, kind: str, attributes: dict[str, str]) -> str:
    pattern = re.compile(rf"(?m)^(\s*{kind}\s*\[[^\n]*)(\]\s*;?\s*)$")
    match = pattern.search(text)
    if not match:
        raise SystemExit(f"Diagram source has no top-level {kind} defaults")
    line = match.group(0)
    for name, value in attributes.items():
        line = replace_attribute(line, name, value)
    return text[:match.start()] + line + text[match.end():]


def themed_source_text(source: Path) -> str:
    """Apply the reproducible, reference-inspired theme before Graphviz runs."""

    text = source.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(
        r"\bbgcolor\s*=\s*(?:white|\"#(?:fff|ffffff)\")",
        f'bgcolor="{CANVAS}"',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"\bfontcolor\s*=\s*white\b",
        f'fontcolor="{INK}"',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"#[0-9a-fA-F]{6}",
        lambda match: LEGACY_COLORS.get(match.group(0).upper(), match.group(0).upper()),
        text,
    )

    point_sizes = {10: 11, 12: 14}
    text = re.sub(
        r'POINT-SIZE="(\d+)"',
        lambda match: f'POINT-SIZE="{point_sizes.get(int(match.group(1)), int(match.group(1)))}"',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r'(<TABLE)(?![^>]*\bBGCOLOR=)',
        rf'\1 BGCOLOR="{SURFACE}" STYLE="ROUNDED"',
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r'(<FONT)(?![^>]*\bCOLOR=)',
        rf'\1 COLOR="{INK}"',
        text,
        flags=re.IGNORECASE,
    )
    for light_text_fill in (EXTENSION, EXTERNAL):
        text = re.sub(
            rf'(<TD[^>]*\bBGCOLOR="{light_text_fill}"[^>]*>.*?<FONT[^>]*\bCOLOR="){INK}(")',
            rf"\1{DARK_LABEL}\2",
            text,
            flags=re.IGNORECASE,
        )

    text = append_graph_defaults(
        text,
        "graph",
        {
            "bgcolor": CANVAS,
            "fontcolor": INK,
            "color": SCOPE,
            "penwidth": "2.4",
            "pad": "0.38",
            "fontsize": "20",
        },
    )
    text = append_graph_defaults(
        text,
        "node",
        {
            "fontcolor": INK,
            "color": INK,
            "penwidth": "1.8",
            "fontsize": "12",
        },
    )
    text = append_graph_defaults(
        text,
        "edge",
        {
            "fontcolor": MUTED_INK,
            "color": INK,
            "penwidth": "1.7",
            "arrowsize": "0.88",
            "fontsize": "10.5",
        },
    )

    themed_lines: list[str] = []
    for line in text.splitlines():
        if f'fillcolor="{EXTENSION}"' in line or f'fillcolor="{EXTERNAL}"' in line:
            line = replace_attribute(line, "fontcolor", DARK_LABEL)
        themed_lines.append(line)
    return "\n".join(themed_lines) + "\n"


def find_dot() -> Path:
    configured = os.environ.get("GRAPHVIZ_DOT")
    candidates = [
        Path(configured) if configured else None,
        Path(shutil.which("dot")) if shutil.which("dot") else None,
        Path(r"C:\Program Files\Graphviz\bin\dot.exe"),
        Path(r"C:\Program Files (x86)\Graphviz\bin\dot.exe"),
    ]
    for candidate in candidates:
        if candidate and candidate.is_file():
            return candidate
    raise SystemExit(
        "Graphviz 'dot' was not found. Install Graphviz or set GRAPHVIZ_DOT "
        "to the renderer executable."
    )


def render(
    dot: Path,
    source: Path,
    target: Path,
    output_format: str,
    logical_source: Path,
) -> None:
    command = [str(dot), f"-T{output_format}", "-Gdpi=96", str(source), "-o", str(target)]
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
    if result.stdout.strip():
        print(result.stdout.strip())
    if result.stderr.strip():
        print(result.stderr.strip(), file=sys.stderr)
    if result.returncode:
        raise SystemExit(f"Graphviz failed for {logical_source.relative_to(ROOT)}")
    if output_format == "svg":
        svg = target.read_text(encoding="utf-8")
        svg = svg.replace("<svg ", f"<svg {THEME_MARKER} ", 1)
        target.write_text(svg, encoding="utf-8", newline="\n")


def canonical_sources() -> list[Path]:
    return sorted(SOURCE_DIR.glob("*.dot"))


def detail_sources() -> list[Path]:
    return sorted(DETAIL_SOURCE_DIR.glob("*.dot"))


def all_sources() -> list[Path]:
    return canonical_sources() + detail_sources()


def source_key(source: Path) -> str:
    return source.relative_to(SOURCE_DIR).as_posix()


def logical_stem(source: Path) -> str:
    return source.stem.split("__detail_", 1)[0]


def public_asset(source: Path, output_format: str) -> Path:
    return OUTPUT_DIR / source.relative_to(SOURCE_DIR).with_suffix(f".{output_format}")


def selected_sources(patterns: list[str]) -> list[Path]:
    sources = all_sources()
    if not patterns:
        return sources
    wanted = {
        pattern.replace("\\", "/").removesuffix(".dot").removeprefix("details/")
        for pattern in patterns
    }
    selected: list[Path] = []
    matched: set[str] = set()
    for source in sources:
        stem = source.stem
        key_stem = source_key(source).removesuffix(".dot").removeprefix("details/")
        for pattern in wanted:
            if pattern in (stem, key_stem) or (
                "__detail_" not in pattern and logical_stem(source) == pattern
            ):
                selected.append(source)
                matched.add(pattern)
                break
    missing = sorted(wanted - matched)
    if missing:
        raise SystemExit(f"Unknown diagram source(s): {', '.join(missing)}")
    return sorted(set(selected))


def source_digest(source: Path) -> str:
    render_input = themed_source_text(source)
    return hashlib.sha256(render_input.encode("utf-8")).hexdigest()


def empty_source_manifest() -> dict[str, object]:
    return {
        "schemaVersion": 2,
        "algorithm": "sha256",
        "renderProfile": RENDER_PROFILE,
        "sources": {},
        "detailSources": {},
        "logicalDiagrams": {},
    }


def load_source_manifest(*, allow_legacy: bool = False) -> dict[str, object]:
    if not SOURCE_MANIFEST.is_file():
        return empty_source_manifest()
    try:
        payload = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"Invalid diagram source manifest: {error}") from error
    if (
        allow_legacy
        and payload.get("schemaVersion") == 1
        and payload.get("algorithm") == "sha256"
        and payload.get("renderProfile") == RENDER_PROFILE
    ):
        migrated = empty_source_manifest()
        migrated["sources"] = payload.get("sources", {})
        return migrated
    if (
        payload.get("schemaVersion") != 2
        or payload.get("algorithm") != "sha256"
        or payload.get("renderProfile") != RENDER_PROFILE
    ):
        raise SystemExit("Invalid diagram source manifest header")
    for field in ("sources", "detailSources"):
        entries = payload.get(field)
        if not isinstance(entries, dict) or not all(
            isinstance(name, str) and isinstance(digest, str)
            for name, digest in entries.items()
        ):
            raise SystemExit(f"Invalid diagram source manifest {field} entries")
    if not isinstance(payload.get("logicalDiagrams"), dict):
        raise SystemExit("Invalid diagram source manifest logical diagram entries")
    return payload


def logical_catalog() -> dict[str, dict[str, object]]:
    details_by_logical: dict[str, list[str]] = {}
    for source in detail_sources():
        details_by_logical.setdefault(logical_stem(source), []).append(source_key(source))
    return {
        source.stem: {
            "overview": source_key(source),
            "details": sorted(details_by_logical.get(source.stem, [])),
        }
        for source in canonical_sources()
    }


def write_source_manifest(entries: dict[str, str]) -> None:
    payload: dict[str, object] = {
        "schemaVersion": 2,
        "algorithm": "sha256",
        "renderProfile": RENDER_PROFILE,
        "sources": dict(sorted(
            (key, digest) for key, digest in entries.items() if not key.startswith("details/")
        )),
        "detailSources": dict(sorted(
            (key, digest) for key, digest in entries.items() if key.startswith("details/")
        )),
        "logicalDiagrams": logical_catalog(),
    }
    SOURCE_MANIFEST.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def asset_is_well_formed(path: Path, output_format: str) -> bool:
    if not path.is_file() or path.stat().st_size == 0:
        return False
    content = path.read_bytes()
    if output_format == "png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    return b"<svg" in content[:1024] and THEME_MARKER.encode("utf-8") in content[:2048]


def check_generated_assets(sources: list[Path], require_complete_manifest: bool) -> list[str]:
    payload = load_source_manifest()
    recorded = {
        **payload["sources"],
        **payload["detailSources"],
    }
    failures: list[str] = []
    if require_complete_manifest:
        all_source_names = {source_key(source) for source in all_sources()}
        missing = sorted(all_source_names - recorded.keys())
        extra = sorted(recorded.keys() - all_source_names)
        failures.extend(f"manifest missing {name}" for name in missing)
        failures.extend(f"manifest retains removed source {name}" for name in extra)
        if payload.get("logicalDiagrams") != logical_catalog():
            failures.append("manifest logical diagram catalog is stale")
        for output_format in ("svg", "png"):
            expected_assets = {
                public_asset(source, output_format).relative_to(OUTPUT_DIR).as_posix()
                for source in all_sources()
            }
            actual_assets = {
                path.relative_to(OUTPUT_DIR).as_posix()
                for path in OUTPUT_DIR.rglob(f"*.{output_format}")
            }
            failures.extend(
                f"missing generated asset: {name}"
                for name in sorted(expected_assets - actual_assets)
            )
            failures.extend(
                f"orphan generated asset: {name}"
                for name in sorted(actual_assets - expected_assets)
            )

    for source in sources:
        digest = source_digest(source)
        if recorded.get(source_key(source)) != digest:
            failures.append(f"source digest changed: {source.relative_to(ROOT)}")
        for output_format in ("svg", "png"):
            public = public_asset(source, output_format)
            if not asset_is_well_formed(public, output_format):
                failures.append(f"missing or invalid asset: {public.relative_to(ROOT)}")

    return failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail when generated assets are stale")
    parser.add_argument("--only", nargs="*", default=[], metavar="STEM", help="render selected diagram stems")
    args = parser.parse_args()

    sources = selected_sources(args.only)
    if not sources:
        raise SystemExit("No DOT sources found")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if args.check:
        failures = check_generated_assets(sources, require_complete_manifest=not args.only)
        if failures:
            print("Stale diagram assets:", file=sys.stderr)
            for failure in failures:
                print(f"- {failure}", file=sys.stderr)
            return 1
        print(f"verified {len(sources)} diagram source(s)")
        return 0

    dot = find_dot()
    with tempfile.TemporaryDirectory(prefix="gsk-diagrams-") as temporary:
        temp_dir = Path(temporary)
        for source in sources:
            relative = source.relative_to(SOURCE_DIR)
            render_source = temp_dir / relative
            render_source.parent.mkdir(parents=True, exist_ok=True)
            render_source.write_text(themed_source_text(source), encoding="utf-8", newline="\n")
            generated: dict[str, Path] = {}
            for output_format in ("svg", "png"):
                target = render_source.with_suffix(f".{output_format}")
                render(dot, render_source, target, output_format, source)
                generated[output_format] = target

            for output_format, candidate in generated.items():
                destination = public_asset(source, output_format)
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(candidate, destination)
            print(f"rendered {source_key(source).removesuffix('.dot')}")

    existing = load_source_manifest(allow_legacy=True) if args.only else empty_source_manifest()
    recorded = {
        **existing["sources"],
        **existing["detailSources"],
    }
    current_names = {source_key(source) for source in all_sources()}
    recorded = {name: digest for name, digest in recorded.items() if name in current_names}
    for source in sources:
        recorded[source_key(source)] = source_digest(source)
    write_source_manifest(recorded)
    print(f"rendered {len(sources)} diagram source(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

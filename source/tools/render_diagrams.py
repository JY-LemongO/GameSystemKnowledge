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


def selected_sources(patterns: list[str]) -> list[Path]:
    sources = sorted(SOURCE_DIR.glob("*.dot"))
    if not patterns:
        return sources
    wanted = {pattern.removesuffix(".dot") for pattern in patterns}
    selected = [source for source in sources if source.stem in wanted or source.name in patterns]
    missing = sorted(wanted - {source.stem for source in selected})
    if missing:
        raise SystemExit(f"Unknown diagram source(s): {', '.join(missing)}")
    return selected


def source_digest(source: Path) -> str:
    render_input = themed_source_text(source)
    return hashlib.sha256(render_input.encode("utf-8")).hexdigest()


def load_source_manifest() -> dict[str, str]:
    if not SOURCE_MANIFEST.is_file():
        return {}
    try:
        payload = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"Invalid diagram source manifest: {error}") from error
    if (
        payload.get("schemaVersion") != 1
        or payload.get("algorithm") != "sha256"
        or payload.get("renderProfile") != RENDER_PROFILE
    ):
        raise SystemExit("Invalid diagram source manifest header")
    sources = payload.get("sources")
    if not isinstance(sources, dict) or not all(
        isinstance(name, str) and isinstance(digest, str)
        for name, digest in sources.items()
    ):
        raise SystemExit("Invalid diagram source manifest entries")
    return sources


def write_source_manifest(entries: dict[str, str]) -> None:
    payload = {
        "schemaVersion": 1,
        "algorithm": "sha256",
        "renderProfile": RENDER_PROFILE,
        "sources": dict(sorted(entries.items())),
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
    recorded = load_source_manifest()
    failures: list[str] = []
    if require_complete_manifest:
        all_source_names = {source.name for source in SOURCE_DIR.glob("*.dot")}
        missing = sorted(all_source_names - recorded.keys())
        extra = sorted(recorded.keys() - all_source_names)
        failures.extend(f"manifest missing {name}" for name in missing)
        failures.extend(f"manifest retains removed source {name}" for name in extra)

    for source in sources:
        digest = source_digest(source)
        if recorded.get(source.name) != digest:
            failures.append(f"source digest changed: {source.relative_to(ROOT)}")
        for output_format in ("svg", "png"):
            public = OUTPUT_DIR / f"{source.stem}.{output_format}"
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
            render_source = temp_dir / source.name
            render_source.write_text(themed_source_text(source), encoding="utf-8", newline="\n")
            generated: dict[str, Path] = {}
            for output_format in ("svg", "png"):
                target = temp_dir / f"{source.stem}.{output_format}"
                render(dot, render_source, target, output_format, source)
                generated[output_format] = target

            for candidate in generated.values():
                shutil.copyfile(candidate, OUTPUT_DIR / candidate.name)
            print(f"rendered {source.stem}")

    recorded = load_source_manifest() if args.only else {}
    current_names = {source.name for source in SOURCE_DIR.glob("*.dot")}
    recorded = {name: digest for name, digest in recorded.items() if name in current_names}
    for source in sources:
        recorded[source.name] = source_digest(source)
    write_source_manifest(recorded)
    print(f"rendered {len(sources)} diagram source(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

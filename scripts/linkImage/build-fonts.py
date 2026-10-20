#!/usr/bin/env python3
"""
Static font instances for the link-preview image (/api/og/card, rendered with
next/og — satori, which can't instance a variable font: it would draw every
weight as the file's default), made from the apps' fonts (apps/shared/fonts/,
committed: the CJK faces already Big5 level 1 + ASCII, Latin-1, general and
CJK punctuation and the full-width forms; the Latin faces whole) into
src/lib/linkImage/fonts/, with the OFL beside them:

  NotoSerifTC-SemiBold.ttf   wght 600            a CJK story's title
  NotoSansTC-Regular.ttf     wght 400            a CJK story's words
  NotoSansTC-SemiBold.ttf    wght 600            a pen name in CJK
  ShareDisplay-Bold.ttf      Playfair wght 700   a Latin story's title, the wordmark;
                                                 lining figures made the default (lnum),
                                                 renamed: "Playfair Display" is the
                                                 font's Reserved Font Name (OFL 1.1 §3)
  DMSans-Regular.ttf         wght 400, opsz 14   a Latin story's words, the date, the domain
  DMSans-SemiBold.ttf        wght 600, opsz 14   a pen name

  python3 -m venv .venv-fonts && .venv-fonts/bin/pip install fonttools
  .venv-fonts/bin/python scripts/linkImage/build-fonts.py
"""
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "apps" / "shared" / "fonts"
OUT = ROOT / "src" / "lib" / "linkImage" / "fonts"

INSTANCES = [
    ("NotoSerifTC.ttf", "NotoSerifTC-SemiBold.ttf", {"wght": 600}),
    ("NotoSansTC.ttf", "NotoSansTC-Regular.ttf", {"wght": 400}),
    ("NotoSansTC.ttf", "NotoSansTC-SemiBold.ttf", {"wght": 600}),
    ("PlayfairDisplay.ttf", "ShareDisplay-Bold.ttf", {"wght": 700}),
    ("DMSans.ttf", "DMSans-Regular.ttf", {"wght": 400, "opsz": 14}),
    ("DMSans.ttf", "DMSans-SemiBold.ttf", {"wght": 600, "opsz": 14}),
]


def single_substitutions(font: TTFont, tag: str) -> dict:
    """What a GSUB feature's single substitutions map each glyph to."""
    gsub = font["GSUB"].table
    mapping = {}
    for record in gsub.FeatureList.FeatureRecord:
        if record.FeatureTag != tag:
            continue
        for index in record.Feature.LookupListIndex:
            for sub in gsub.LookupList.Lookup[index].SubTable:
                sub = getattr(sub, "ExtSubTable", sub)
                mapping.update(getattr(sub, "mapping", None) or {})
    return mapping


def freeze(font: TTFont, tag: str) -> None:
    """Make a feature's single substitutions the default: the cmap points at the substitutes."""
    mapping = single_substitutions(font, tag)
    if not mapping:
        raise SystemExit(f"no {tag} substitutions to freeze")
    for table in font["cmap"].tables:
        for code, glyph in list(table.cmap.items()):
            if glyph in mapping:
                table.cmap[code] = mapping[glyph]


def rename(font: TTFont, family: str, style: str, note: str) -> None:
    """A new family name (the source's is reserved); copyright, trademark, designer and licence records stay."""
    name = font["name"]
    postscript = f"{family.replace(' ', '')}-{style}"
    for record in list(name.names):
        if record.nameID in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25) or record.nameID >= 256:
            name.removeNames(nameID=record.nameID)
    for name_id, value in [
        (1, family),
        (2, style),
        (3, f"{postscript};resonance-og"),
        (4, f"{family} {style}"),
        (6, postscript),
        (10, note),
    ]:
        name.setName(value, name_id, 3, 1, 0x409)
        name.setName(value, name_id, 1, 0, 0)
    if "STAT" in font:
        del font["STAT"]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for source, target, axes in INSTANCES:
        font = instancer.instantiateVariableFont(TTFont(SRC / source), axes, updateFontNames=True)
        if target.startswith("ShareDisplay"):
            freeze(font, "lnum")
            rename(
                font,
                "Share Display",
                "Bold",
                "Playfair Display 700 with lining figures as the default, for Resonance's link-preview images. "
                "Renamed: Playfair Display is a Reserved Font Name.",
            )
        font.recalcTimestamp = False  # the same files from the same sources, run after run
        font.save(OUT / target)
        print(f"{target:28} {(OUT / target).stat().st_size / 1e6:5.2f} MB")


if __name__ == "__main__":
    main()

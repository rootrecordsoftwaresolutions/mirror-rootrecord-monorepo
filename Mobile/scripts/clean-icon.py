"""
Clean residue from a transparent PNG icon (e.g. background-remover artifacts).

Two passes:
  1. COLOR PASS — for every pixel with alpha > 0, ask: is this pixel essentially "blue residue"?
     A pixel is considered residue when the blue channel dominates by a clear margin over BOTH
     red and green, AND the pixel is partially-transparent (alpha < 220). The actual logo is
     teal/green — blue and green are very close — so dominant-blue is a strong residue signal
     without touching the logo body. Residue pixels are zeroed (alpha → 0).
  2. ISLAND PASS — connected-component labeling on the remaining alpha mask. Any component
     smaller than MIN_COMPONENT_PX is wiped. This kills the tiny splatter dots that survive
     the color filter (those mid-grey/mid-cyan specks the background remover left around the
     edges).

Run modes:
    python clean-icon.py --analyse PATH       # print stats, don't write
    python clean-icon.py PATH                 # clean in place (caller is responsible for backups)
    python clean-icon.py PATH --out PATH      # explicit output path

Implemented with numpy only (no scipy) — uses an iterative BFS for connected components.
"""

from __future__ import annotations
import argparse
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


# Thresholds — chosen for the RootRecord icon, but reasonable for most "transparent logo with
# blue background remover residue" cases. Tighten BLUE_MARGIN if you start eating the logo.
BLUE_MARGIN = 25            # B must beat R by >= this AND beat G by >= this to count as residue
RESIDUE_ALPHA_MAX = 220     # only pixels softer than this are eligible (full-opaque pixels stay)
MIN_COMPONENT_PX = 80       # connected-blob size below which a component is treated as a speck
ALPHA_KEEP_THRESHOLD = 8    # alpha values below this are treated as "already empty" for CC


def load_rgba(path: Path) -> np.ndarray:
    img = Image.open(path).convert("RGBA")
    return np.array(img, dtype=np.uint8)


def color_pass(arr: np.ndarray) -> tuple[np.ndarray, int]:
    """Zero out alpha for pixels that look like blue-channel residue."""
    r = arr[..., 0].astype(np.int16)
    g = arr[..., 1].astype(np.int16)
    b = arr[..., 2].astype(np.int16)
    a = arr[..., 3]

    blueish = (b - r >= BLUE_MARGIN) & (b - g >= BLUE_MARGIN)
    soft = a < RESIDUE_ALPHA_MAX
    has_ink = a > 0
    mask = blueish & soft & has_ink

    removed = int(mask.sum())
    if removed:
        arr[mask, 3] = 0
    return arr, removed


def connected_components(alpha_mask: np.ndarray) -> np.ndarray:
    """4-connected component labels; 0 = background, 1..N = labels. BFS, numpy-only."""
    h, w = alpha_mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    next_label = 0
    visited = np.zeros((h, w), dtype=bool)
    neighbors = ((-1, 0), (1, 0), (0, -1), (0, 1))

    for y0 in range(h):
        row = alpha_mask[y0]
        for x0 in range(w):
            if not row[x0] or visited[y0, x0]:
                continue
            next_label += 1
            q: deque[tuple[int, int]] = deque()
            q.append((y0, x0))
            visited[y0, x0] = True
            while q:
                y, x = q.popleft()
                labels[y, x] = next_label
                for dy, dx in neighbors:
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and alpha_mask[ny, nx]:
                        visited[ny, nx] = True
                        q.append((ny, nx))
    return labels


def island_pass(arr: np.ndarray) -> tuple[np.ndarray, int, int]:
    """Wipe alpha for components smaller than MIN_COMPONENT_PX. Returns (arr, dropped_components,
    dropped_pixels)."""
    alpha = arr[..., 3]
    mask = alpha > ALPHA_KEEP_THRESHOLD
    labels = connected_components(mask)
    if labels.max() == 0:
        return arr, 0, 0

    counts = np.bincount(labels.ravel())
    counts[0] = 0  # background
    small = np.where((counts > 0) & (counts < MIN_COMPONENT_PX))[0]

    dropped_components = int(len(small))
    dropped_pixels = 0
    if dropped_components:
        wipe_mask = np.isin(labels, small)
        dropped_pixels = int(wipe_mask.sum())
        arr[wipe_mask, 3] = 0
    return arr, dropped_components, dropped_pixels


def analyse(path: Path) -> None:
    arr = load_rgba(path)
    h, w = arr.shape[:2]
    alpha = arr[..., 3]
    r = arr[..., 0].astype(np.int16)
    g = arr[..., 1].astype(np.int16)
    b = arr[..., 2].astype(np.int16)
    print(f"size: {w}x{h}")
    print(f"alpha == 0:        {(alpha == 0).sum():>10d}")
    print(f"alpha 1..127:      {((alpha > 0) & (alpha <= 127)).sum():>10d}")
    print(f"alpha 128..220:    {((alpha > 127) & (alpha <= 220)).sum():>10d}")
    print(f"alpha 221..255:    {(alpha > 220).sum():>10d}")
    blueish = (b - r >= BLUE_MARGIN) & (b - g >= BLUE_MARGIN) & (alpha > 0)
    print(f"blueish residue:   {blueish.sum():>10d}")
    # Component count
    mask = alpha > ALPHA_KEEP_THRESHOLD
    labels = connected_components(mask)
    counts = np.bincount(labels.ravel())
    if len(counts) > 1:
        comp_counts = counts[1:]
        small = (comp_counts < MIN_COMPONENT_PX).sum()
        print(f"components:        {len(comp_counts):>10d}")
        print(f"  < {MIN_COMPONENT_PX} px:        {small:>10d}")
        print(f"  largest size:    {comp_counts.max():>10d}")
    else:
        print("components:                 0")


def clean(in_path: Path, out_path: Path) -> None:
    arr = load_rgba(in_path)
    arr, removed = color_pass(arr)
    print(f"color pass: zeroed {removed} pixels")
    arr, comps, pix = island_pass(arr)
    print(f"island pass: removed {comps} components ({pix} pixels)")
    Image.fromarray(arr, "RGBA").save(out_path, format="PNG", optimize=True)
    print(f"wrote {out_path}")


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("path", type=Path)
    p.add_argument("--analyse", action="store_true", help="report stats, don't write")
    p.add_argument("--out", type=Path, default=None, help="output path (defaults to in-place)")
    args = p.parse_args(argv)

    if not args.path.exists():
        print(f"not found: {args.path}", file=sys.stderr)
        return 2

    if args.analyse:
        analyse(args.path)
        return 0

    out = args.out or args.path
    clean(args.path, out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

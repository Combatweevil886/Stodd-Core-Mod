#!/usr/bin/env python3
"""Numpy port of Survival Island's IslandContinentalNoise (island placement + metaball coast), without the domain warp.
Used to put honest numbers next to the presets in config/stodd_islands.properties.

The placement part (hash, rank, separation test, falloff radius) is a line-for-line port of the Java in
supercoder79.survivalisland.noise.IslandContinentalNoise; the coast is where lerp(value, min, max) crosses 0.  The domain warp
(28-block wobble) and the slow range variation are replaced by fixed blends, so the shapes are smoother than in game, but sizes and gaps agree.

usage: islandsim.py <islandSize> <islandSeperation> [rangeBlend 0..1 = 0.5] [km = 7] [seeds = 3] [level = -0.15]
level = the continentalness above which the STODD terrain spline stands above sea level (about -0.15); 0 would be the metaball's own coast.
"""
import sys, math
import numpy as np
from scipy import ndimage, spatial

PX, PZ, PI_, HM = 0x5205402B9270C86F, 0x5BCC226E9FA0BACB, 0x598CD327003817B5, 0x53A3F72DEEC546F5
M = (1 << 64) - 1


def s64(x):
    x &= M
    return x - (1 << 64) if x >> 63 else x


def jhash(seed, cx, cz, i):
    h = s64(seed) ^ s64(cx * PX) ^ s64(cz * PZ) ^ s64(i * PI_)
    h = s64(h * HM)
    h ^= h >> 32          # arithmetic shift of a signed value, as in Java
    return h


def islands(seed, size, sep, under_mult, half_km):
    """-> (centres Nx2 in blocks, falloff radius per island in blocks, coast-curve value per island)."""
    cell = sep * math.sqrt(2)
    sepg = sep / cell
    half = int(half_km * 1000 / cell) + 4
    pos, rank = [], []
    for cx in range(-half, half + 1):
        for cz in range(-half, half + 1):
            for i in range(3):
                h = jhash(seed, cx, cz, i)
                jx = (h & 0xFFFF) / 65536.0
                jz = ((h >> 16) & 0xFFFF) / 65536.0
                r = (h >> 32)
                r = ((r + (1 << 31)) & 0xFFFFFFFF) - (1 << 31)   # (int) cast
                pos.append((cx + jx, cz + jz)); rank.append(r)
    pos = np.array(pos); rank = np.array(rank)
    tree = spatial.cKDTree(pos)
    keep = np.ones(len(pos), bool)
    for a, nb in enumerate(tree.query_ball_point(pos, sepg - 1e-9)):
        for b in nb:
            if b != a and rank[b] >= rank[a]:
                keep[a] = False; break
    conf = pos[keep]
    ctree = spatial.cKDTree(conf)
    fall = (size * (1 + under_mult)) / cell
    d, _ = ctree.query(conf, k=2)
    nearest = d[:, 1]
    fall_sq = np.minimum(fall * fall, nearest * nearest)
    coast_sq = (size * size) / (cell * cell)
    curve = (1 - coast_sq / fall_sq) ** 3
    return conf * cell, np.sqrt(fall_sq) * cell, curve, fall_sq, cell


def field(centres, fall_blocks, fall_sq, curve, cell, tmin, tmax, half_km, step):
    n = int(2 * half_km * 1000 / step)
    v = np.zeros((n, n), np.float32)
    t = (0 - tmin) / (tmax - tmin)
    off = -half_km * 1000
    for (cx, cz), fr, c in zip(centres, fall_blocks, curve):
        i0 = max(0, int((cx - fr - off) / step)); i1 = min(n, int((cx + fr - off) / step) + 2)
        j0 = max(0, int((cz - fr - off) / step)); j1 = min(n, int((cz + fr - off) / step) + 2)
        if i0 >= i1 or j0 >= j1: continue
        xs = (np.arange(i0, i1) * step + off - cx)[:, None]
        zs = (np.arange(j0, j1) * step + off - cz)[None, :]
        q = (xs * xs + zs * zs) / (fr * fr)
        f = np.clip(1 - q, 0, None) ** 3
        num = (1 - c) * t; den = c - t
        f = num * f / (num + (1 - f) * den)
        v[i0:i1, j0:j1] += f
    return tmin + v * (tmax - tmin)


def stats(size, sep, blend=0.5, half_km=7, seeds=3, under=9.0, ra=(-0.5, 0.9), rb=(-1.0, 1.4), step=10, level=-0.15):
    tmin = ra[0] + (rb[0] - ra[0]) * blend
    tmax = ra[1] + (rb[1] - ra[1]) * blend
    out = dict(land=[], count=[], length=[], gap_min=[], gap_med=[], gap_max=[], near=[], per100=[])
    for s in range(seeds):
        seed = 1234567 + s * 7919
        c, fb, cv, fsq, cell = islands(seed, size, sep, under, half_km)
        inside = (np.abs(c[:, 0]) < half_km * 1000 - 1500) & (np.abs(c[:, 1]) < half_km * 1000 - 1500)
        f = field(c, fb, fsq, cv, cell, tmin, tmax, half_km, step)
        land = f > level
        lab, n = ndimage.label(land)
        if n == 0: continue
        area = ndimage.sum(land, lab, range(1, n + 1)) * step * step
        com = np.array(ndimage.center_of_mass(land, lab, range(1, n + 1))) * step - half_km * 1000
        ok = (np.abs(com[:, 0]) < half_km * 1000 - 1500) & (np.abs(com[:, 1]) < half_km * 1000 - 1500) & (area > 2000)
        out['land'].append(land.mean())
        out['count'].append(ok.sum())
        out['length'].append(np.median(2 * np.sqrt(area[ok] / math.pi)) if ok.any() else 0)
        # shore-to-shore gap to the nearest other landmass, from centre distance and equivalent radii
        rad = np.sqrt(area / math.pi)
        tr = spatial.cKDTree(com)
        gaps = []
        for k in np.nonzero(ok)[0]:
            dd, jj = tr.query(com[k], k=min(6, len(com)))
            best = min((d - rad[k] - rad[j]) for d, j in zip(dd[1:], jj[1:])) if len(com) > 1 else None
            if best is not None: gaps.append(best)
        if gaps:
            out['gap_min'].append(min(gaps)); out['gap_med'].append(float(np.median(gaps))); out['gap_max'].append(max(gaps))
        out['per100'].append(ok.sum() / ((2 * half_km - 3) ** 2) * 100)
    return {k: (float(np.mean(v)) if v else float('nan')) for k, v in out.items()}


if __name__ == '__main__':
    size = float(sys.argv[1]); sep = float(sys.argv[2])
    blend = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
    km = float(sys.argv[4]) if len(sys.argv) > 4 else 7
    seeds = int(sys.argv[5]) if len(sys.argv) > 5 else 3
    level = float(sys.argv[6]) if len(sys.argv) > 6 else -0.15
    r = stats(size, sep, blend, km, seeds, level=level)
    print('size %g sep %g blend %.2f : land %.1f%%  islands/100km2 %.1f  island length(median) %d  shore gap min/med/max %d/%d/%d' % (
        size, sep, blend, r['land'] * 100, r['per100'], r['length'], r['gap_min'], r['gap_med'], r['gap_max']))

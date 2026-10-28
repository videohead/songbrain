#!/usr/bin/env python3
"""Spike: correlate _CREASE.STY drum records with the authoritative pattern grid."""
import re

d = open('docs/styles/_CREASE.STY', 'rb').read()

# Authoritative ground truth from the StyleMaker closeup (0-based 16th cells):
# (gm_note, cell, velocity)
GT = [
    (36, 0, 55), (42, 0, 73), (82, 0, 19),
    (42, 2, 50),
    (82, 3, 19),
    (38, 5, 75), (42, 5, 75), (82, 5, 38),
    (36, 6, 32), (42, 6, 74),
    (36, 8, 55),
    (36, 9, 55), (42, 9, 75),
    (82, 10, 34),
    (46, 11, 75),
    (38, 12, 75), (42, 12, 75), (82, 12, 75),
    (42, 14, 67),
]
gt_vels = [v for _, _, v in GT]

pat = re.compile(rb'\xff\x00\xff\x00([\xde\xe3\xf0-\xf7])\xd0\xe0\xd0\xd0')
ms = list(pat.finditer(d))
print('chunks:', len(ms))

best = None
for idx, m in enumerate(ms):
    start = m.end() + 9
    end = ms[idx + 1].start() if idx + 1 < len(ms) else len(d)
    ev = d[start:end]
    recs = [(ev[j], ev[j + 1], ev[j + 2]) for j in range(0, len(ev) - 2, 3)]
    vels = [r[0] for r in recs]
    score = sum(1 for a, b in zip(vels, gt_vels) if a == b)
    pre = 0
    for a, b in zip(vels, gt_vels):
        if a == b:
            pre += 1
        else:
            break
    if best is None or pre > best[0]:
        best = (pre, score, start, m.group(1)[0], d[m.end()], recs)

pre, score, start, ctype, barno, recs = best
print(f'best: prefix={pre} overlap={score} at offset {start} type={hex(ctype)} bar#={barno}')
print('k  vel  b1   b2  | note cell vel')
for k in range(19):
    b0, b1, b2 = recs[k]
    n, c, v = GT[k]
    mark = 'OK' if b0 == v else 'XX'
    print(f'{k:2d} {b0:3d} {b1:3d} {b2:3d} | {n:3d} {c:4d} {v:3d} {mark}')

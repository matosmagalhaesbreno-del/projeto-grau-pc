"""Carros do trânsito, palmeira, poste e semáforo (Blender/bpy)."""
import math
import os
import random
import sys
sys.path.insert(0, os.path.dirname(__file__))
from lib import *  # noqa
from mathutils import Vector

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'models', 'raw')

CARS = {
    # L, W, H, entre-eixos, raio roda, estilo da traseira
    'hatch': dict(L=3.95, W=1.72, H=1.48, wb=2.52, wr=0.30, rear='hatch', hood=0.86, belt=0.98),
    'sedan': dict(L=4.55, W=1.76, H=1.46, wb=2.62, wr=0.31, rear='sedan', hood=0.84, belt=0.97),
    'suv': dict(L=4.45, W=1.82, H=1.66, wb=2.64, wr=0.35, rear='hatch', hood=1.0, belt=1.12),
    'pickup': dict(L=5.25, W=1.86, H=1.80, wb=3.10, wr=0.37, rear='pickup', hood=1.08, belt=1.18),
}


def car_materials():
    clear_mats()
    mat('paint', (0.8, 0.8, 0.8), 0.45, 0.28, coat=1.0, coat_rough=0.04)
    mat('glass', (0.02, 0.025, 0.035), 0.9, 0.05)
    mat('trim', (0.025, 0.025, 0.028), 0.0, 0.55)
    mat('chrome', (0.9, 0.9, 0.92), 1.0, 0.1)
    mat('light_front', (0.95, 0.95, 1.0), 0.0, 0.1, emit=(1.0, 0.96, 0.88), emit_strength=0.3)
    mat('light_rear', (0.5, 0.02, 0.02), 0.0, 0.2, emit=(1.0, 0.04, 0.03), emit_strength=0.4)
    mat('rubber', (0.025, 0.025, 0.027), 0.0, 0.9)
    mat('rim', (0.6, 0.6, 0.62), 0.9, 0.3)
    mat('plate', (0.9, 0.9, 0.9), 0.0, 0.5)


def build_car(key, C):
    reset_scene()
    car_materials()
    L, W, H, wr = C['L'], C['W'], C['H'], C['wr']
    hw = W / 2
    f, r = L / 2, -L / 2
    hood, belt = C['hood'], C['belt']
    gc = 0.17
    zc = (gc + belt) / 2
    hh = (belt - gc) / 2
    parts = []
    wb = C['wb']
    R = wr + 0.06

    def arch(yc):
        pts = []
        for i in range(13):
            a = math.pi * i / 12
            pts.append((yc + R * math.cos(a), wr * 0.92 + R * math.sin(a) * 0.98))
        return pts
    # perfil lateral da carroceria (frente em +Y), com recortes das rodas
    prof = [(f, gc + 0.12), (f + 0.01, hood - 0.12), (f - 0.12, hood - 0.02), (f - 0.9, hood + 0.03)]
    cab_f = f - (1.18 if C['rear'] != 'pickup' else 1.30)
    cab_r = {'sedan': r + 1.05, 'hatch': r + 0.10, 'pickup': r + 1.90}[C['rear']]
    prof.append((cab_f, belt))
    if C['rear'] == 'sedan':
        prof += [(r + 0.95, belt), (r + 0.25, belt + 0.03), (r + 0.02, belt - 0.05), (r, gc + 0.14)]
    elif C['rear'] == 'pickup':
        prof += [(r + 1.85, belt), (r + 1.80, belt + 0.12), (r + 0.05, belt + 0.1), (r, belt), (r, gc + 0.14)]
    else:
        prof += [(r + 0.08, belt), (r, belt - 0.12), (r - 0.01, gc + 0.14)]
    prof.append((r + 0.05, gc))
    for (y, z) in reversed(arch(-wb / 2)):
        prof.append((y, z))
    for (y, z) in reversed(arch(wb / 2)):
        prof.append((y, z))
    prof.append((f - 0.05, gc))
    # remove o arco duplicado "de trás para frente": arcos já ordenados da traseira para a frente
    body_lo = extrude_profile('lower', prof, hw, [mat('paint')], taper=lambda z: 1.0 - max(0.0, z - (belt - 0.15)) * 0.25, bevel=0.07, bevel_segments=3)
    parts.append(body_lo)
    # estufa (vidros) com teto
    gh = H - belt
    roof_f = cab_f - (0.62 if C['rear'] != 'pickup' else 0.5)
    roof_r = cab_r + (0.5 if C['rear'] == 'sedan' else 0.10)
    gpro = [(cab_f, belt - 0.01), (roof_f, H), (roof_r, H), (cab_r, belt - 0.01)]

    def gm(nrm, c):
        return 1 if nrm.z > 0.85 else 0
    gl = extrude_profile('greenhouse', gpro, hw * 0.93, [mat('glass'), mat('paint')], taper=lambda z: 1.0 - (z - belt) / max(gh, 0.1) * 0.13,
                         bevel=0.03, bevel_segments=2, face_mats=gm)
    parts.append(gl)
    for s in (-1, 1):
        bp = (roof_f + roof_r) / 2
        parts.append(box('bpillar', (s * hw * 0.86, bp, belt + gh / 2), (0.03, 0.09, gh * 0.96), mat('trim')))
        for (y0, y1) in ((cab_f, roof_f), (cab_r, roof_r)):
            parts.append(tube('pillar', [Vector((s * hw * 0.92, y0, belt)), Vector((s * hw * 0.81, y1, H - 0.01))], 0.03, mat('paint'), N=6))
        parts.append(box('mirror', (s * (hw + 0.05), cab_f - 0.08, belt + 0.07), (0.12, 0.07, 0.09), mat('paint'), bevel=0.02))
        parts.append(box('trimline', (s * (hw + 0.004), 0.0, gc + 0.10), (0.02, wb - 2 * R - 0.05, 0.08), mat('trim')))
        parts.append(box('handle', (s * (hw - 0.01), cab_f - 0.35, belt - 0.08), (0.03, 0.14, 0.03), mat('trim')))
        parts.append(box('handle2', (s * (hw - 0.01), (roof_f + roof_r) / 2 - 0.25, belt - 0.08), (0.03, 0.14, 0.03), mat('trim')))
        parts.append(box('headlight', (s * hw * 0.62, f - 0.08, hood - 0.08), (hw * 0.45, 0.14, 0.09), mat('light_front'), bevel=0.02))
        parts.append(box('taillight', (s * hw * 0.72, r + 0.02, belt - 0.14), (hw * 0.34, 0.06, 0.12), mat('light_rear'), bevel=0.015))
        # caixas de roda internas (escuras)
        for yy in (wb / 2, -wb / 2):
            parts.append(cylinder('wellr', Vector((s * (hw - 0.02), yy, wr * 0.92)), Vector((s * (hw - 0.30), yy, wr * 0.92)), R - 0.01, mat('trim'), segs=16))
    parts.append(box('grille', (0, f + 0.0, gc + 0.32), (W * 0.52, 0.05, 0.18), mat('trim'), bevel=0.02))
    parts.append(box('bumper_f', (0, f + 0.012, gc + 0.12), (W * 0.9, 0.06, 0.13), mat('trim'), bevel=0.03))
    parts.append(box('bumper_r', (0, r - 0.01, gc + 0.14), (W * 0.88, 0.06, 0.12), mat('trim'), bevel=0.03))
    parts.append(plate_quad('plate_r', (0, r - 0.045, gc + 0.33), 0.40, 0.13, mat('plate')))
    if C['rear'] == 'pickup':
        parts.append(box('bed', (0, r + 0.95, belt - 0.05), (W * 0.84, 1.75, 0.04), mat('trim')))
    body = join('body', parts, origin=(0, 0, 0))
    # roda modelo
    tire = lathe_x('tire', [(wr * 0.62, -0.10), (wr * 0.95, -0.11), (wr, -0.07), (wr, 0.07), (wr * 0.95, 0.11), (wr * 0.62, 0.10)], mat('rubber'), segs=16)
    rim = lathe_x('rim', [(0.0, 0.11), (wr * 0.62, 0.105), (wr * 0.6, 0.0)], mat('rim'), segs=12)
    wheel = join('wheel', [tire, rim], origin=(0, 0, 0))
    wheel.location = (hw - 0.12, C['wb'] / 2, wr)
    root = empty('car', (0, 0, 0))
    set_parent(body, root)
    root['wb'] = C['wb']
    root['track'] = W - 0.25
    root['wr'] = wr
    root['L'] = L
    root['W'] = W
    print(f'[car] {key}: {tri_count()} tris')
    export_glb(os.path.join(OUT, f'car_{key}.glb'))


def build_palm():
    reset_scene()
    clear_mats()
    random.seed(7)
    mat('trunk', (0.36, 0.30, 0.24), 0.0, 0.9)
    mat('frond', (0.16, 0.30, 0.09), 0.0, 0.55)
    mat('coconut', (0.25, 0.2, 0.08), 0.0, 0.7)
    Hh = 9.0
    pts, rings = [], []
    n = 28
    for i in range(n + 1):
        t = i / n
        p = Vector((0.6 * t * t, 0.0, Hh * t))
        pts.append(p)
        r = 0.22 - 0.07 * t + (0.018 if i % 2 else 0.0)
        rings.append(circle(r, 10))
    trunk = sweep('trunk', pts, rings, mat('trunk'), subsurf=0)
    top = pts[-1]
    crown = sphere('crown', tuple(top + Vector((0, 0, 0.1))), 0.28, mat('trunk'), segs=10, rings=6)
    nuts = [sphere('nut', tuple(top + Vector((math.cos(a) * 0.22, math.sin(a) * 0.22, -0.25))), 0.1, mat('coconut'), segs=8, rings=5) for a in (0.3, 2.2, 4.1)]
    verts, faces = [], []
    NF = 16
    for k in range(NF):
        a = 2 * math.pi * k / NF + random.uniform(-0.1, 0.1)
        L = random.uniform(3.2, 4.2)
        lift = random.uniform(0.2, 0.9) if k % 2 else random.uniform(-0.4, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-math.sin(a), math.cos(a), 0))
        M = 18
        prev = None
        for i in range(M + 1):
            t = i / M
            p = top + d * (L * t) + Vector((0, 0, lift * t * 2.0 - 1.6 * t * t * L / 3.5))
            if i == 0:
                continue
            ll = 0.9 * math.sin(math.pi * min(1, t * 1.15)) * (1 - 0.3 * t)
            droop = Vector((0, 0, -0.35 * ll))
            base = len(verts)
            verts += [p, p + side * ll + droop + d * 0.12, p - side * ll + droop + d * 0.12]
            if prev is not None:
                faces += [(prev, base, base + 1, prev + 1), (prev, prev + 2, base + 2, base)]
            prev = base
    fr = make_obj('fronds', verts, faces, mat('frond'), smooth=True, sharp_angle=180, recalc=False)
    palm = join('palm', [trunk, crown, fr] + nuts, origin=(0, 0, 0))
    print('[palm]', tri_count(), 'tris')
    export_glb(os.path.join(OUT, 'palm.glb'))


def build_lamp():
    reset_scene()
    clear_mats()
    mat('pole', (0.18, 0.19, 0.2), 0.7, 0.4)
    mat('lamp', (0.9, 0.9, 0.85), 0.0, 0.3, emit=(1.0, 0.85, 0.6), emit_strength=0.0)
    pole = lathe_axis('pole', [(0.0, 0.0), (0.12, 0.0), (0.12, 0.25), (0.08, 0.3), (0.06, 8.5), (0.0, 8.5)], mat('pole'), (0, 0, 0), (0, 0, 1), segs=12)
    arm = tube('arm', bezier((0, 0, 8.3), (0, 0, 9.3), (0, 1.4, 9.2), steps=10), 0.045, mat('pole'), N=8)
    head = loft_y('head', [dict(y=1.2, z=9.15, wt=0.16, ht=0.05, n=3), dict(y=1.9, z=9.12, wt=0.2, ht=0.06, n=3), dict(y=2.3, z=9.1, wt=0.14, ht=0.04, n=3)], mat('pole'), N=12)
    lens = box('lens', (0, 1.85, 9.06), (0.3, 0.7, 0.02), mat('lamp'))
    join('lamp', [pole, arm, head, lens], origin=(0, 0, 0))
    print('[lamp]', tri_count(), 'tris')
    export_glb(os.path.join(OUT, 'lamp.glb'))


def build_traffic_light():
    reset_scene()
    clear_mats()
    mat('pole', (0.12, 0.12, 0.13), 0.6, 0.45)
    mat('housing', (0.05, 0.05, 0.055), 0.2, 0.5)
    mat('tl_red', (0.25, 0.02, 0.02), 0.0, 0.2, emit=(1, 0.05, 0.03), emit_strength=0.0)
    mat('tl_yellow', (0.3, 0.2, 0.02), 0.0, 0.2, emit=(1, 0.6, 0.05), emit_strength=0.0)
    mat('tl_green', (0.02, 0.25, 0.1), 0.0, 0.2, emit=(0.1, 1, 0.5), emit_strength=0.0)
    pole = lathe_axis('pole', [(0.0, 0.0), (0.1, 0.0), (0.09, 0.2), (0.075, 5.6), (0.0, 5.6)], mat('pole'), (0, 0, 0), (0, 0, 1), segs=12)
    arm = tube('arm', [(0, 0, 5.4), (0, 3.2, 5.4)], 0.05, mat('pole'), N=8)
    hs = box('housing', (0, 3.0, 4.75), (0.34, 0.34, 0.95), mat('housing'), bevel=0.03)
    objs = [pole, arm, hs]
    lamps = []
    for i, nm in enumerate(('tl_red', 'tl_yellow', 'tl_green')):
        z = 5.03 - i * 0.29
        lamps.append(lathe_axis('lamp_' + nm, [(0.0, 0.0), (0.1, 0.0), (0.0, 0.02)], mat(nm), (-0.175, 3.0, z), (-1, 0, 0), segs=16))
        objs.append(box('visor', (-0.23, 3.0, z + 0.09), (0.12, 0.26, 0.02), mat('housing')))
    body = join('tlight', objs, origin=(0, 0, 0))
    for l, nm in zip(lamps, ('red', 'yellow', 'green')):
        o = join('lamp_' + nm, [l], origin=(0, 0, 0))
    print('[tlight]', tri_count(), 'tris')
    export_glb(os.path.join(OUT, 'tlight.glb'))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for k, C in CARS.items():
        build_car(k, C)
    build_palm()
    build_lamp()
    build_traffic_light()

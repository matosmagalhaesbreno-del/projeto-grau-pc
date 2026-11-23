"""Piloto segmentado para IK no jogo.

Cada segmento tem a origem na articulação proximal e se estende ao longo de +Z (Blender),
com a "frente" (rosto, joelho, bico do tênis) voltada para -Y. No glTF isso vira:
eixo do membro = +Y local, frente = +Z local.
"""
import math
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from lib import *  # noqa
from mathutils import Vector


def sweep_z(name, secs, material, N=16, subsurf=2, origin=(0, 0, 0), caps=True):
    """Loft ao longo de Z. secs: dict(z, wt, wb?, ht (costas, +Y), hb (frente, -Y), n?, x?, y?)."""
    path, rings = [], []
    for s in secs:
        path.append((origin[0] + s.get('x', 0.0), origin[1] + s.get('y', 0.0), origin[2] + s['z']))
        rings.append(superellipse(s['wt'], s.get('wb', s['wt']), s['ht'], s.get('hb', s['ht']), s.get('n', 2.2), N))
    return sweep(name, path, rings, material, caps=caps, subsurf=subsurf, up=(0, 0, 1))


def materials():
    clear_mats()
    mat('jacket', (0.05, 0.06, 0.08), 0.0, 0.62)
    mat('jacket_accent', (0.75, 0.08, 0.06), 0.0, 0.5)
    mat('pants', (0.07, 0.10, 0.20), 0.0, 0.85)
    mat('helmet', (0.92, 0.92, 0.93), 0.3, 0.18, coat=1.0, coat_rough=0.03)
    mat('helmet_accent', (0.02, 0.02, 0.025), 0.3, 0.2, coat=1.0)
    mat('visor', (0.02, 0.025, 0.04), 0.9, 0.04)
    mat('gloves', (0.03, 0.03, 0.035), 0.0, 0.6)
    mat('shoes', (0.92, 0.92, 0.9), 0.0, 0.55)
    mat('sole', (0.12, 0.12, 0.12), 0.0, 0.8)
    mat('skin', (0.55, 0.38, 0.28), 0.0, 0.6)


def build(out):
    reset_scene()
    materials()
    objs = []

    # pélvis (origem no centro do quadril)
    p = sweep_z('pelvis', [dict(z=-0.06, wt=0.13, ht=0.08, hb=0.07, n=2.6), dict(z=0.02, wt=0.17, ht=0.10, hb=0.09, n=2.6),
                           dict(z=0.10, wt=0.15, ht=0.09, hb=0.085, n=2.6), dict(z=0.14, wt=0.14, ht=0.085, hb=0.08, n=2.6)], mat('pants'))
    objs.append(join('pelvis', [p], origin=(0, 0, 0)))

    # tronco (origem na lombar, 0.12 acima do quadril)
    O = Vector((0, 0, 1.0))
    t = sweep_z('torso', [dict(z=-0.03, wt=0.15, ht=0.09, hb=0.085, n=2.5), dict(z=0.10, wt=0.155, ht=0.10, hb=0.095, n=2.5),
                          dict(z=0.25, wt=0.18, ht=0.11, hb=0.11, n=2.5), dict(z=0.36, wt=0.21, ht=0.10, hb=0.10, n=2.8),
                          dict(z=0.43, wt=0.19, ht=0.08, hb=0.07, n=2.8), dict(z=0.47, wt=0.08, ht=0.05, hb=0.05, n=2.2)], mat('jacket'), origin=O)
    stripe = sweep_z('stripe', [dict(z=0.20, wt=0.185, ht=0.114, hb=0.114, n=2.5), dict(z=0.23, wt=0.19, ht=0.116, hb=0.116, n=2.5)], mat('jacket_accent'), origin=O, subsurf=1)
    collar = sweep_z('collar', [dict(z=0.43, wt=0.085, ht=0.065, hb=0.06), dict(z=0.50, wt=0.075, ht=0.06, hb=0.055)], mat('jacket'), origin=O, subsurf=1)
    objs.append(join('torso', [t, stripe, collar], origin=O))

    # cabeça + capacete (origem na base do pescoço)
    O = Vector((0, 0, 1.5))
    neck = sweep_z('neck', [dict(z=0.0, wt=0.055, ht=0.055), dict(z=0.09, wt=0.05, ht=0.05)], mat('skin'), origin=O, subsurf=1)
    hc = O + Vector((0, -0.01, 0.20))
    shell = sweep_z('helmet', [dict(z=-0.13, wt=0.10, ht=0.12, hb=0.13, n=2.2), dict(z=-0.08, wt=0.13, ht=0.15, hb=0.15, n=2.1),
                               dict(z=0.0, wt=0.145, ht=0.16, hb=0.155, n=2.0), dict(z=0.08, wt=0.135, ht=0.15, hb=0.14, n=2.0),
                               dict(z=0.14, wt=0.09, ht=0.10, hb=0.09, n=2.0), dict(z=0.165, wt=0.02, ht=0.02, hb=0.02, n=2.0)],
                    mat('helmet'), origin=hc, N=20)
    # viseira: casca na frente
    vis = []
    for i in range(6):
        z = -0.055 + i * 0.022
        row = []
        for j in range(7):
            a = math.radians(-62 + j * 124 / 6)
            r = 0.158 - abs(z) * 0.15
            row.append(hc + Vector((math.sin(a) * r * 0.93, -math.cos(a) * r, z)))
        vis.append(row)
    visor = grid_surface('visor', vis, mat('visor'), thickness=0.004, subsurf=2)
    spoiler = sweep_z('spoiler', [dict(z=0.06, wt=0.06, ht=0.02, hb=0.01, y=0.15), dict(z=0.09, wt=0.05, ht=0.015, hb=0.01, y=0.13)], mat('helmet_accent'), origin=hc, subsurf=1)
    chin = sweep_z('chin', [dict(z=-0.13, wt=0.07, ht=0.02, hb=0.03, y=-0.11), dict(z=-0.08, wt=0.09, ht=0.02, hb=0.03, y=-0.13)], mat('helmet_accent'), origin=hc, subsurf=1)
    objs.append(join('head', [neck, shell, visor, spoiler, chin], origin=O))

    # braços
    for side, sx in (('L', -1), ('R', 1)):
        O = Vector((sx * 0.4, 0, 1.4))
        ua = sweep_z('uarm', [dict(z=-0.02, wt=0.06, ht=0.058), dict(z=0.10, wt=0.056, ht=0.054), dict(z=0.24, wt=0.048, ht=0.046), dict(z=0.30, wt=0.045, ht=0.044)],
                     mat('jacket'), origin=O)
        objs.append(join('uarm_' + side, [ua], origin=O))
        O = Vector((sx * 0.6, 0, 1.4))
        fa = sweep_z('farm', [dict(z=-0.01, wt=0.045, ht=0.044), dict(z=0.10, wt=0.046, ht=0.044), dict(z=0.22, wt=0.038, ht=0.034), dict(z=0.255, wt=0.04, ht=0.036)],
                     mat('jacket'), origin=O)
        cuff = sweep_z('cuff', [dict(z=0.225, wt=0.041, ht=0.038), dict(z=0.255, wt=0.043, ht=0.04)], mat('jacket_accent'), origin=O, subsurf=1)
        glove = sweep_z('glove', [dict(z=0.25, wt=0.038, ht=0.03, hb=0.032), dict(z=0.29, wt=0.045, ht=0.032, hb=0.04, n=2.8),
                                  dict(z=0.33, wt=0.046, ht=0.03, hb=0.042, n=2.8), dict(z=0.35, wt=0.03, ht=0.02, hb=0.03, n=2.4)], mat('gloves'), origin=O)
        thumb = sweep_z('thumb', [dict(z=0.27, wt=0.012, ht=0.012, x=-sx * 0.035, y=-0.03), dict(z=0.31, wt=0.011, ht=0.011, x=-sx * 0.03, y=-0.045)], mat('gloves'), origin=O, subsurf=1)
        objs.append(join('farm_' + side, [fa, cuff, glove, thumb], origin=O))

    # pernas
    for side, sx in (('L', -1), ('R', 1)):
        O = Vector((sx * 0.4, 0.5, 0.9))
        th = sweep_z('thigh', [dict(z=-0.03, wt=0.085, ht=0.085), dict(z=0.12, wt=0.08, ht=0.08), dict(z=0.32, wt=0.064, ht=0.062), dict(z=0.45, wt=0.058, ht=0.058, hb=0.062)],
                     mat('pants'), origin=O)
        objs.append(join('thigh_' + side, [th], origin=O))
        O = Vector((sx * 0.4, 1.0, 0.9))
        sh = sweep_z('shin', [dict(z=-0.02, wt=0.058, ht=0.056, hb=0.062), dict(z=0.12, wt=0.055, ht=0.06), dict(z=0.32, wt=0.048, ht=0.048), dict(z=0.40, wt=0.05, ht=0.05)],
                     mat('pants'), origin=O)
        # tênis: corpo do calçado à frente (-Y) no fim da canela
        shoe = loft_y('shoe', [dict(x=O.x, y=O.y + 0.06, z=O.z + 0.44, wt=0.045, ht=0.05, hb=0.035, n=2.6),
                               dict(x=O.x, y=O.y - 0.04, z=O.z + 0.46, wt=0.05, ht=0.045, hb=0.035, n=2.8),
                               dict(x=O.x, y=O.y - 0.16, z=O.z + 0.47, wt=0.048, ht=0.035, hb=0.03, n=2.8),
                               dict(x=O.x, y=O.y - 0.21, z=O.z + 0.47, wt=0.038, ht=0.02, hb=0.025, n=2.4)], mat('shoes'), N=16)
        sole = loft_y('sole', [dict(x=O.x, y=O.y + 0.065, z=O.z + 0.485, wt=0.047, ht=0.008, n=3), dict(x=O.x, y=O.y - 0.215, z=O.z + 0.495, wt=0.04, ht=0.008, n=3)],
                      mat('sole'), N=12, subsurf=1)
        objs.append(join('shin_' + side, [sh, shoe, sole], origin=O))

    lens = {'pelvis': 0.12, 'torso': 0.46, 'head': 0.3, 'uarm_L': 0.29, 'uarm_R': 0.29, 'farm_L': 0.27, 'farm_R': 0.27,
            'thigh_L': 0.44, 'thigh_R': 0.44, 'shin_L': 0.44, 'shin_R': 0.44}
    for o in objs:
        o['len'] = lens.get(o.name, 0.3)
    print('[rider]', tri_count(), 'tris')
    export_glb(out)


if __name__ == '__main__':
    out = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'models', 'raw', 'rider.glb')
    build(out)

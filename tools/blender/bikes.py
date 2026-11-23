"""Gerador paramétrico de motos (Blender/bpy).

Cada moto é montada a partir das medidas reais (entre-eixos, cáster, aro e
medida dos pneus, altura do banco) e de um "estilo" (street, trail, adventure,
naked, esportiva). Exporta um GLB com a hierarquia:

  bike (raiz, extras com dados físicos)
   ├─ body            (quadro, motor, tanque, carenagem, banco, rabeta...)
   ├─ steer           (mesa, bengalas superiores, guidão; gira no eixo de direção)
   │   ├─ fork_lower  (parte móvel da suspensão dianteira)
   │   │   └─ wheel_front
   │   ├─ grip_L / grip_R (alvos de IK das mãos)
   ├─ swingarm        (balança; gira no pivô)
   │   └─ wheel_rear
   └─ seat, peg_L, peg_R (alvos do piloto)

Eixos Blender: X = direita, Y = frente, Z = cima. Origem = contato do pneu traseiro.
"""
import math
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
from lib import *  # noqa
from mathutils import Vector

IN = 0.0254


def tire_r(t):
    return t['rim'] * IN / 2 + t['w'] * t['ar']


# ---------------------------------------------------------------------------
# Especificações reais (medidas de fábrica aproximadas)
# ---------------------------------------------------------------------------
BIKES = {
    'cg160': dict(
        name='Honda CG 160 Titan', style='commuter', engine='single_air', WB=1.311, rake=27.0, fork_len=0.70,
        front=dict(rim=18, w=0.080, ar=1.00), rear=dict(rim=18, w=0.090, ar=0.90),
        seat_h=0.787, seat_y=0.40, tail_len=0.30, tail_h=0.80, gc=0.165, pivot_h=0.40,
        wheels='cast5', tire='street', fork='conv', discs=1, disc_r=0.120, rdisc_r=0.110,
        exhaust='commuter', shocks='twin',
        colors=dict(main=(0.55, 0.015, 0.02), second=(0.02, 0.02, 0.022), accent=(0.70, 0.70, 0.72),
                    frame=(0.02, 0.02, 0.02), wheel=(0.03, 0.03, 0.03), fork_upper=(0.85, 0.85, 0.86),
                    fork_lower=(0.55, 0.56, 0.58), caliper=(0.05, 0.05, 0.05), engine=(0.08, 0.08, 0.085),
                    cover=(0.55, 0.56, 0.57)),
        exhaust_mat='chrome', livery='commuter'),
    'bros160': dict(
        name='Honda NXR 160 Bros', style='trail', engine='single_air', WB=1.356, rake=27.5, fork_len=0.84,
        front=dict(rim=19, w=0.090, ar=0.90), rear=dict(rim=17, w=0.110, ar=0.90),
        seat_h=0.836, seat_y=0.40, tail_len=0.36, tail_h=0.90, gc=0.245, pivot_h=0.42,
        wheels='wire', tire='knobby', fork='conv_gaiter', discs=1, disc_r=0.120, rdisc_r=0.110,
        exhaust='upswept', shocks='mono',
        colors=dict(main=(0.62, 0.02, 0.03), second=(0.85, 0.85, 0.86), accent=(0.02, 0.02, 0.025),
                    frame=(0.02, 0.02, 0.02), wheel=(0.04, 0.04, 0.04), fork_upper=(0.85, 0.85, 0.86),
                    fork_lower=(0.05, 0.05, 0.05), caliper=(0.05, 0.05, 0.05), engine=(0.07, 0.07, 0.075),
                    cover=(0.5, 0.5, 0.52)),
        exhaust_mat='black_pipe', livery='trail'),
    'xre300': dict(
        name='Honda XRE 300', style='trail', engine='single_liquid', WB=1.417, rake=27.0, fork_len=0.90,
        front=dict(rim=21, w=0.090, ar=0.90), rear=dict(rim=18, w=0.120, ar=0.80),
        seat_h=0.860, seat_y=0.42, tail_len=0.40, tail_h=0.95, gc=0.259, pivot_h=0.44,
        wheels='wire', tire='knobby', fork='conv_gaiter', discs=1, disc_r=0.128, rdisc_r=0.110,
        exhaust='upswept', shocks='mono',
        colors=dict(main=(0.85, 0.86, 0.87), second=(0.65, 0.02, 0.03), accent=(0.03, 0.10, 0.45),
                    frame=(0.65, 0.02, 0.03), wheel=(0.04, 0.04, 0.04), fork_upper=(0.80, 0.62, 0.20),
                    fork_lower=(0.05, 0.05, 0.05), caliper=(0.05, 0.05, 0.05), engine=(0.06, 0.06, 0.065),
                    cover=(0.45, 0.45, 0.47)),
        exhaust_mat='black_pipe', livery='rally'),
    'g310gs': dict(
        name='BMW G 310 GS', style='adventure', engine='single_rev', WB=1.420, rake=26.5, fork_len=0.82,
        front=dict(rim=19, w=0.110, ar=0.80), rear=dict(rim=17, w=0.150, ar=0.70),
        seat_h=0.835, seat_y=0.42, tail_len=0.42, tail_h=0.93, gc=0.220, pivot_h=0.44,
        wheels='cast10', tire='dual', fork='usd', discs=1, disc_r=0.150, rdisc_r=0.120,
        exhaust='adv', shocks='mono',
        colors=dict(main=(0.88, 0.89, 0.90), second=(0.02, 0.18, 0.55), accent=(0.70, 0.03, 0.05),
                    frame=(0.30, 0.31, 0.33), wheel=(0.05, 0.05, 0.055), fork_upper=(0.80, 0.55, 0.15),
                    fork_lower=(0.05, 0.05, 0.05), caliper=(0.05, 0.05, 0.05), engine=(0.05, 0.05, 0.055),
                    cover=(0.40, 0.41, 0.43)),
        exhaust_mat='steel', livery='rally'),
    'xj6': dict(
        name='Yamaha XJ6 N', style='naked', engine='inline4', WB=1.440, rake=25.0, fork_len=0.72,
        front=dict(rim=17, w=0.120, ar=0.70), rear=dict(rim=17, w=0.160, ar=0.60),
        seat_h=0.785, seat_y=0.43, tail_len=0.33, tail_h=0.86, gc=0.140, pivot_h=0.43,
        wheels='sport', tire='sport', fork='conv', discs=2, disc_r=0.149, rdisc_r=0.122,
        exhaust='underbelly', shocks='mono',
        colors=dict(main=(0.88, 0.88, 0.89), second=(0.03, 0.03, 0.035), accent=(0.60, 0.02, 0.03),
                    frame=(0.03, 0.03, 0.035), wheel=(0.03, 0.03, 0.035), fork_upper=(0.85, 0.85, 0.86),
                    fork_lower=(0.04, 0.04, 0.045), caliper=(0.70, 0.70, 0.72), engine=(0.05, 0.05, 0.055),
                    cover=(0.55, 0.56, 0.58)),
        exhaust_mat='steel', livery='naked'),
    'mt09': dict(
        name='Yamaha MT-09', style='naked', engine='triple', WB=1.430, rake=25.0, fork_len=0.74,
        front=dict(rim=17, w=0.120, ar=0.70), rear=dict(rim=17, w=0.180, ar=0.55),
        seat_h=0.825, seat_y=0.45, tail_len=0.26, tail_h=0.90, gc=0.140, pivot_h=0.45,
        wheels='y', tire='sport', fork='usd', discs=2, disc_r=0.149, rdisc_r=0.123,
        exhaust='underbelly', shocks='mono',
        colors=dict(main=(0.06, 0.16, 0.55), second=(0.03, 0.03, 0.035), accent=(0.0, 0.55, 0.85),
                    frame=(0.04, 0.04, 0.045), wheel=(0.03, 0.12, 0.50), fork_upper=(0.04, 0.04, 0.045),
                    fork_lower=(0.80, 0.55, 0.15), caliper=(0.04, 0.04, 0.045), engine=(0.04, 0.04, 0.045),
                    cover=(0.10, 0.10, 0.11)),
        exhaust_mat='black_pipe', livery='naked'),
    'zx10r': dict(
        name='Kawasaki Ninja ZX-10R', style='sport', engine='inline4', WB=1.450, rake=25.0, fork_len=0.72,
        front=dict(rim=17, w=0.120, ar=0.70), rear=dict(rim=17, w=0.190, ar=0.55),
        seat_h=0.835, seat_y=0.46, tail_len=0.24, tail_h=0.94, gc=0.135, pivot_h=0.47,
        wheels='sport', tire='sport', fork='usd', discs=2, disc_r=0.165, rdisc_r=0.110,
        exhaust='sport_side', shocks='mono',
        colors=dict(main=(0.25, 0.62, 0.03), second=(0.02, 0.02, 0.022), accent=(0.75, 0.75, 0.77),
                    frame=(0.03, 0.03, 0.035), wheel=(0.03, 0.03, 0.035), fork_upper=(0.03, 0.03, 0.035),
                    fork_lower=(0.80, 0.55, 0.15), caliper=(0.65, 0.66, 0.68), engine=(0.04, 0.04, 0.045),
                    cover=(0.10, 0.10, 0.11)),
        exhaust_mat='titanium', livery='zx'),
    's1000rr': dict(
        name='BMW S 1000 RR', style='sport', engine='inline4', WB=1.457, rake=23.6, fork_len=0.72,
        front=dict(rim=17, w=0.120, ar=0.70), rear=dict(rim=17, w=0.200, ar=0.55),
        seat_h=0.832, seat_y=0.46, tail_len=0.24, tail_h=0.95, gc=0.130, pivot_h=0.48,
        wheels='sport', tire='sport', fork='usd', discs=2, disc_r=0.160, rdisc_r=0.110,
        exhaust='sport_side', shocks='mono',
        colors=dict(main=(0.90, 0.91, 0.92), second=(0.0, 0.20, 0.62), accent=(0.75, 0.02, 0.04),
                    frame=(0.55, 0.56, 0.58), wheel=(0.03, 0.03, 0.035), fork_upper=(0.03, 0.03, 0.035),
                    fork_lower=(0.80, 0.55, 0.15), caliper=(0.03, 0.15, 0.55), engine=(0.04, 0.04, 0.045),
                    cover=(0.12, 0.12, 0.13)),
        exhaust_mat='titanium', livery='m'),
}


# ---------------------------------------------------------------------------
# Materiais
# ---------------------------------------------------------------------------

def make_materials(S):
    clear_mats()
    c = S['colors']
    mat('paint_main', c['main'], 0.25, 0.32, coat=1.0, coat_rough=0.04)
    mat('paint_second', c['second'], 0.2, 0.35, coat=1.0, coat_rough=0.05)
    mat('paint_accent', c['accent'], 0.25, 0.35, coat=1.0, coat_rough=0.05)
    mat('frame', c['frame'], 0.7 if sum(c['frame']) > 0.6 else 0.3, 0.38)
    mat('engine', c['engine'], 0.55, 0.55)
    mat('engine_cover', c['cover'], 0.85, 0.3)
    mat('chrome', (0.92, 0.92, 0.93), 1.0, 0.06)
    mat('steel', (0.62, 0.62, 0.64), 1.0, 0.28)
    mat('titanium', (0.55, 0.53, 0.52), 1.0, 0.24)
    mat('black_pipe', (0.04, 0.04, 0.045), 0.7, 0.45)
    mat('header', (0.42, 0.33, 0.28), 1.0, 0.35)
    mat('rim', c['wheel'], 0.6, 0.35, coat=0.6)
    mat('rubber', (0.025, 0.025, 0.027), 0.0, 0.88)
    mat('tire_wall', (0.035, 0.035, 0.037), 0.0, 0.75)
    mat('plastic', (0.03, 0.03, 0.032), 0.0, 0.62)
    mat('plastic_gloss', (0.015, 0.015, 0.017), 0.1, 0.18, coat=0.6)
    mat('seat', (0.025, 0.025, 0.027), 0.0, 0.78)
    mat('fork_upper', c['fork_upper'], 0.9, 0.18)
    mat('fork_lower', c['fork_lower'], 0.85, 0.22)
    mat('disc', (0.58, 0.58, 0.6), 1.0, 0.33)
    mat('caliper', c['caliper'], 0.6, 0.35)
    mat('chain', (0.12, 0.11, 0.10), 0.9, 0.5)
    mat('radiator', (0.05, 0.05, 0.055), 0.6, 0.6)
    mat('carbon', (0.02, 0.02, 0.025), 0.2, 0.25, coat=1.0)
    mat('lens', (0.9, 0.92, 0.95), 0.0, 0.03, alpha=0.35)
    mat('light_head', (0.95, 0.96, 1.0), 0.0, 0.2, emit=(1.0, 0.97, 0.92), emit_strength=3.0)
    mat('light_drl', (0.95, 0.96, 1.0), 0.0, 0.2, emit=(0.85, 0.92, 1.0), emit_strength=4.0)
    mat('light_tail', (0.6, 0.02, 0.02), 0.0, 0.2, emit=(1.0, 0.03, 0.02), emit_strength=2.0)
    mat('light_signal', (0.9, 0.45, 0.02), 0.0, 0.2, emit=(1.0, 0.45, 0.02), emit_strength=0.5)
    mat('windscreen', (0.12, 0.13, 0.15), 0.0, 0.05, alpha=0.45)
    mat('dash', (0.02, 0.03, 0.05), 0.0, 0.2, emit=(0.15, 0.55, 1.0), emit_strength=1.5)
    mat('plate', (0.95, 0.95, 0.95), 0.0, 0.5)
    mat('mirror', (0.9, 0.9, 0.92), 1.0, 0.02)
    mat('spring', c.get('spring', (0.75, 0.05, 0.05)) if S['style'] in ('sport',) else (0.06, 0.06, 0.065), 0.6, 0.35)
    mat('gold', (0.80, 0.55, 0.15), 1.0, 0.25)


# ---------------------------------------------------------------------------
# Geometria derivada
# ---------------------------------------------------------------------------

def geom(S):
    G = {}
    Rf, Rr = tire_r(S['front']), tire_r(S['rear'])
    G['Rf'], G['Rr'] = Rf, Rr
    G['rimf'], G['rimr'] = S['front']['rim'] * IN / 2, S['rear']['rim'] * IN / 2
    G['wf'], G['wr'] = S['front']['w'], S['rear']['w']
    WB = S['WB']
    rake = math.radians(S['rake'])
    G['Ar'] = Vector((0, 0, Rr))
    G['Af'] = Vector((0, WB, Rf))
    d = Vector((0, -math.sin(rake), math.cos(rake)))
    G['d'] = d
    G['n'] = Vector((0, -math.cos(rake), -math.sin(rake)))  # perpendicular ao eixo, para trás
    G['T'] = G['Af'] + d * S['fork_len']
    G['B'] = G['Af'] + d * (S['fork_len'] - 0.16)
    G['H'] = G['Af'] + d * (S['fork_len'] - 0.08) + G['n'] * 0.03
    sw = S.get('sw', 0.57)
    ph = S['pivot_h']
    a = math.asin(max(-0.9, min(0.9, (ph - Rr) / sw)))
    G['P'] = Vector((0, sw * math.cos(a), ph))
    st = S['style']
    G['tank_top'] = S['seat_h'] + {'sport': 0.16, 'naked': 0.19, 'commuter': 0.17, 'trail': 0.14, 'adventure': 0.17}[st]
    G['seat'] = Vector((0, S['seat_y'], S['seat_h'] + 0.03))
    T = G['T']
    grips = {
        'sport': (0.31, T.y - 0.05, T.z - 0.05),
        'naked': (0.37, T.y - 0.11, T.z + 0.10),
        'commuter': (0.35, T.y - 0.14, T.z + 0.12),
        'trail': (0.40, T.y - 0.09, T.z + 0.13),
        'adventure': (0.40, T.y - 0.12, T.z + 0.13),
    }[st]
    G['grip'] = Vector(grips)
    pegs = {
        'sport': (0.18, S['seat_y'] + 0.06, 0.37),
        'naked': (0.17, S['seat_y'] + 0.12, 0.33),
        'commuter': (0.17, S['seat_y'] + 0.20, 0.30),
        'trail': (0.17, S['seat_y'] + 0.16, 0.38),
        'adventure': (0.17, S['seat_y'] + 0.16, 0.36),
    }[st]
    G['peg'] = Vector(pegs)
    G['gc'] = S['gc']
    G['eng_front'] = G['Af'].y - Rf - 0.045
    G['eng_back'] = G['P'].y - 0.02
    G['tail'] = Vector((0, -S['tail_len'], S['tail_h']))
    return G


# ---------------------------------------------------------------------------
# Rodas
# ---------------------------------------------------------------------------

def build_wheel(S, G, front):
    R = G['Rf'] if front else G['Rr']
    rim = G['rimf'] if front else G['rimr']
    w = G['wf'] if front else G['wr']
    c = G['Af'] if front else G['Ar']
    parts = []
    h = R - rim
    tire = S['tire']
    # pneu (perfil arredondado de moto)
    prof = [(rim + 0.004, -0.40 * w), (rim + 0.25 * h, -0.49 * w), (rim + 0.6 * h, -0.50 * w), (R - 0.28 * h, -0.45 * w),
            (R - 0.09 * h, -0.30 * w), (R - 0.015 * h, -0.12 * w), (R, 0.0), (R - 0.015 * h, 0.12 * w), (R - 0.09 * h, 0.30 * w),
            (R - 0.28 * h, 0.45 * w), (rim + 0.6 * h, 0.50 * w), (rim + 0.25 * h, 0.49 * w), (rim + 0.004, 0.40 * w)]
    mats_idx = [1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1]
    parts.append(lathe_x('tire', prof, [mat('rubber'), mat('tire_wall')], center=c, segs=64, sharp_angle=70, mats=mats_idx))
    if tire in ('knobby', 'dual'):
        n_k = 34 if tire == 'knobby' else 40
        kh = 0.012 if tire == 'knobby' else 0.007
        for i in range(n_k):
            a = 2 * math.pi * i / n_k
            for lane in ((-0.28, 0.32), (0.0, 0.0), (0.28, 0.32)) if i % 2 == 0 else ((-0.15, 0.1), (0.15, 0.1)):
                ax = lane[0] * w
                rr = R - lane[1] * 0.25 * h
                p = c + Vector((ax, rr * math.cos(a), rr * math.sin(a)))
                b = box('knob', (p.x, p.y, p.z), (0.022 if lane[0] == 0 else 0.018, 0.024, kh * 2), mat('rubber'))
                b.rotation_euler = (a - math.pi / 2, 0, 0)
                parts.append(b)
    # aro (canal em U, perfil fechado)
    rp = [(rim + 0.008, -0.44 * w), (rim - 0.006, -0.45 * w), (rim - 0.016, -0.36 * w), (rim - 0.022, -0.1 * w),
          (rim - 0.022, 0.1 * w), (rim - 0.016, 0.36 * w), (rim - 0.006, 0.45 * w), (rim + 0.008, 0.44 * w),
          (rim + 0.0, 0.40 * w), (rim - 0.008, 0.0), (rim + 0.0, -0.40 * w), (rim + 0.008, -0.44 * w)]
    parts.append(lathe_x('rim', rp, mat('rim'), center=c, segs=64, sharp_angle=40))
    # cubo
    hub_w = 0.16 if front else 0.18
    parts.append(lathe_x('hub', [(0.012, -hub_w / 2), (0.035, -hub_w / 2), (0.045, -hub_w * 0.35), (0.05, 0), (0.045, hub_w * 0.35),
                                 (0.035, hub_w / 2), (0.012, hub_w / 2)], mat('rim'), center=c, segs=24))
    parts.append(lathe_x('axle', [(0.0, -hub_w / 2 - 0.012), (0.012, -hub_w / 2 - 0.012), (0.012, hub_w / 2 + 0.012), (0.0, hub_w / 2 + 0.012)],
                         mat('steel'), center=c, segs=12))
    # raios
    style = S['wheels']
    r_in, r_out = 0.045, rim - 0.018

    def spoke(a, a2=None, wt0=0.013, wt1=0.009, th=0.011, off=0.0):
        a2 = a if a2 is None else a2
        p0 = c + Vector((off, r_in * math.cos(a), r_in * math.sin(a)))
        pm = c + Vector((off * 0.5, (r_in + r_out) / 2 * math.cos((a + a2) / 2), (r_in + r_out) / 2 * math.sin((a + a2) / 2)))
        p1 = c + Vector((0, r_out * math.cos(a2), r_out * math.sin(a2)))
        rings = [superellipse(wt0, wt0, th, th, 3.0, 8), superellipse((wt0 + wt1) / 2, (wt0 + wt1) / 2, th, th, 3.0, 8), superellipse(wt1, wt1, th * 0.9, th * 0.9, 3.0, 8)]
        return sweep('spoke', [p0, pm, p1], rings, mat('rim'), caps=True, subsurf=1, up=(1, 0, 0))

    if style == 'cast5':
        for k in range(5):
            a = 2 * math.pi * k / 5
            parts.append(spoke(a, a + 0.12, 0.016, 0.012, 0.012))
    elif style == 'cast10':
        for k in range(10):
            a = 2 * math.pi * k / 10
            parts.append(spoke(a, a + (0.14 if k % 2 else -0.14), 0.010, 0.008, 0.010))
    elif style == 'sport':
        for k in range(5):
            a = 2 * math.pi * k / 5
            parts.append(spoke(a - 0.05, a - 0.16, 0.010, 0.008, 0.012))
            parts.append(spoke(a + 0.05, a + 0.16, 0.010, 0.008, 0.012))
    elif style == 'y':
        for k in range(5):
            a = 2 * math.pi * k / 5
            parts.append(spoke(a, a, 0.014, 0.011, 0.012))
            # bifurcação
            pm = c + Vector((0, (r_in + r_out) * 0.55 * math.cos(a), (r_in + r_out) * 0.55 * math.sin(a)))
            for s in (-0.22, 0.22):
                p1 = c + Vector((0, r_out * math.cos(a + s), r_out * math.sin(a + s)))
                parts.append(sweep('yb', [pm, (pm + p1) / 2, p1], [superellipse(0.008, 0.008, 0.010, 0.010, 3.0, 8)], mat('rim'), subsurf=1, up=(1, 0, 0)))
    elif style == 'wire':
        n = 36
        for k in range(n):
            a = 2 * math.pi * k / n
            side = 1 if k % 2 else -1
            p0 = c + Vector((side * hub_w * 0.32, 0.042 * math.cos(a), 0.042 * math.sin(a)))
            a2 = a + side * 0.42
            p1 = c + Vector((side * 0.004, (rim - 0.012) * math.cos(a2), (rim - 0.012) * math.sin(a2)))
            parts.append(tube('wire', [p0, p1], 0.0022, mat('steel'), N=5))
    # discos
    disc_r = S['disc_r'] if front else S['rdisc_r']
    discs = S['discs'] if front else 1
    offs = [-0.072, 0.072] if discs == 2 else ([-0.06] if front else [0.07])
    for ox in offs:
        dc = c + Vector((ox, 0, 0))
        parts.append(lathe_x('disc', [(disc_r - 0.032, -0.0025), (disc_r, -0.0025), (disc_r, 0.0025), (disc_r - 0.032, 0.0025), (disc_r - 0.032, -0.0025)],
                             mat('disc'), center=dc, segs=48, sharp_angle=30))
        # furos (pontos escuros)
        for k in range(18):
            a = 2 * math.pi * k / 18
            for rr in (disc_r - 0.012, disc_r - 0.022):
                aa = a + (0.08 if rr < disc_r - 0.015 else 0)
                parts.append(cylinder('hole', dc + Vector((-0.003, rr * math.cos(aa), rr * math.sin(aa))), dc + Vector((0.003, rr * math.cos(aa), rr * math.sin(aa))),
                                      0.0028, mat('plastic'), segs=6))
        # flange interna (portador)
        car_r = disc_r - 0.03
        parts.append(lathe_x('carrier', [(0.03, -0.002), (car_r * 0.5, -0.002), (car_r, -0.0015), (car_r, 0.0015), (car_r * 0.5, 0.002), (0.03, 0.002)],
                             mat('rim'), center=dc + Vector((ox * 0.05, 0, 0)), segs=32))
    # coroa (traseira, lado esquerdo)
    if not front:
        sx = -(w / 2 + 0.03)
        teeth = 42
        r0, r1 = 0.095, 0.108
        pts = []
        for k in range(teeth * 2):
            a = math.pi * k / teeth
            r = r1 if k % 2 == 0 else r0
            pts.append((r * math.cos(a), r * math.sin(a)))
        verts, faces = [], []
        for (y, z) in pts:
            verts.append(c + Vector((sx - 0.003, y, z)))
        for (y, z) in pts:
            verts.append(c + Vector((sx + 0.003, y, z)))
        M = len(pts)
        for k in range(M):
            k2 = (k + 1) % M
            faces.append((k, k2, M + k2, M + k))
        verts.append(c + Vector((sx - 0.003, 0, 0)))
        verts.append(c + Vector((sx + 0.003, 0, 0)))
        for k in range(M):
            k2 = (k + 1) % M
            faces.append((2 * M, k2, k))
            faces.append((2 * M + 1, M + k, M + k2))
        parts.append(make_obj('sprocket', verts, faces, mat('steel'), smooth=False))
    return join('wheel_front' if front else 'wheel_rear', parts, origin=c)


# ---------------------------------------------------------------------------
# Suspensão dianteira e direção
# ---------------------------------------------------------------------------

def build_front(S, G):
    st = S['style']
    Af, T, B, d = G['Af'], G['T'], G['B'], G['d']
    wf = G['wf']
    fx = wf / 2 + (0.05 if S['discs'] == 2 else 0.045)
    steer, lower = [], []
    split = 0.42 if S['fork'] == 'usd' else 0.50  # fração do comprimento onde troca de diâmetro
    L = S['fork_len']
    for sx in (-fx, fx):
        top = T + Vector((sx, 0, 0.02))
        bot = Af + Vector((sx, 0, 0)) - d * 0.03
        mid = bot + d * (L * split)
        if S['fork'] == 'usd':
            steer.append(cylinder('fork_out', mid + d * 0.03, top, 0.029, mat('fork_upper'), segs=20))
            steer.append(cylinder('fork_cap', top, top + d * 0.025, 0.02, mat('gold' if st == 'sport' else 'steel'), segs=12))
            lower.append(cylinder('fork_in', bot + d * 0.06, mid + d * 0.04, 0.0235, mat('fork_lower'), segs=20))
            lower.append(cylinder('fork_seal', mid + d * 0.01, mid + d * 0.045, 0.026, mat('plastic'), segs=20))
            lower.append(box('axle_clamp', (bot.x, bot.y, bot.z + 0.02), (0.05, 0.065, 0.10), mat('fork_lower'), bevel=0.01))
        else:
            steer.append(cylinder('stanchion', mid - d * 0.02, top, 0.019, mat('fork_upper'), segs=16))
            lower.append(cylinder('slider', bot, mid, 0.026, mat('fork_lower'), segs=18))
            lower.append(cylinder('slider_top', mid - d * 0.01, mid + d * 0.015, 0.027, mat('plastic'), segs=18))
            if S['fork'] == 'conv_gaiter':
                prof = []
                n = 14
                for i in range(n + 1):
                    prof.append((0.024 + (0.008 if i % 2 else 0.0), 0.012 + i * (L * 0.36) / n))
                steer.append(lathe_axis('gaiter', [(0.019, 0.0)] + prof + [(0.019, prof[-1][1] + 0.01)], mat('rubber'), mid + d * 0.01, d, segs=18))
    # mesas (superior e inferior)
    for (p, h) in ((T, 0.022), (B, 0.03)):
        plate = loft_y('clamp', [
            dict(y=p.y + 0.035, z=p.z, wt=fx + 0.03, ht=h / 2, n=4),
            dict(y=p.y - 0.015, z=p.z, wt=fx + 0.035, ht=h / 2, n=4),
            dict(y=p.y - 0.06, z=p.z, wt=0.05, ht=h / 2, n=4)], mat('frame' if st == 'sport' else 'engine'), N=16, subsurf=1)
        steer.append(plate)
    steer.append(cylinder('stem_nut', T + Vector((0, -0.01, 0.01)), T + Vector((0, -0.01, 0.03)), 0.018, mat('steel'), segs=6))
    # pinças
    nd = 2 if S['discs'] == 2 else 1
    for k in range(nd):
        sx = (-1 if k == 0 else 1) * 0.072 if nd == 2 else -0.06
        cpos = Af + Vector((sx, 0, 0)) + Vector((0, -math.sin(math.radians(30)) * (S['disc_r'] - 0.015), math.cos(math.radians(30)) * (S['disc_r'] - 0.015)))
        cpos = Af + Vector((sx, -(S['disc_r'] - 0.016) * 0.55, (S['disc_r'] - 0.016) * 0.83))
        cb = box('caliper', (cpos.x + (0.012 if sx > 0 else -0.012), cpos.y, cpos.z), (0.045, 0.10, 0.055), mat('caliper'), bevel=0.012, segments=3)
        cb.rotation_euler = (math.radians(-35), 0, 0)
        lower.append(cb)
    # para-lama dianteiro
    Rf = G['Rf']
    if st in ('trail',):
        # para-lama alto preso na mesa inferior
        pts = []
        for i in range(9):
            a = math.radians(-35 + i * 14)
            pts.append(dict(y=B.y + 0.03 + math.sin(a) * 0.30, z=B.z - 0.07 + math.cos(a) * 0.05 - (0.06 if i in (0, 8) else 0), wt=0.075, ht=0.006, n=2.2))
        pts = [dict(y=B.y + 0.36, z=B.z - 0.06, wt=0.06, ht=0.006, n=2.2), dict(y=B.y + 0.22, z=B.z - 0.03, wt=0.08, ht=0.008),
               dict(y=B.y + 0.05, z=B.z - 0.045, wt=0.085, ht=0.01), dict(y=B.y - 0.12, z=B.z - 0.07, wt=0.08, ht=0.008),
               dict(y=B.y - 0.24, z=B.z - 0.13, wt=0.065, ht=0.006)]
        f = loft_y('fender', pts, mat('paint_second'), N=12, subsurf=2)
        steer.append(f)
    else:
        arc = []
        a0, a1 = (math.radians(-20), math.radians(120)) if st != 'adventure' else (math.radians(-10), math.radians(110))
        n = 10
        gap = 0.03 if st != 'adventure' else 0.06
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n
            r = Rf + gap
            arc.append(Af + Vector((0, math.cos(a) * r, math.sin(a) * r)))
        rings = [superellipse(0.006, 0.006, wf / 2 + 0.018, wf / 2 + 0.018, 3.5, 12)]
        fl = sweep('fender', arc, rings, mat('paint_main' if st in ('sport', 'commuter') else 'paint_second'), caps=True, subsurf=1, up=(1, 0, 0))
        lower.append(fl)
    # guidão
    grip = G['grip']
    if st == 'sport':
        for s in (-1, 1):
            g0 = Vector((s * (fx + 0.005), T.y - 0.01, T.z - 0.045))
            g1 = Vector((s * grip.x, grip.y, grip.z))
            steer.append(cylinder('clipon_clamp', g0 + Vector((0, 0, -0.025)), g0 + Vector((0, 0, 0.025)), 0.034, mat('frame'), segs=16))
            steer.append(tube('clipon', [g0, g1], 0.011, mat('engine'), N=10))
    else:
        clamp = Vector((0, T.y - 0.02, T.z + 0.05))
        steer.append(box('bar_clamp', tuple(clamp), (0.10, 0.04, 0.035), mat('engine'), bevel=0.008))
        steer.append(cylinder('riser', T, clamp, 0.015, mat('engine'), segs=10))
        pts = []
        for s in (-1, 1):
            pass
        bx = grip.x
        path = [Vector((-bx - 0.06, grip.y, grip.z)), Vector((-bx * 0.55, grip.y + 0.04, clamp.z + 0.02)), Vector((0, clamp.y, clamp.z)),
                Vector((bx * 0.55, grip.y + 0.04, clamp.z + 0.02)), Vector((bx + 0.06, grip.y, grip.z))]
        steer.append(tube('bar', path, 0.0111, mat('engine' if st != 'commuter' else 'chrome'), N=12))
    for s in (-1, 1):
        gp = Vector((s * grip.x, grip.y, grip.z))
        out = Vector((s, 0, 0))
        steer.append(cylinder('grip', gp - out * 0.065, gp + out * 0.065, 0.0165, mat('rubber'), segs=14))
        steer.append(cylinder('barend', gp + out * 0.065, gp + out * 0.08, 0.019, mat('steel'), segs=12))
        # punho de comandos
        steer.append(box('switch', tuple(gp - out * 0.095), (0.04, 0.05, 0.045), mat('plastic'), bevel=0.01))
        # manete
        lev = [gp - out * 0.1 + Vector((0, 0.03, 0.0)), gp + out * 0.01 + Vector((0, 0.075, -0.01)), gp + out * 0.06 + Vector((0, 0.07, -0.015))]
        steer.append(tube('lever', lev, 0.0055, mat('steel'), N=6))
        if s == 1:
            steer.append(cylinder('reservoir', gp - out * 0.13 + Vector((0, 0.02, 0.02)), gp - out * 0.13 + Vector((0, 0.02, 0.06)), 0.016, mat('plastic'), segs=12))
        if st in ('adventure', 'trail'):
            hg = [gp + out * 0.075 + Vector((0, 0.0, 0)), gp + out * 0.08 + Vector((0, 0.10, 0.01)), gp - out * 0.04 + Vector((0, 0.12, 0.0)), gp - out * 0.16 + Vector((0, 0.05, -0.01))]
            steer.append(sweep('handguard', hg, [superellipse(0.022, 0.022, 0.004, 0.004, 3, 8)], mat('plastic'), subsurf=1, up=(0, 0, 1)))
    # farol no guidão (naked / street / trail)
    if st == 'commuter':
        hc = T + Vector((0, 0.13, -0.08))
        steer.append(lathe_axis('head_shell', [(0.0, -0.09), (0.06, -0.085), (0.088, -0.04), (0.095, 0.0), (0.093, 0.012)], mat('paint_main'), hc, Vector((0, 1, -0.1)), segs=32))
        steer.append(lathe_axis('head_lens', [(0.0, 0.032), (0.05, 0.026), (0.088, 0.012)], mat('lens'), hc, Vector((0, 1, -0.1)), segs=32))
        steer.append(lathe_axis('head_lamp', [(0.0, 0.016), (0.035, 0.012), (0.075, 0.0)], mat('light_head'), hc, Vector((0, 1, -0.1)), segs=24))
        steer.append(lathe_axis('bezel', [(0.088, 0.016), (0.097, 0.01), (0.097, 0.0)], mat('chrome'), hc, Vector((0, 1, -0.1)), segs=32))
        # painel redondo
        dp = T + Vector((0, 0.04, 0.10))
        steer.append(lathe_axis('dash_shell', [(0.0, -0.03), (0.06, -0.025), (0.065, 0.0), (0.06, 0.01)], mat('plastic'), dp, Vector((0, -1, 0.9)), segs=24))
        steer.append(lathe_axis('dash_face', [(0.0, 0.006), (0.056, 0.008)], mat('dash'), dp, Vector((0, -1, 0.9)), segs=24))
        # piscas
        for s in (-1, 1):
            p0 = hc + Vector((s * 0.06, -0.05, 0.0))
            p1 = p0 + Vector((s * 0.11, 0.0, 0.0))
            steer.append(cylinder('sig_stalk', p0, p1, 0.006, mat('plastic'), segs=8))
            steer.append(box('signal', tuple(p1 + Vector((s * 0.01, 0.02, 0))), (0.03, 0.05, 0.03), mat('light_signal'), bevel=0.01))
    elif st == 'naked':
        hc = T + Vector((0, 0.12, -0.11))
        if S['engine'] == 'triple':
            # rosto compacto com dois faróis estreitos
            f = loft_y('head_face', [dict(y=hc.y + 0.07, z=hc.z, wt=0.07, ht=0.035, hb=0.06, n=3.5),
                                      dict(y=hc.y + 0.01, z=hc.z + 0.01, wt=0.12, ht=0.06, hb=0.09, n=3.5),
                                      dict(y=hc.y - 0.07, z=hc.z + 0.02, wt=0.10, ht=0.06, hb=0.07, n=3.5)], mat('plastic_gloss'), N=16)
            steer.append(f)
            for s in (-1, 1):
                b = box('drl', (s * 0.045, hc.y + 0.075, hc.z + 0.012), (0.05, 0.01, 0.012), mat('light_drl'), bevel=0.003)
                b.rotation_euler = (0, s * 0.35, 0)
                steer.append(b)
            steer.append(box('head_proj', (0, hc.y + 0.078, hc.z - 0.03), (0.06, 0.01, 0.025), mat('light_head'), bevel=0.004))
            steer.append(loft_y('flyscreen', [dict(y=hc.y + 0.03, z=hc.z + 0.07, wt=0.09, ht=0.004), dict(y=hc.y - 0.06, z=hc.z + 0.15, wt=0.07, ht=0.004)],
                                mat('windscreen'), N=10, subsurf=1))
        else:
            f = loft_y('head_face', [dict(y=hc.y + 0.08, z=hc.z, wt=0.085, ht=0.06, hb=0.07, n=3.0),
                                      dict(y=hc.y, z=hc.z + 0.01, wt=0.11, ht=0.09, hb=0.10, n=3.0),
                                      dict(y=hc.y - 0.08, z=hc.z + 0.02, wt=0.09, ht=0.08, hb=0.08, n=3.0)], mat('paint_main'), N=16)
            steer.append(f)
            steer.append(loft_y('head_lens', [dict(y=hc.y + 0.09, z=hc.z, wt=0.07, ht=0.05, hb=0.055, n=3.0), dict(y=hc.y + 0.075, z=hc.z, wt=0.078, ht=0.058, hb=0.062, n=3.0)],
                                mat('light_head'), N=16, subsurf=1))
        for s in (-1, 1):
            p0 = hc + Vector((s * 0.09, -0.02, 0.02))
            steer.append(box('signal', tuple(p0 + Vector((s * 0.04, 0, 0))), (0.05, 0.03, 0.02), mat('light_signal'), bevel=0.008))
        dp = T + Vector((0, 0.02, 0.09))
        steer.append(box('dash_body', tuple(dp), (0.16, 0.035, 0.09), mat('plastic'), bevel=0.012, rot=(math.radians(-55), 0, 0)))
        steer.append(box('dash_face', tuple(dp + Vector((0, -0.016, 0.012))), (0.13, 0.005, 0.06), mat('dash'), rot=(math.radians(-55), 0, 0)))
    elif st == 'trail':
        hc = T + Vector((0, 0.13, -0.10))
        cowl = loft_y('head_cowl', [dict(y=hc.y + 0.06, z=hc.z - 0.02, wt=0.09, ht=0.11, hb=0.10, n=3.0),
                                     dict(y=hc.y - 0.02, z=hc.z, wt=0.11, ht=0.14, hb=0.12, n=3.0),
                                     dict(y=hc.y - 0.09, z=hc.z + 0.01, wt=0.07, ht=0.10, hb=0.08, n=3.0)], mat('paint_second'), N=16)
        steer.append(cowl)
        steer.append(loft_y('head_lens', [dict(y=hc.y + 0.068, z=hc.z - 0.01, wt=0.055, ht=0.06, hb=0.05, n=2.6), dict(y=hc.y + 0.05, z=hc.z - 0.01, wt=0.06, ht=0.065, hb=0.055, n=2.6)],
                            mat('light_head'), N=16, subsurf=1))
        steer.append(loft_y('visor', [dict(y=hc.y + 0.02, z=hc.z + 0.12, wt=0.08, ht=0.004), dict(y=hc.y - 0.05, z=hc.z + 0.2, wt=0.065, ht=0.004)], mat('windscreen'), N=10, subsurf=1))
        dp = T + Vector((0, 0.04, 0.09))
        steer.append(box('dash_body', tuple(dp), (0.14, 0.04, 0.08), mat('plastic'), bevel=0.012, rot=(math.radians(-50), 0, 0)))
        steer.append(box('dash_face', tuple(dp + Vector((0, -0.02, 0.012))), (0.11, 0.005, 0.055), mat('dash'), rot=(math.radians(-50), 0, 0)))
        for s in (-1, 1):
            p0 = hc + Vector((s * 0.1, -0.04, 0.03))
            steer.append(box('signal', tuple(p0 + Vector((s * 0.04, 0, 0))), (0.05, 0.03, 0.02), mat('light_signal'), bevel=0.008))
    # retrovisores no guidão
    if st != 'sport' and st != 'adventure':
        for s in (-1, 1):
            base = Vector((s * (grip.x - 0.11), grip.y + 0.01, grip.z + 0.02))
            top = base + Vector((s * 0.08, -0.04, 0.16))
            steer.append(tube('mirror_stem', [base, base + Vector((s * 0.01, -0.015, 0.08)), top], 0.0055, mat('steel'), N=6))
            steer.append(loft_y('mirror_house', [dict(x=top.x + s * 0.03, y=top.y + 0.02, z=top.z + 0.02, wt=0.06, ht=0.035, n=2.6),
                                                 dict(x=top.x + s * 0.03, y=top.y - 0.01, z=top.z + 0.02, wt=0.065, ht=0.04, n=2.6)],
                                 mat('plastic'), N=12, subsurf=1))
            steer.append(loft_y('mirror_glass', [dict(x=top.x + s * 0.03, y=top.y - 0.012, z=top.z + 0.02, wt=0.058, ht=0.033, n=2.6),
                                                 dict(x=top.x + s * 0.03, y=top.y - 0.016, z=top.z + 0.02, wt=0.058, ht=0.033, n=2.6)],
                                 mat('mirror'), N=12, subsurf=1))
    st_obj = join('steer', steer, origin=G['B'])
    lw_obj = join('fork_lower', lower, origin=Af)
    return st_obj, lw_obj


# ---------------------------------------------------------------------------
# Quadro, motor, escapamento
# ---------------------------------------------------------------------------

def build_frame(S, G):
    st = S['style']
    H, P = G['H'], G['P']
    parts = []
    # caixa de direção
    parts.append(cylinder('headtube', H - G['d'] * 0.09, H + G['d'] * 0.09, 0.035, mat('frame'), segs=16))
    if st in ('sport', 'naked'):
        thick = 0.024 if st == 'sport' else 0.018
        for s in (-1, 1):
            path = [H + Vector((s * 0.03, -0.02, -0.01)), H + Vector((s * 0.13, -0.16, -0.06)),
                    Vector((s * 0.15, P.y + 0.22, P.z + 0.16)), Vector((s * 0.13, P.y + 0.04, P.z + 0.06)), Vector((s * 0.12, P.y, P.z - 0.10))]
            rings = [superellipse(thick, thick, 0.05 if st == 'sport' else 0.03, 0.05 if st == 'sport' else 0.03, 4.0, 12)]
            parts.append(sweep('spar', path, rings, mat('frame'), subsurf=2, up=(0, 0, 1)))
            if st == 'naked':
                # treliça
                parts.append(tube('truss', [H + Vector((s * 0.04, -0.06, -0.08)), Vector((s * 0.14, P.y + 0.25, P.z + 0.05))], 0.014, mat('frame'), N=10))
            # pivô
            parts.append(cylinder('pivot', Vector((s * 0.10, P.y, P.z)), Vector((s * 0.15, P.y, P.z)), 0.03, mat('frame'), segs=16))
        # subchassi (escondido pela rabeta nas esportivas)
        for s in (-1, 1) if st != 'sport' else ():
            parts.append(tube('subframe', [Vector((s * 0.12, P.y + 0.06, P.z + 0.16)), Vector((s * 0.10, P.y - 0.15, S['seat_h'] - 0.06)),
                                          Vector((s * 0.07, -S['tail_len'] * 0.4, S['tail_h'] - 0.10))], 0.012, mat('frame'), N=8))
    else:
        # quadro de aço tubular
        bb = [H + Vector((0, -0.03, 0.0)), H + Vector((0, -0.22, -0.08)), Vector((0, P.y + 0.18, G['tank_top'] - 0.22)), Vector((0, P.y + 0.04, P.z + 0.10))]
        parts.append(tube('backbone', bb, 0.024, mat('frame'), N=12))
        for s in (-1, 1):
            parts.append(tube('pivot_plate', [Vector((s * 0.11, P.y + 0.06, P.z + 0.12)), Vector((s * 0.11, P.y, P.z)), Vector((s * 0.11, P.y + 0.02, P.z - 0.12))], 0.016, mat('frame'), N=10))
            parts.append(cylinder('pivot', Vector((s * 0.09, P.y, P.z)), Vector((s * 0.13, P.y, P.z)), 0.022, mat('frame'), segs=12))
            parts.append(tube('subframe', [Vector((s * 0.10, P.y + 0.08, P.z + 0.13)), Vector((s * 0.10, P.y - 0.15, S['seat_h'] - 0.08)),
                                          Vector((s * 0.06, -S['tail_len'] * 0.45, S['tail_h'] - 0.12))], 0.012, mat('frame'), N=8))
            parts.append(tube('subframe2', [Vector((s * 0.11, P.y, P.z + 0.02)), Vector((s * 0.10, P.y - 0.25, S['seat_h'] - 0.08))], 0.011, mat('frame'), N=8))
        if st in ('trail', 'adventure'):
            dt = [H + Vector((0, -0.01, -0.07)), Vector((0, G['eng_front'] + 0.02, G['gc'] + 0.25)), Vector((0, G['eng_front'] - 0.02, G['gc'] + 0.02)),
                  Vector((0, P.y + 0.12, G['gc'] + 0.0)), Vector((0, P.y + 0.02, P.z - 0.12))]
            parts.append(tube('downtube', dt, 0.019, mat('frame'), N=10))
    return parts


def build_engine(S, G):
    eng = S['engine']
    st = S['style']
    P = G['P']
    gc = G['gc']
    parts = []
    ew = {'single_air': 0.26, 'single_liquid': 0.27, 'single_rev': 0.28, 'inline4': 0.44, 'triple': 0.38}[eng]
    y0, y1 = G['eng_front'], G['eng_back']
    yc = (y0 + y1) / 2 - 0.02
    top = G['tank_top'] - 0.24
    # cárter
    cz = gc + 0.13
    parts.append(box('crankcase', (0, yc - 0.03, cz), (ew, (y1 - y0) * 0.85, 0.22), mat('engine'), bevel=0.035, segments=3))
    parts.append(box('sump', (0, yc, gc + 0.03), (ew * 0.7, (y1 - y0) * 0.55, 0.08), mat('engine'), bevel=0.025, segments=3))
    # tampas laterais
    cxo = min(ew / 2 - 0.005, 0.17 if st == 'sport' else 0.25)
    parts.append(lathe_axis('clutch_cover', [(0.0, 0.0), (0.08, 0.0), (0.085, 0.012), (0.07, 0.022), (0.0, 0.024)], mat('engine_cover'),
                            Vector((cxo, yc - 0.03, cz + 0.02)), Vector((1, 0, 0)), segs=32))
    parts.append(lathe_axis('stator_cover', [(0.0, 0.0), (0.07, 0.0), (0.074, 0.012), (0.058, 0.02), (0.0, 0.022)], mat('engine_cover'),
                            Vector((-cxo, yc + 0.02, cz + 0.0)), Vector((-1, 0, 0)), segs=32))
    if eng in ('inline4', 'triple'):
        tilt = math.radians(32)
        ax = Vector((0, math.sin(tilt), math.cos(tilt)))
        base = Vector((0, yc + 0.07, cz + 0.08))
        cyl_h = max(0.16, (top - base.z) / math.cos(tilt) - 0.12)
        cb = box('cyl_block', tuple(base + ax * (cyl_h / 2)), (ew * 0.86, 0.17, cyl_h), mat('engine'), bevel=0.02)
        cb.rotation_euler = (-tilt, 0, 0)
        parts.append(cb)
        head_c = base + ax * (cyl_h + 0.05)
        hb = box('head', tuple(head_c), (ew * 0.84, 0.19, 0.09), mat('engine'), bevel=0.02)
        hb.rotation_euler = (-tilt, 0, 0)
        parts.append(hb)
        vc = box('valve_cover', tuple(head_c + ax * 0.06), (ew * 0.78, 0.17, 0.05), mat('engine_cover'), bevel=0.02, segments=3)
        vc.rotation_euler = (-tilt, 0, 0)
        parts.append(vc)
        # aletas finas para detalhe
        for k in range(5):
            fb = box('fin', tuple(base + ax * (0.03 + k * cyl_h / 5.2) + Vector((0, 0.0, 0))), (ew * 0.88, 0.175, 0.006), mat('engine'))
            fb.rotation_euler = (-tilt, 0, 0)
            parts.append(fb)
        ncyl = 4 if eng == 'inline4' else 3
        ports = [Vector(((i - (ncyl - 1) / 2) * ew * 0.21, 0, 0)) + head_c + Vector((0, 0.10, -0.06)) for i in range(ncyl)]
        G['ports'] = ports
    else:
        tilt = math.radians(14 if eng != 'single_rev' else -12)
        ax = Vector((0, math.sin(tilt), math.cos(tilt)))
        base = Vector((0, yc + (0.06 if eng != 'single_rev' else 0.0), cz + 0.08))
        cyl_h = max(0.13, (top - base.z) / math.cos(tilt) - 0.11)
        if eng == 'single_air':
            n = 8
            for k in range(n):
                fw = 0.20 - 0.01 * abs(k - n / 2) / n
                fb = box('fin', tuple(base + ax * (0.02 + k * cyl_h / n)), (fw, 0.16, 0.007), mat('engine_cover'), bevel=0.002)
                fb.rotation_euler = (-tilt, 0, 0)
                parts.append(fb)
            parts.append(cylinder('barrel', base, base + ax * cyl_h, 0.055, mat('engine'), segs=16))
        else:
            cb = box('cyl_block', tuple(base + ax * (cyl_h / 2)), (0.17, 0.15, cyl_h), mat('engine'), bevel=0.02)
            cb.rotation_euler = (-tilt, 0, 0)
            parts.append(cb)
        head_c = base + ax * (cyl_h + 0.045)
        hb = box('head', tuple(head_c), (0.20, 0.17, 0.08), mat('engine'), bevel=0.02)
        hb.rotation_euler = (-tilt, 0, 0)
        parts.append(hb)
        vc = box('valve_cover', tuple(head_c + ax * 0.055), (0.16, 0.13, 0.04), mat('engine_cover'), bevel=0.015, segments=3)
        vc.rotation_euler = (-tilt, 0, 0)
        parts.append(vc)
        # vela
        parts.append(cylinder('plug_cap', head_c + ax * 0.03 + Vector((0.09, 0, 0)), head_c + ax * 0.05 + Vector((0.14, 0, 0.02)), 0.012, mat('plastic'), segs=8))
        if eng == 'single_rev':
            G['ports'] = [head_c + Vector((0, -0.11, -0.02))]
        else:
            G['ports'] = [head_c + Vector((0, 0.10, -0.05))]
    # radiador
    if eng in ('single_liquid', 'single_rev', 'inline4', 'triple'):
        rz0, rz1 = cz + 0.06, G['tank_top'] - 0.12
        ry = y0 - 0.01
        rw = min(ew + 0.06, 0.38 if st == 'sport' else 0.44)
        rb = box('radiator', (0, ry, (rz0 + rz1) / 2), (rw, 0.04, rz1 - rz0), mat('radiator'), bevel=0.008)
        rb.rotation_euler = (math.radians(-12), 0, 0)
        parts.append(rb)
        # grade
        for k in range(9):
            gb = box('rad_fin', (0, ry + 0.022, rz0 + (rz1 - rz0) * (k + 0.5) / 9), (rw * 0.92, 0.004, 0.006), mat('engine'))
            gb.rotation_euler = (math.radians(-12), 0, 0)
            parts.append(gb)
    # carburador/airbox (volume escondido) e pinhão
    parts.append(lathe_axis('front_sprocket', [(0.0, 0.0), (0.042, 0.0), (0.042, 0.008), (0.0, 0.008)], mat('steel'),
                            Vector((-(G['wr'] / 2 + 0.034), P.y + 0.07, P.z - 0.02)), Vector((1, 0, 0)), segs=16))
    G['eng'] = dict(ew=ew, yc=yc, cz=cz)
    return parts


def build_exhaust(S, G):
    ex = S['exhaust']
    P = G['P']
    gc = G['gc']
    em = mat(S['exhaust_mat'])
    parts = []
    ports = G['ports']
    ey = G['eng_front']
    coll = Vector((0.04, G['eng']['yc'] - 0.02, gc - 0.005))
    if ex == 'adv':
        p0 = ports[0]
        path = [p0, p0 + Vector((0.03, -0.08, 0.0)), Vector((0.13, P.y + 0.02, P.z + 0.05)), Vector((0.16, P.y - 0.1, P.z + 0.06))]
        parts.append(tube('header', path, 0.019, mat('header'), N=12))
        can0, can1 = Vector((0.165, P.y - 0.08, P.z + 0.06)), Vector((0.175, 0.02, P.z + 0.16))
        parts.append(sweep('muffler', [can0, (can0 + can1) / 2, can1],
                           [superellipse(0.05, 0.05, 0.06, 0.06, 3.2, 16), superellipse(0.055, 0.055, 0.07, 0.07, 3.2, 16), superellipse(0.045, 0.045, 0.055, 0.055, 3.2, 16)],
                           em, subsurf=2, up=(0, 0, 1)))
        parts.append(cylinder('tip', can1, can1 + (can1 - can0).normalized() * 0.03, 0.025, mat('black_pipe'), segs=14))
        return parts
    # coletores descendo à frente do motor
    for i, p0 in enumerate(ports):
        down = Vector((p0.x, ey + 0.02, gc + 0.12))
        under = Vector((p0.x * 0.6 + 0.02, ey - 0.06, gc + 0.01))
        path = bezier(p0, p0 + Vector((0, 0.05, -0.05)), down, under, steps=10) + [coll + Vector((p0.x * 0.25, 0, 0))]
        parts.append(tube('header', path, 0.017, mat('header'), N=10))
    if ex == 'commuter':
        path = [coll, Vector((0.12, P.y + 0.08, gc + 0.05)), Vector((0.15, P.y - 0.02, 0.24))]
        parts.append(tube('link', path, 0.02, em, N=10))
        can0, can1 = Vector((0.155, P.y - 0.02, 0.245)), Vector((0.175, -0.20, 0.36))
        parts.append(sweep('muffler', [can0, can0 + (can1 - can0) * 0.15, can0 + (can1 - can0) * 0.8, can1],
                           [circle(0.03, 16), circle(0.05, 16), circle(0.05, 16), circle(0.035, 16)], em, subsurf=1, up=(0, 0, 1)))
        parts.append(sweep('heatshield', [can0 + (can1 - can0) * 0.2 + Vector((0.035, 0, 0.0)), can0 + (can1 - can0) * 0.6 + Vector((0.035, 0, 0))],
                           [superellipse(0.012, 0.012, 0.04, 0.04, 2.5, 10)], mat('black_pipe'), subsurf=1))
    elif ex == 'upswept':
        path = [coll, Vector((0.12, P.y + 0.12, gc + 0.04)), Vector((0.15, P.y + 0.02, P.z + 0.0)), Vector((0.16, P.y - 0.14, P.z + 0.12))]
        parts.append(tube('link', path, 0.019, em, N=10))
        can0, can1 = Vector((0.16, P.y - 0.12, P.z + 0.11)), Vector((0.15, -0.16, S['tail_h'] - 0.22))
        parts.append(sweep('muffler', [can0, (can0 * 0.6 + can1 * 0.4), can1],
                           [superellipse(0.042, 0.042, 0.05, 0.05, 2.6, 16), superellipse(0.048, 0.048, 0.058, 0.058, 2.6, 16), superellipse(0.04, 0.04, 0.045, 0.045, 2.6, 16)],
                           mat('black_pipe'), subsurf=2))
        parts.append(cylinder('tip', can1, can1 + (can1 - can0).normalized() * 0.025, 0.018, mat('steel'), segs=12))
    elif ex == 'underbelly':
        box_c = Vector((0.02, P.y + 0.12, gc + 0.02))
        parts.append(box('belly_can', tuple(box_c), (0.22, 0.20, 0.085), mat('black_pipe'), bevel=0.03, segments=3))
        out0 = box_c + Vector((0.12, -0.12, 0.02))
        out1 = out0 + Vector((0.04, -0.20, 0.06))
        parts.append(sweep('can', [out0, (out0 + out1) / 2, out1], [superellipse(0.045, 0.045, 0.04, 0.04, 3.5, 14)], em, subsurf=2))
        for k in (-1, 1):
            parts.append(cylinder('outlet', out1 + Vector((0, 0, k * 0.018)), out1 + Vector((0.005, -0.03, k * 0.018 + 0.005)), 0.014, mat('steel'), segs=10))
    elif ex == 'sport_side':
        path = [coll, Vector((0.10, P.y + 0.14, gc + 0.03)), Vector((0.15, P.y + 0.02, 0.26)), Vector((0.172, P.y - 0.11, 0.33))]
        parts.append(tube('link', path, 0.025, mat('titanium'), N=12))
        can0, can1 = Vector((0.175, P.y - 0.10, 0.33)), Vector((0.19, P.y - 0.40, 0.47))
        rings = [superellipse(0.036, 0.036, 0.045, 0.045, 4.5, 12), superellipse(0.042, 0.042, 0.052, 0.052, 4.5, 12), superellipse(0.036, 0.036, 0.046, 0.046, 4.5, 12)]
        parts.append(sweep('muffler', [can0, (can0 + can1) / 2, can1], rings, em, subsurf=2))
        parts.append(sweep('endcap', [can1, can1 + (can1 - can0).normalized() * 0.04], [superellipse(0.036, 0.036, 0.046, 0.046, 4.5, 12), superellipse(0.026, 0.026, 0.034, 0.034, 4.5, 12)],
                           mat('carbon'), subsurf=1))
        parts.append(cylinder('tip', can1 + (can1 - can0).normalized() * 0.03, can1 + (can1 - can0).normalized() * 0.055, 0.02, mat('titanium'), segs=12))
    return parts


# ---------------------------------------------------------------------------
# Balança, corrente, amortecedores
# ---------------------------------------------------------------------------

def build_swingarm(S, G):
    st = S['style']
    P, Ar = G['P'], G['Ar']
    wr = G['wr']
    parts = []
    xo = wr / 2 + 0.045
    for s in (-1, 1):
        p0 = Vector((s * 0.12, P.y, P.z))
        p1 = Vector((s * xo, Ar.y + 0.04, Ar.z))
        mid = (p0 + p1) / 2 + Vector((0, 0, 0.03 if st == 'sport' else 0.0))
        if st in ('sport', 'naked'):
            rings = [superellipse(0.025, 0.025, 0.05, 0.05, 4, 12), superellipse(0.022, 0.022, 0.045, 0.06, 4, 12), superellipse(0.018, 0.018, 0.028, 0.028, 4, 12)]
        else:
            rings = [superellipse(0.02, 0.02, 0.03, 0.03, 4, 12), superellipse(0.02, 0.02, 0.028, 0.028, 4, 12), superellipse(0.016, 0.016, 0.022, 0.022, 4, 12)]
        parts.append(sweep('arm', [p0, mid, p1], rings, mat('frame' if st == 'sport' else 'engine'), subsurf=2, up=(0, 0, 1)))
        parts.append(box('adjuster', (s * xo, Ar.y - 0.01, Ar.z), (0.03, 0.06, 0.035), mat('steel'), bevel=0.006))
    parts.append(cylinder('pivot_tube', Vector((-0.12, P.y, P.z)), Vector((0.12, P.y, P.z)), 0.022, mat('frame' if st == 'sport' else 'engine'), segs=14))
    parts.append(box('cross', (0, P.y - 0.12, P.z - 0.01), (2 * xo - 0.02, 0.05, 0.05), mat('frame' if st == 'sport' else 'engine'), bevel=0.012))
    # pinça traseira
    cp = Ar + Vector((0.07, 0.07, -0.06))
    parts.append(box('rcaliper', (cp.x + 0.012, cp.y, cp.z), (0.035, 0.07, 0.045), mat('caliper' if st == 'sport' else 'plastic'), bevel=0.01))
    # corrente
    sx = -(wr / 2 + 0.03)
    rs = 0.103
    fs_c = Vector((sx, P.y + 0.07, P.z - 0.02))
    rs_c = Vector((sx, Ar.y, Ar.z))
    fr = 0.044
    pts = []
    v = fs_c - rs_c
    ang = math.atan2(v.z, v.y)
    for i in range(24):
        a = ang + math.pi / 2 + math.pi * i / 23
        pts.append(rs_c + Vector((0, rs * math.cos(a), rs * math.sin(a))))
    for i in range(14):
        a = ang - math.pi / 2 + math.pi * i / 13
        pts.append(fs_c + Vector((0, fr * math.cos(a), fr * math.sin(a))))
    parts.append(sweep('chain', pts, [superellipse(0.007, 0.007, 0.004, 0.004, 4, 8)], mat('chain'), caps=False, subsurf=0, up=(1, 0, 0), closed_path=True))
    # protetor de corrente
    if st == 'commuter':
        cg = [rs_c + Vector((-0.012, 0.12, 0.11)), (rs_c + fs_c) / 2 + Vector((-0.012, 0, 0.07)), fs_c + Vector((-0.012, -0.02, 0.06))]
        parts.append(sweep('chainguard', cg, [superellipse(0.022, 0.022, 0.012, 0.012, 3, 10)], mat('chrome'), subsurf=2, up=(0, 0, 1)))
    else:
        cg = [rs_c + Vector((-0.01, 0.16, 0.12)), (rs_c + fs_c) / 2 + Vector((-0.01, 0.0, 0.07))]
        parts.append(sweep('chainguard', cg, [superellipse(0.02, 0.02, 0.01, 0.01, 3, 10)], mat('plastic'), subsurf=2, up=(0, 0, 1)))
    # paralama traseiro (hugger) para esportivas/naked
    if st in ('sport', 'naked', 'adventure'):
        arc = []
        for i in range(9):
            a = math.radians(40 + i * 10)
            r = G['Rr'] + 0.025
            arc.append(Ar + Vector((0, math.cos(a) * r, math.sin(a) * r)))
        parts.append(sweep('hugger', arc, [superellipse(0.005, 0.005, wr / 2 + 0.012, wr / 2 + 0.012, 3, 12)], mat('plastic_gloss'), subsurf=1, up=(1, 0, 0)))
    return join('swingarm', parts, origin=P)


def build_shocks(S, G):
    P, Ar = G['P'], G['Ar']
    parts = []
    if S['shocks'] == 'twin':
        for s in (-1, 1):
            x = s * (G['wr'] / 2 + 0.06)
            lo = Vector((x, Ar.y + 0.05, Ar.z + 0.03))
            hi = Vector((x, Ar.y + 0.17, S['seat_h'] - 0.07))
            parts.append(cylinder('shock_body', lo, lo + (hi - lo) * 0.45, 0.017, mat('chrome'), segs=12))
            parts.append(cylinder('shock_top', lo + (hi - lo) * 0.55, hi, 0.022, mat('engine'), segs=12))
            parts.append(helix('spring', lo + (hi - lo) * 0.12, lo + (hi - lo) * 0.85, 0.028, 0.0045, 8, mat('spring')))
    else:
        lo = Vector((0, P.y - 0.10, P.z + 0.02))
        hi = Vector((0, P.y + 0.02, S['seat_h'] - 0.17))
        parts.append(cylinder('shock_body', lo, hi, 0.022, mat('engine'), segs=12))
        parts.append(helix('spring', lo + (hi - lo) * 0.2, lo + (hi - lo) * 0.8, 0.034, 0.005, 6, mat('spring')))
        parts.append(cylinder('reservoir', hi + Vector((0.04, -0.02, -0.02)), hi + Vector((0.04, -0.12, -0.04)), 0.018, mat('gold' if S['style'] == 'sport' else 'engine'), segs=10))
    return parts


# ---------------------------------------------------------------------------
# Carroceria por estilo
# ---------------------------------------------------------------------------

def tank_sections(S, G, wmax=0.17, flat=False, n=2.6):
    yb = S['seat_y'] + 0.20
    yf = G['H'].y - 0.03
    tt = G['tank_top']
    L = yf - yb
    secs = []
    for i, (f, w, h, hb, dz) in enumerate([(0.0, 0.55, 0.45, 0.6, -0.06), (0.18, 0.85, 0.85, 0.8, -0.02), (0.45, 1.0, 1.0, 1.0, 0.0),
                                           (0.75, 0.95, 0.9, 0.95, -0.01), (1.0, 0.6, 0.55, 0.6, -0.05)]):
        secs.append(dict(y=yb + L * f, z=tt - 0.10 + dz, wt=wmax * w * (0.85 if flat else 0.9), wb=wmax * w, ht=0.10 * h, hb=0.12 * hb, n=n))
    return secs


def body_common_tail(S, G, style_mat='paint_main'):
    """Banco + rabeta + lanterna + placa."""
    parts = []
    sh = S['seat_h']
    sy = S['seat_y']
    tail = G['tail']
    st = S['style']
    # banco do piloto
    seat_front = sy + 0.22
    if st == 'sport':
        parts.append(loft_y('seat', [dict(y=seat_front, z=sh - 0.03, wt=0.09, ht=0.02, hb=0.03, n=3),
                                     dict(y=sy + 0.05, z=sh - 0.01, wt=0.13, ht=0.035, hb=0.04, n=3),
                                     dict(y=sy - 0.12, z=sh + 0.01, wt=0.12, ht=0.035, hb=0.04, n=3),
                                     dict(y=sy - 0.16, z=sh + 0.04, wt=0.10, ht=0.02, hb=0.04, n=3)], mat('seat'), N=16))
        # rabeta afilada
        tsec = [dict(y=sy + 0.02, z=sh - 0.07, wt=0.12, ht=0.045, hb=0.05, n=3),
                dict(y=sy - 0.16, z=sh - 0.015, wt=0.10, ht=0.05, hb=0.04, n=3),
                dict(y=0.04, z=tail.z - 0.035, wt=0.07, ht=0.04, hb=0.035, n=3),
                dict(y=tail.y + 0.06, z=tail.z - 0.005, wt=0.045, ht=0.025, hb=0.025, n=3),
                dict(y=tail.y, z=tail.z, wt=0.025, ht=0.014, hb=0.014, n=3)]
        parts.append(loft_y('tail', tsec, mat(style_mat), N=16))
        parts.append(box('tail_light', (0, tail.y + 0.02, tail.z - 0.025), (0.09, 0.03, 0.018), mat('light_tail'), bevel=0.006))
        # suporte de placa
        pl = Vector((0, tail.y + 0.06, S['tail_h'] - 0.28))
        parts.append(tube('plate_arm', [Vector((0, tail.y + 0.25, tail.z - 0.08)), Vector((0, tail.y + 0.12, tail.z - 0.18)), pl + Vector((0, 0.02, 0.08))], 0.012, mat('plastic'), N=8))
        parts.append(box('plate_back', (pl.x, pl.y + 0.005, pl.z), (0.215, 0.01, 0.145), mat('plastic'), bevel=0.004))
        parts.append(plate_quad('plate', (pl.x, pl.y - 0.001, pl.z), 0.20, 0.135, mat('plate'), tilt=math.radians(-8)))
        for s in (-1, 1):
            parts.append(box('rsignal', (s * 0.12, pl.y + 0.02, pl.z + 0.09), (0.035, 0.03, 0.018), mat('light_signal'), bevel=0.006))
    else:
        # banco longo
        sl = [dict(y=seat_front, z=sh - 0.02, wt=0.08 if st in ('trail',) else 0.10, ht=0.02, hb=0.03, n=3),
              dict(y=sy + 0.08, z=sh, wt=0.13 if st != 'trail' else 0.11, ht=0.04, hb=0.04, n=3),
              dict(y=sy - 0.15, z=sh + 0.02, wt=0.13 if st != 'trail' else 0.11, ht=0.04, hb=0.04, n=3),
              dict(y=sy - 0.40, z=sh + 0.04 + (0.03 if st == 'trail' else 0.0), wt=0.11, ht=0.035, hb=0.04, n=3),
              dict(y=tail.y + 0.22, z=tail.z - 0.03, wt=0.08, ht=0.02, hb=0.03, n=3)]
        if st == 'naked':
            sl = sl[:3] + [dict(y=sy - 0.32, z=sh + 0.06, wt=0.10, ht=0.035, hb=0.04, n=3), dict(y=tail.y + 0.18, z=tail.z - 0.02, wt=0.07, ht=0.02, hb=0.03, n=3)]
        parts.append(loft_y('seat', sl, mat('seat'), N=16))
        # rabeta/carenagem lateral traseira
        tsec = [dict(y=sy - 0.05, z=sh - 0.08, wt=0.12, ht=0.05, hb=0.06, n=2.8),
                dict(y=sy - 0.35, z=sh - 0.02, wt=0.11, ht=0.06, hb=0.05, n=2.8),
                dict(y=tail.y + 0.12, z=tail.z - 0.06, wt=0.08, ht=0.04, hb=0.04, n=2.8),
                dict(y=tail.y, z=tail.z - 0.07, wt=0.06, ht=0.025, hb=0.03, n=2.8)]
        parts.append(loft_y('tail', tsec, mat(style_mat if st != 'trail' else 'paint_second'), N=16))
        parts.append(box('tail_light', (0, tail.y - 0.005, tail.z - 0.07), (0.11 if st != 'naked' else 0.08, 0.03, 0.035), mat('light_tail'), bevel=0.01, segments=3))
        if st in ('commuter', 'trail', 'adventure'):
            # para-lama traseiro com placa
            fender = [dict(y=tail.y + 0.05, z=tail.z - 0.12, wt=0.06, ht=0.004), dict(y=tail.y - 0.08, z=tail.z - 0.20, wt=0.055, ht=0.004),
                      dict(y=tail.y - 0.10, z=tail.z - 0.32, wt=0.05, ht=0.004)]
            parts.append(loft_y('rfender', fender, mat('plastic'), N=10, subsurf=1))
            pl = Vector((0, tail.y - 0.105, tail.z - 0.26))
        else:
            pl = Vector((0, tail.y + 0.02, S['tail_h'] - 0.27))
            parts.append(tube('plate_arm', [Vector((0, tail.y + 0.2, tail.z - 0.1)), pl + Vector((0, 0.03, 0.08))], 0.012, mat('plastic'), N=8))
        parts.append(box('plate_back', (pl.x, pl.y + 0.006, pl.z), (0.215, 0.01, 0.145), mat('plastic'), bevel=0.004))
        parts.append(plate_quad('plate', (pl.x, pl.y - 0.001, pl.z), 0.20, 0.135, mat('plate'), tilt=math.radians(-5)))
        for s in (-1, 1):
            p0 = Vector((s * 0.05, tail.y + 0.04, tail.z - 0.1))
            p1 = p0 + Vector((s * 0.09, 0, 0))
            parts.append(cylinder('rsig_stalk', p0, p1, 0.006, mat('plastic'), segs=8))
            parts.append(box('rsignal', tuple(p1 + Vector((s * 0.012, 0, 0))), (0.03, 0.045, 0.028), mat('light_signal'), bevel=0.008))
        if st == 'commuter':
            # alça de garupa cromada
            for s in (-1, 1):
                gr = [Vector((s * 0.12, sy - 0.15, sh - 0.02)), Vector((s * 0.13, sy - 0.40, sh + 0.0)), Vector((s * 0.06, tail.y + 0.15, tail.z - 0.02))]
                parts.append(tube('grabrail', gr, 0.011, mat('chrome'), N=8))
    return parts


def build_body_sport(S, G):
    parts = []
    H, T = G['H'], G['T']
    Af = G['Af']
    nose_y = Af.y + 0.06
    top_z = T.z - 0.02
    # tanque
    parts.append(loft_y('tank', tank_sections(S, G, 0.18, n=3.4), mat('paint_main'), N=18))
    # bico (carenagem superior)
    nose = [dict(y=Af.y + 0.14, z=top_z - 0.17, wt=0.03, ht=0.012, hb=0.03, n=2.2),
            dict(y=Af.y + 0.07, z=top_z - 0.13, wt=0.11, ht=0.04, hb=0.06, n=2.6),
            dict(y=Af.y - 0.03, z=top_z - 0.10, wt=0.16, ht=0.065, hb=0.10, n=2.8),
            dict(y=Af.y - 0.13, z=top_z - 0.09, wt=0.19, ht=0.075, hb=0.13, n=3.0),
            dict(y=H.y + 0.03, z=top_z - 0.10, wt=0.20, ht=0.065, hb=0.12, n=3.2)]
    parts.append(loft_y('nose', nose, mat('paint_main'), N=20))
    # entrada de ar central
    parts.append(loft_y('ram_air', [dict(y=Af.y + 0.125, z=top_z - 0.185, wt=0.028, ht=0.016, n=3), dict(y=Af.y + 0.08, z=top_z - 0.19, wt=0.034, ht=0.02, n=3)],
                        mat('plastic'), N=12, subsurf=1))
    # faróis (LED, inclinados)
    for s in (-1, 1):
        hl = [dict(x=s * 0.055, y=Af.y + 0.112, z=top_z - 0.155, wt=0.032, ht=0.012, hb=0.016, n=2.4),
              dict(x=s * 0.075, y=Af.y + 0.075, z=top_z - 0.135, wt=0.042, ht=0.016, hb=0.02, n=2.4)]
        parts.append(loft_y('headlight', hl, mat('light_head'), N=14, subsurf=1))
        parts.append(box('drl', (s * 0.115, Af.y + 0.04, top_z - 0.115), (0.055, 0.02, 0.006), mat('light_drl'), bevel=0.002, rot=(0.3, 0, s * 0.55)))
    # para-brisa
    ws = [dict(y=Af.y + 0.03, z=top_z - 0.06, wt=0.12, ht=0.004, n=2.2), dict(y=Af.y - 0.10, z=top_z + 0.05, wt=0.12, ht=0.004, n=2.2),
          dict(y=H.y + 0.04, z=top_z + 0.11, wt=0.10, ht=0.004, n=2.2)]
    parts.append(loft_y('windscreen', ws, mat('windscreen'), N=12, subsurf=2))
    # painel TFT
    parts.append(box('dash_body', (0, H.y - 0.02, top_z + 0.04), (0.16, 0.04, 0.10), mat('plastic'), bevel=0.012, rot=(math.radians(-55), 0, 0)))
    parts.append(box('dash_face', (0, H.y - 0.04, top_z + 0.052), (0.13, 0.005, 0.07), mat('dash'), rot=(math.radians(-55), 0, 0)))
    # carenagens laterais: a borda dianteira contorna a roda, a traseira é inclinada
    Rf = G['Rf']
    ztop_f, ztop_r = top_z - 0.11, S['seat_h'] - 0.09
    zbot = G['gc'] + 0.13
    nose_join = Af.y - 0.06
    rows = []
    NU, NV = 10, 9
    for i in range(NU):
        u = i / (NU - 1)
        row = []
        for j in range(NV):
            v = j / (NV - 1)
            z = (ztop_f + (ztop_r - ztop_f) * u) * (1 - v) + zbot * v
            dz = z - Af.z
            rr = Rf + 0.07
            yf = Af.y - math.sqrt(max(0.0, rr * rr - dz * dz)) if dz < rr else nose_join
            yf = min(yf, nose_join)
            yr = (H.y - 0.42) * (1 - v) + (G['P'].y + 0.16) * v
            y = yf + (yr - yf) * u
            bul = math.sin(math.pi * (0.08 + 0.84 * v))
            x = 0.135 + 0.095 * bul * (1 - 0.35 * u) + 0.02 * (1 - u) * (1 - v)
            row.append((x, y, z))
        rows.append(row)
    side = grid_surface('fairing_side', rows, mat('paint_main'), thickness=0.005, subsurf=2, mirror=True)
    parts.append(side)
    # aberturas laterais (respiros)
    for s in (-1, 1):
        parts.append(loft_y('vent', [dict(x=s * 0.215, y=H.y - 0.15, z=top_z - 0.24, wt=0.012, ht=0.03, n=3), dict(x=s * 0.215, y=H.y - 0.33, z=top_z - 0.30, wt=0.012, ht=0.05, n=3)],
                            mat('plastic'), N=10, subsurf=1))
    # carenagem inferior (barriga)
    belly = [dict(y=G['eng_front'] + 0.02, z=G['gc'] + 0.12, wt=0.18, ht=0.06, hb=0.07, n=3),
             dict(y=G['eng_front'] - 0.20, z=G['gc'] + 0.08, wt=0.215, ht=0.08, hb=0.07, n=3.4),
             dict(y=G['P'].y + 0.06, z=G['gc'] + 0.10, wt=0.17, ht=0.06, hb=0.06, n=3)]
    parts.append(loft_y('belly', belly, mat('paint_second'), N=16))
    # retrovisores na carenagem
    for s in (-1, 1):
        base = Vector((s * 0.17, nose_y - 0.28, top_z + 0.02))
        tip = base + Vector((s * 0.09, -0.02, 0.03))
        parts.append(tube('mstem', [base, tip], 0.008, mat('plastic'), N=6))
        parts.append(loft_y('mirror_house', [dict(x=tip.x + s * 0.02, y=tip.y + 0.03, z=tip.z, wt=0.055, ht=0.03, n=2.5), dict(x=tip.x + s * 0.02, y=tip.y - 0.01, z=tip.z, wt=0.06, ht=0.034, n=2.5)],
                            mat('paint_main'), N=12, subsurf=1))
        parts.append(loft_y('mirror_glass', [dict(x=tip.x + s * 0.02, y=tip.y - 0.012, z=tip.z, wt=0.052, ht=0.028, n=2.5), dict(x=tip.x + s * 0.02, y=tip.y - 0.016, z=tip.z, wt=0.052, ht=0.028, n=2.5)],
                            mat('mirror'), N=12, subsurf=1))
        parts.append(box('fsignal', (tip.x + s * 0.02, tip.y + 0.035, tip.z - 0.005), (0.04, 0.01, 0.012), mat('light_signal'), bevel=0.003))
    parts += body_common_tail(S, G)
    return parts


def build_body_naked(S, G):
    parts = []
    H = G['H']
    parts.append(loft_y('tank', tank_sections(S, G, 0.19), mat('paint_main'), N=18))
    # abas do tanque / defletores do radiador
    rows = []
    tt = G['tank_top']
    ys = [H.y + 0.02, H.y - 0.10, H.y - 0.22, H.y - 0.34]
    for i, y in enumerate(ys):
        f = i / (len(ys) - 1)
        ztop = tt - 0.06 - f * 0.04
        zbot = tt - 0.34 + f * 0.14
        rows.append([(0.15 + 0.045 * math.sin(math.pi * g) + 0.025 * (1 - f), y, ztop + (zbot - ztop) * g) for g in (0, 0.25, 0.5, 0.75, 1.0)])
    parts.append(grid_surface('shroud', rows, mat('paint_main'), thickness=0.005, subsurf=2, mirror=True))
    parts += body_common_tail(S, G)
    # protetor do motor / spoiler
    parts.append(loft_y('belly', [dict(y=G['eng_front'] - 0.04, z=G['gc'] + 0.06, wt=0.10, ht=0.03, n=3),
                                  dict(y=G['P'].y + 0.2, z=G['gc'] + 0.04, wt=0.12, ht=0.03, n=3)], mat('plastic'), N=12, subsurf=1))
    return parts


def build_body_commuter(S, G):
    parts = []
    parts.append(loft_y('tank', tank_sections(S, G, 0.155), mat('paint_main'), N=18))
    # tampa do tanque
    tt = G['tank_top']
    yb = S['seat_y'] + 0.20
    yf = G['H'].y - 0.03
    cap_y = yb + (yf - yb) * 0.55
    parts.append(cylinder('fuel_cap', Vector((0, cap_y, tt - 0.005)), Vector((0, cap_y, tt + 0.012)), 0.035, mat('steel'), segs=16))
    # tampas laterais
    sy, sh = S['seat_y'], S['seat_h']
    for s in (-1, 1):
        rows = []
        for i, y in enumerate([sy + 0.14, sy + 0.02, sy - 0.12]):
            rows.append([(s * (0.11 + 0.025 * math.sin(math.pi * g)), y, sh - 0.06 - g * (0.20 - i * 0.04)) for g in (0, 0.33, 0.66, 1.0)])
        parts.append(grid_surface('sidecover', rows, mat('paint_main'), thickness=0.004, subsurf=2))
    parts += body_common_tail(S, G, 'paint_second')
    return parts


def build_body_trail(S, G):
    parts = []
    H = G['H']
    parts.append(loft_y('tank', tank_sections(S, G, 0.15, flat=True), mat('paint_main'), N=18))
    tt = G['tank_top']
    rows = []
    ys = [H.y + 0.04, H.y - 0.08, H.y - 0.20, H.y - 0.34, S['seat_y'] + 0.22]
    for i, y in enumerate(ys):
        f = i / (len(ys) - 1)
        ztop = tt - 0.05 - f * 0.05
        zbot = tt - 0.36 + f * 0.18
        rows.append([(0.15 + 0.07 * math.sin(math.pi * g) * (1 - f * 0.6), y, ztop + (zbot - ztop) * g) for g in (0, 0.25, 0.5, 0.75, 1.0)])
    parts.append(grid_surface('shroud', rows, mat('paint_second'), thickness=0.005, subsurf=2, mirror=True))
    sy, sh = S['seat_y'], S['seat_h']
    for s in (-1, 1):
        rows = []
        for i, y in enumerate([sy + 0.12, sy - 0.05, sy - 0.22]):
            rows.append([(s * (0.11 + 0.02 * math.sin(math.pi * g)), y, sh - 0.04 - g * (0.20 - i * 0.05)) for g in (0, 0.33, 0.66, 1.0)])
        parts.append(grid_surface('sidecover', rows, mat('paint_main'), thickness=0.004, subsurf=2))
    # protetor de cárter
    parts.append(loft_y('skidplate', [dict(y=G['eng_front'] + 0.03, z=G['gc'] + 0.08, wt=0.08, ht=0.008, n=3),
                                      dict(y=G['eng_front'] - 0.05, z=G['gc'] - 0.01, wt=0.10, ht=0.008, n=3),
                                      dict(y=G['P'].y + 0.12, z=G['gc'] - 0.015, wt=0.10, ht=0.008, n=3)], mat('plastic'), N=12, subsurf=1))
    parts += body_common_tail(S, G, 'paint_second')
    return parts


def build_body_adv(S, G):
    parts = []
    H, T, Af = G['H'], G['T'], G['Af']
    parts.append(loft_y('tank', tank_sections(S, G, 0.17), mat('paint_main'), N=18))
    tt = G['tank_top']
    # carenagem frontal fixa no quadro (farol + para-brisa)
    fy = H.y + 0.16
    fz = T.z - 0.05
    parts.append(loft_y('front_fairing', [dict(y=fy + 0.03, z=fz, wt=0.09, ht=0.09, hb=0.08, n=2.6), dict(y=fy - 0.06, z=fz + 0.01, wt=0.13, ht=0.12, hb=0.11, n=2.8),
                                          dict(y=H.y - 0.02, z=fz + 0.0, wt=0.12, ht=0.10, hb=0.09, n=3.0)], mat('paint_second'), N=18))
    parts.append(loft_y('headlight', [dict(y=fy + 0.045, z=fz - 0.01, wt=0.06, ht=0.045, hb=0.04, n=2.4), dict(y=fy + 0.025, z=fz - 0.01, wt=0.065, ht=0.05, hb=0.045, n=2.4)],
                        mat('light_head'), N=16, subsurf=1))
    parts.append(loft_y('windscreen', [dict(y=fy - 0.0, z=fz + 0.09, wt=0.10, ht=0.004), dict(y=fy - 0.08, z=fz + 0.28, wt=0.12, ht=0.004)], mat('windscreen'), N=12, subsurf=1))
    # bico
    parts.append(loft_y('beak', [dict(y=fy + 0.22, z=fz - 0.17, wt=0.03, ht=0.01, n=2.2), dict(y=fy + 0.12, z=fz - 0.10, wt=0.08, ht=0.02, n=2.4),
                                 dict(y=fy + 0.02, z=fz - 0.06, wt=0.09, ht=0.025, n=2.6)], mat('paint_main'), N=12, subsurf=2))
    parts.append(box('dash_body', (0, H.y + 0.03, fz + 0.06), (0.15, 0.035, 0.09), mat('plastic'), bevel=0.012, rot=(math.radians(-50), 0, 0)))
    parts.append(box('dash_face', (0, H.y + 0.012, fz + 0.07), (0.12, 0.005, 0.06), mat('dash'), rot=(math.radians(-50), 0, 0)))
    for s in (-1, 1):
        base = Vector((s * 0.12, fy - 0.08, fz + 0.06))
        top = base + Vector((s * 0.11, -0.04, 0.14))
        parts.append(tube('mirror_stem', [base, base + Vector((s * 0.04, 0, 0.1)), top], 0.0055, mat('steel'), N=6))
        parts.append(loft_y('mirror_house', [dict(x=top.x, y=top.y + 0.02, z=top.z + 0.02, wt=0.06, ht=0.035, n=2.6), dict(x=top.x, y=top.y - 0.01, z=top.z + 0.02, wt=0.065, ht=0.04, n=2.6)],
                            mat('plastic'), N=12, subsurf=1))
        parts.append(loft_y('mirror_glass', [dict(x=top.x, y=top.y - 0.012, z=top.z + 0.02, wt=0.058, ht=0.033, n=2.6), dict(x=top.x, y=top.y - 0.016, z=top.z + 0.02, wt=0.058, ht=0.033, n=2.6)],
                            mat('mirror'), N=12, subsurf=1))
        parts.append(box('signal', (s * 0.14, fy - 0.02, fz - 0.04), (0.05, 0.03, 0.02), mat('light_signal'), bevel=0.008))
    rows = []
    ys = [H.y + 0.06, H.y - 0.08, H.y - 0.22, H.y - 0.36]
    for i, y in enumerate(ys):
        f = i / (len(ys) - 1)
        ztop = tt - 0.04 - f * 0.05
        zbot = tt - 0.38 + f * 0.16
        rows.append([(0.16 + 0.07 * math.sin(math.pi * g) * (1 - f * 0.5), y, ztop + (zbot - ztop) * g) for g in (0, 0.25, 0.5, 0.75, 1.0)])
    parts.append(grid_surface('shroud', rows, mat('paint_main'), thickness=0.005, subsurf=2, mirror=True))
    parts.append(loft_y('skidplate', [dict(y=G['eng_front'] + 0.03, z=G['gc'] + 0.10, wt=0.10, ht=0.008, n=3),
                                      dict(y=G['eng_front'] - 0.05, z=G['gc'] - 0.01, wt=0.12, ht=0.008, n=3),
                                      dict(y=G['P'].y + 0.12, z=G['gc'] - 0.015, wt=0.11, ht=0.008, n=3)], mat('steel'), N=12, subsurf=1))
    parts += body_common_tail(S, G, 'paint_main')
    # bagageiro
    tail = G['tail']
    rack = [Vector((-0.10, S['seat_y'] - 0.30, S['seat_h'] + 0.06)), Vector((-0.10, tail.y + 0.02, tail.z + 0.01)), Vector((0.10, tail.y + 0.02, tail.z + 0.01)),
            Vector((0.10, S['seat_y'] - 0.30, S['seat_h'] + 0.06))]
    parts.append(tube('rack', rack, 0.009, mat('engine'), N=8))
    parts.append(box('rack_plate', (0, (S['seat_y'] - 0.30 + tail.y) / 2 + 0.02, (S['seat_h'] + tail.z) / 2 + 0.05), (0.18, 0.22, 0.008), mat('engine'), bevel=0.004))
    return parts


def build_controls(S, G):
    parts = []
    peg = G['peg']
    for s in (-1, 1):
        p = Vector((s * peg.x, peg.y, peg.z))
        parts.append(cylinder('peg', p - Vector((s * 0.02, 0, 0)), p + Vector((s * 0.07, 0, 0)), 0.012, mat('steel' if S['style'] != 'trail' else 'engine'), segs=10))
        if S['style'] in ('sport', 'naked'):
            parts.append(box('rearset', (s * (peg.x - 0.03), peg.y - 0.02, peg.z + 0.04), (0.012, 0.09, 0.14), mat('frame'), bevel=0.004, rot=(0.4, 0, 0)))
        else:
            parts.append(box('peg_mount', (s * (peg.x - 0.03), peg.y, peg.z + 0.02), (0.02, 0.05, 0.06), mat('frame'), bevel=0.004))
        # pedal de câmbio (esq) e freio (dir)
        lever = [p + Vector((-s * 0.01, 0.02, 0.0)), p + Vector((-s * 0.0, 0.15, 0.02)), p + Vector((s * 0.03, 0.18, 0.03))]
        parts.append(tube('pedal', lever, 0.006, mat('steel'), N=6))
    # descanso lateral
    P = G['P']
    k0 = Vector((-0.12, P.y + 0.10, G['gc'] + 0.02))
    parts.append(tube('kickstand', [k0, k0 + Vector((-0.02, -0.25, 0.04))], 0.011, mat('engine'), N=8))
    return parts


LIVERIES = {}


def livery(name):
    def deco(f):
        LIVERIES[name] = f
        return f
    return deco


def band_planes(k, values, y0=1.0):
    """Planos z - k*(y - y0) = c para cortar faixas diagonais."""
    return [((0, y0, c), (0, -k, 1)) for c in values]


@livery('m')
def _liv_m(S, G):
    k = 0.55
    lo = G['gc'] + 0.10

    def fn(c, n):
        u = c.z - (c.y - 1.0) * k
        if c.z < lo:
            return 'plastic_gloss'
        if 0.50 < u < 0.57:
            return 'paint_second'
        if 0.57 <= u < 0.61:
            return 'paint_accent'
        return 'paint_main'
    return fn, band_planes(k, [0.50, 0.57, 0.61]) + [((0, 0, lo), (0, 0, 1))]


@livery('zx')
def _liv_zx(S, G):
    k = 0.35
    lo = G['gc'] + 0.30

    def fn(c, n):
        if c.z < lo:
            return 'paint_second'
        u = c.z - (c.y - 1.0) * k
        if 0.66 < u < 0.68:
            return 'paint_accent'
        if u >= 0.68 and c.y > 1.05:
            return 'paint_second'
        return 'paint_main'
    return fn, band_planes(k, [0.66, 0.68]) + [((0, 0, lo), (0, 0, 1)), ((0, 1.05, 0), (0, 1, 0))]


@livery('rally')
def _liv_rally(S, G):
    k = -0.6

    def fn(c, n):
        u = c.z - (c.y - 1.0) * k
        if 0.70 < u < 0.76:
            return 'paint_second'
        if 0.76 <= u < 0.79:
            return 'paint_accent'
        return None
    return fn, band_planes(k, [0.70, 0.76, 0.79])


def build_bike(key, outdir):
    S = BIKES[key]
    reset_scene()
    make_materials(S)
    G = geom(S)
    wf = build_wheel(S, G, True)
    wr = build_wheel(S, G, False)
    steer, lower = build_front(S, G)
    body_parts = []
    body_parts += build_frame(S, G)
    body_parts += build_engine(S, G)
    body_parts += build_exhaust(S, G)
    body_parts += build_shocks(S, G)
    body_parts += build_controls(S, G)
    st = S['style']
    body_parts += {'sport': build_body_sport, 'naked': build_body_naked, 'commuter': build_body_commuter,
                   'trail': build_body_trail, 'adventure': build_body_adv}[st](S, G)
    # pintura (livery) em peças específicas
    liv = LIVERIES.get(S.get('livery'))
    if liv:
        fn, planes = liv(S, G)
        for ob in body_parts:
            if ob.name.split('.')[0] in ('fairing_side', 'nose', 'tail', 'shroud', 'front_fairing', 'sidecover', 'belly'):
                paint_faces(ob, fn, planes)
    body = join('body', body_parts, origin=(0, 0, 0))
    swing = build_swingarm(S, G)
    root = empty('bike', (0, 0, 0))
    set_parent(body, root)
    set_parent(steer, root)
    set_parent(lower, steer)
    set_parent(wf, lower)
    set_parent(swing, root)
    set_parent(wr, swing)
    grip = G['grip']
    for s, nm in ((-1, 'grip_L'), (1, 'grip_R')):
        empty(nm, (s * grip.x, grip.y, grip.z), steer)
    peg = G['peg']
    for s, nm in ((-1, 'peg_L'), (1, 'peg_R')):
        empty(nm, (s * (peg.x + 0.03), peg.y, peg.z + 0.015), root)
    empty('seat', tuple(G['seat']), root)
    empty('tail_tip', tuple(G['tail']), root)
    # extras para a física/IK no jogo
    root['spec_key'] = key
    root['wheelbase'] = S['WB']
    root['rake'] = S['rake']
    root['r_front'] = G['Rf']
    root['r_rear'] = G['Rr']
    root['seat_h'] = S['seat_h']
    root['swing_pivot'] = list(G['P'])
    root['style'] = st
    tris = tri_count()
    out = os.path.join(outdir, f'{key}.glb')
    export_glb(out)
    print(f'[bike] {key}: {tris} tris -> {out}')
    return tris


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'models', 'raw'))
    ap.add_argument('--only', default='')
    a, _ = ap.parse_known_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    os.makedirs(a.out, exist_ok=True)
    keys = [k for k in BIKES if not a.only or k in a.only.split(',')]
    for k in keys:
        build_bike(k, a.out)

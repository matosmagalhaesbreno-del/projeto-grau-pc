"""Biblioteca de modelagem procedural para o Blender (bpy).

Convenção de eixos (Blender): X = lateral (direita +), Y = frente, Z = cima.
Unidades em metros.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix

# ---------------------------------------------------------------------------
# Cena
# ---------------------------------------------------------------------------

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.objects, bpy.data.curves, bpy.data.images):
        for item in list(coll):
            coll.remove(item)


def V(*a):
    if len(a) == 1:
        return Vector(a[0])
    return Vector(a)


# ---------------------------------------------------------------------------
# Materiais
# ---------------------------------------------------------------------------
_MATS = {}


def mat(name, color=(0.8, 0.8, 0.8), metal=0.0, rough=0.5, emit=None, emit_strength=1.0,
        alpha=1.0, coat=0.0, coat_rough=0.05, transmission=0.0, ior=1.45, double=True):
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = None
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            bsdf = n
    if bsdf is None:
        bsdf = m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        out = [n for n in m.node_tree.nodes if n.type == 'OUTPUT_MATERIAL']
        if out:
            m.node_tree.links.new(bsdf.outputs[0], out[0].inputs[0])
    c = tuple(color) + (1.0,) if len(color) == 3 else tuple(color)
    bsdf.inputs['Base Color'].default_value = c
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = tuple(emit) + (1.0,)
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    if alpha < 1.0:
        bsdf.inputs['Alpha'].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
        try:
            m.blend_method = 'BLEND'
        except Exception:
            pass
    if coat > 0:
        bsdf.inputs['Coat Weight'].default_value = coat
        bsdf.inputs['Coat Roughness'].default_value = coat_rough
    if transmission > 0:
        bsdf.inputs['Transmission Weight'].default_value = transmission
        bsdf.inputs['IOR'].default_value = ior
    m.diffuse_color = c
    m.use_backface_culling = not double
    _MATS[name] = m
    return m


def clear_mats():
    _MATS.clear()


# ---------------------------------------------------------------------------
# Construção de malhas
# ---------------------------------------------------------------------------

def make_obj(name, verts, faces, material=None, smooth=True, sharp_angle=40, subsurf=0, mats_per_face=None, uvs=None, recalc=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate(clean_customdata=False)
    me.update()
    if recalc:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if material is not None:
        mlist = material if isinstance(material, (list, tuple)) else [material]
        for m in mlist:
            ob.data.materials.append(m if not isinstance(m, str) else _MATS[m])
    if mats_per_face is not None:
        for i, p in enumerate(me.polygons):
            p.material_index = mats_per_face[i]
    if uvs is not None:
        uvl = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                uvl.data[li].uv = uvs[vi]
    if smooth:
        me.shade_smooth()
        if sharp_angle is not None and sharp_angle < 180:
            try:
                me.set_sharp_from_angle(angle=math.radians(sharp_angle))
            except Exception:
                pass
    if subsurf:
        md = ob.modifiers.new('sub', 'SUBSURF')
        md.levels = subsurf
        md.render_levels = subsurf
    return ob


def superellipse(wt, wb, ht, hb, n=2.4, N=16, offset=(0.0, 0.0)):
    """Seção transversal (x,z) com largura/altura diferentes em cima e embaixo."""
    pts = []
    e = 2.0 / n
    for k in range(N):
        t = 2 * math.pi * k / N - math.pi / 2  # começa embaixo
        c, s = math.cos(t), math.sin(t)
        w = wb + (wt - wb) * (s + 1) / 2
        x = w * math.copysign(abs(c) ** e, c)
        z = (ht if s > 0 else hb) * math.copysign(abs(s) ** e, s)
        pts.append((x + offset[0], z + offset[1]))
    return pts


def circle(r, N=16):
    return [(r * math.cos(2 * math.pi * k / N), r * math.sin(2 * math.pi * k / N)) for k in range(N)]


def _frames(path, up_hint):
    up_hint = Vector(up_hint).normalized()
    frames = []
    n = len(path)
    for i in range(n):
        if i == 0:
            t = path[1] - path[0]
        elif i == n - 1:
            t = path[-1] - path[-2]
        else:
            t = (path[i + 1] - path[i]).normalized() + (path[i] - path[i - 1]).normalized()
        t = t.normalized()
        u0 = up_hint
        if abs(t.dot(u0)) > 0.98:
            u0 = Vector((0, 1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0))
        s = t.cross(u0).normalized()
        u = s.cross(t).normalized()
        frames.append((t, s, u))
    return frames


def sweep(name, path, rings, material, caps=True, subsurf=2, smooth=True, up=(0, 0, 1), sharp_angle=None, closed_path=False):
    """Varre seções `rings` (lista de listas (x,z)) ao longo de `path` (lista de pontos 3D).
    Cada ring precisa ter o mesmo número de pontos. x -> lateral do frame, z -> cima do frame."""
    path = [Vector(p) for p in path]
    if not isinstance(rings[0][0], (tuple, list)):
        raise ValueError('rings')
    if len(rings) == 1:
        rings = rings * len(path)
    frames = _frames(path, up)
    verts, faces = [], []
    N = len(rings[0])
    for i, p in enumerate(path):
        t, s, u = frames[i]
        for (x, z) in rings[i]:
            verts.append(p + s * x + u * z)
    m = len(path)
    seg = m if closed_path else m - 1
    for i in range(seg):
        a, b = i, (i + 1) % m
        for k in range(N):
            k2 = (k + 1) % N
            faces.append((a * N + k, a * N + k2, b * N + k2, b * N + k))
    if caps and not closed_path:
        faces.append(tuple(reversed(range(0, N))))
        faces.append(tuple(range((m - 1) * N, m * N)))
    return make_obj(name, verts, faces, material, smooth=smooth, subsurf=subsurf, sharp_angle=sharp_angle if sharp_angle else 180)


def grid_surface(name, grid, material, thickness=0.004, subsurf=2, mirror=False, smooth=True):
    """Superfície a partir de uma grade de pontos grid[i][j] (linhas x colunas)."""
    rows, cols = len(grid), len(grid[0])
    verts = [Vector(p) for row in grid for p in row]
    faces = []
    for i in range(rows - 1):
        for j in range(cols - 1):
            faces.append((i * cols + j, i * cols + j + 1, (i + 1) * cols + j + 1, (i + 1) * cols + j))
    ob = make_obj(name, verts, faces, material, smooth=smooth, sharp_angle=180)
    mods(ob, mirror=mirror, solidify=thickness, subsurf=subsurf)
    return ob


def mods(ob, mirror=False, solidify=0.0, subsurf=0, bevel=0.0, bevel_segments=2):
    if mirror:
        md = ob.modifiers.new('mirror', 'MIRROR')
        md.use_axis[0] = True
        md.use_mirror_merge = False
    if solidify:
        md = ob.modifiers.new('solid', 'SOLIDIFY')
        md.thickness = solidify
        md.offset = 0
    if bevel:
        md = ob.modifiers.new('bevel', 'BEVEL')
        md.width = bevel
        md.segments = bevel_segments
        md.limit_method = 'ANGLE'
    if subsurf:
        md = ob.modifiers.new('sub', 'SUBSURF')
        md.levels = subsurf
        md.render_levels = subsurf
    return ob


def paint_faces(ob, fn, planes=()):
    """Aplica modificadores, corta a malha nos planos dados (bordas nítidas de pintura) e
    define o material de cada face por fn(centro_mundo, normal) -> nome do material."""
    apply_all([ob])
    bpy.context.view_layer.update()
    if planes:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        inv = ob.matrix_world.inverted()
        for (co, no) in planes:
            co_l = inv @ Vector(co)
            no_l = (inv.to_3x3() @ Vector(no)).normalized()
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co_l, plane_no=no_l, dist=1e-5)
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    me = ob.data
    names = [m.name for m in me.materials]
    mw = ob.matrix_world
    for p in me.polygons:
        c = mw @ p.center
        n = (mw.to_3x3() @ p.normal).normalized()
        mname = fn(c, n)
        if mname is None:
            continue
        if mname not in names:
            me.materials.append(_MATS[mname])
            names.append(mname)
        p.material_index = names.index(mname)


def helix(name, p0, p1, r, wire, turns, material, segs_per_turn=14):
    """Mola helicoidal entre p0 e p1."""
    p0, p1 = Vector(p0), Vector(p1)
    axis = p1 - p0
    L = axis.length
    a = axis.normalized()
    ref = Vector((1, 0, 0)) if abs(a.x) < 0.9 else Vector((0, 1, 0))
    s1 = a.cross(ref).normalized()
    s2 = a.cross(s1).normalized()
    pts = []
    n = int(turns * segs_per_turn)
    for i in range(n + 1):
        t = i / n
        ang = 2 * math.pi * turns * t
        pts.append(p0 + a * (L * t) + (s1 * math.cos(ang) + s2 * math.sin(ang)) * r)
    return tube(name, pts, wire, material, N=6)


def loft_y(name, sections, material, N=16, n=2.4, subsurf=2, caps=True):
    """Loft ao longo do eixo Y. sections: lista de dicts {y, z, wt, wb, ht, hb, n?, x?}."""
    path, rings = [], []
    for s in sections:
        path.append((s.get('x', 0.0), s['y'], s['z']))
        rings.append(superellipse(s['wt'], s.get('wb', s['wt']), s['ht'], s.get('hb', s['ht']), s.get('n', n), N))
    return sweep(name, path, rings, material, caps=caps, subsurf=subsurf, up=(0, 0, 1))


def tube(name, pts, r, material, N=10, subsurf=0, caps=True, r_end=None, smooth=True):
    pts = [Vector(p) for p in pts]
    if r_end is None:
        rings = [circle(r, N)]
    else:
        rings = [circle(r + (r_end - r) * i / (len(pts) - 1), N) for i in range(len(pts))]
    return sweep(name, pts, rings, material, caps=caps, subsurf=subsurf, sharp_angle=None)


def bezier(p0, p1, p2, p3=None, steps=12):
    p0, p1, p2 = Vector(p0), Vector(p1), Vector(p2)
    out = []
    for i in range(steps + 1):
        t = i / steps
        if p3 is None:
            out.append((1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2)
        else:
            q = Vector(p3)
            out.append((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * q)
    return out


def lathe_x(name, profile, material, center=(0, 0, 0), segs=32, smooth=True, sharp_angle=50, mats=None):
    """Revolve perfil [(r, ax)] em torno do eixo X (eixo de roda). ax = deslocamento lateral."""
    c = Vector(center)
    verts, faces, mpf = [], [], []
    P = len(profile)
    for i in range(segs):
        a = 2 * math.pi * i / segs
        ca, sa = math.cos(a), math.sin(a)
        for (r, ax) in profile:
            verts.append(c + Vector((ax, r * ca, r * sa)))
    for i in range(segs):
        i2 = (i + 1) % segs
        for j in range(P - 1):
            faces.append((i * P + j, i2 * P + j, i2 * P + j + 1, i * P + j + 1))
            if mats is not None:
                mpf.append(mats[j])
    return make_obj(name, verts, faces, material, smooth=smooth, sharp_angle=sharp_angle, mats_per_face=mpf if mats is not None else None)


def lathe_axis(name, profile, material, center, axis, segs=24, sharp_angle=50):
    """Revolve perfil [(r, h)] em torno de um eixo arbitrário."""
    axis = Vector(axis).normalized()
    ref = Vector((1, 0, 0)) if abs(axis.x) < 0.9 else Vector((0, 1, 0))
    s1 = axis.cross(ref).normalized()
    s2 = axis.cross(s1).normalized()
    c = Vector(center)
    verts, faces = [], []
    P = len(profile)
    for i in range(segs):
        a = 2 * math.pi * i / segs
        d = s1 * math.cos(a) + s2 * math.sin(a)
        for (r, h) in profile:
            verts.append(c + axis * h + d * r)
    for i in range(segs):
        i2 = (i + 1) % segs
        for j in range(P - 1):
            faces.append((i * P + j, i * P + j + 1, i2 * P + j + 1, i2 * P + j))
    return make_obj(name, verts, faces, material, smooth=True, sharp_angle=sharp_angle)


def cylinder(name, p0, p1, r, material, segs=16, r1=None, caps=True):
    p0, p1 = Vector(p0), Vector(p1)
    axis = p1 - p0
    L = axis.length
    r1 = r if r1 is None else r1
    prof = [(0.0, 0.0), (r, 0.0), (r1, L), (0.0, L)] if caps else [(r, 0.0), (r1, L)]
    return lathe_axis(name, prof, material, p0, axis, segs=segs, sharp_angle=40)


def box(name, center, size, material, bevel=0.0, segments=2, rot=None, subsurf=0):
    cx, cy, cz = center
    sx, sy, sz = (size[0] / 2, size[1] / 2, size[2] / 2)
    verts = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
             (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    ob = make_obj(name, verts, faces, material, smooth=bevel > 0, sharp_angle=35, subsurf=subsurf)
    if bevel > 0:
        md = ob.modifiers.new('bevel', 'BEVEL')
        md.width = bevel
        md.segments = segments
        md.limit_method = 'ANGLE'
    if rot is not None:
        ob.rotation_euler = rot
    ob.location = (cx, cy, cz)
    return ob


def sphere(name, center, r, material, segs=16, rings=10, scale=(1, 1, 1)):
    verts, faces = [], []
    for i in range(rings + 1):
        th = math.pi * i / rings
        for j in range(segs):
            ph = 2 * math.pi * j / segs
            verts.append((r * math.sin(th) * math.cos(ph) * scale[0], r * math.sin(th) * math.sin(ph) * scale[1], r * math.cos(th) * scale[2]))
    for i in range(rings):
        for j in range(segs):
            j2 = (j + 1) % segs
            faces.append((i * segs + j, i * segs + j2, (i + 1) * segs + j2, (i + 1) * segs + j))
    ob = make_obj(name, verts, faces, material)
    ob.location = center
    return ob


def plate_quad(name, center, w, h, material, normal_axis='-y', tilt=0.0):
    """Quad com UV 0..1 (para textura de placa)."""
    hw, hh = w / 2, h / 2
    verts = [(-hw, 0, -hh), (hw, 0, -hh), (hw, 0, hh), (-hw, 0, hh)]
    uvs = [(1, 0), (0, 0), (0, 1), (1, 1)] if normal_axis == '-y' else [(0, 0), (1, 0), (1, 1), (0, 1)]
    faces = [(0, 3, 2, 1)] if normal_axis == '-y' else [(0, 1, 2, 3)]
    ob = make_obj(name, verts, faces, material, smooth=False, uvs=uvs)
    ob.rotation_euler = (tilt, 0, 0)
    ob.location = center
    return ob


def mirror_x(ob):
    md = ob.modifiers.new('mirror', 'MIRROR')
    md.use_axis[0] = True
    md.use_clip = False
    md.use_mirror_merge = False
    # mantém o espelho relativo à origem do mundo (x = 0)
    if abs(ob.location.x) > 1e-6:
        e = bpy.data.objects.new(ob.name + '_mirr', None)
        bpy.context.scene.collection.objects.link(e)
        md.mirror_object = e
    return ob


# ---------------------------------------------------------------------------
# Finalização: aplicar modificadores, juntar grupos, exportar
# ---------------------------------------------------------------------------

def apply_all(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in objs:
        if ob.type != 'MESH' or not ob.modifiers:
            continue
        ev = ob.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
        old = ob.data
        ob.modifiers.clear()
        ob.data = me
        if old.users == 0:
            bpy.data.meshes.remove(old)


def join(name, objs, origin=(0, 0, 0)):
    objs = [o for o in objs if o is not None and o.type == 'MESH']
    apply_all(objs)
    # coloca tudo em espaço do mundo
    for o in objs:
        o.data.transform(o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    off = Vector(origin)
    ob.data.transform(Matrix.Translation(-off))
    ob.location = off
    # remove empties auxiliares de espelho
    for e in [o for o in bpy.data.objects if o.type == 'EMPTY' and o.name.endswith('_mirr')]:
        bpy.data.objects.remove(e)
    return ob


def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    if parent is not None:
        set_parent(e, parent)
    return e


def set_parent(child, parent):
    """Parenteia preservando a transformação de mundo do filho."""
    bpy.context.view_layer.update()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


def export_glb(path, objs=None):
    bpy.ops.object.select_all(action='DESELECT')
    if objs:
        for o in objs:
            o.select_set(True)
    kw = dict(filepath=path, export_format='GLB', use_selection=bool(objs), export_apply=True,
              export_yup=True, export_extras=True, export_cameras=False, export_lights=False)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        kw.pop('export_lights', None)
        bpy.ops.export_scene.gltf(**kw)


def tri_count(objs=None):
    dg = bpy.context.evaluated_depsgraph_get()
    total = 0
    for o in (objs or bpy.data.objects):
        if o.type != 'MESH':
            continue
        me = o.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        total += len(me.loop_triangles)
        o.evaluated_get(dg).to_mesh_clear()
    return total


def extrude_profile(name, pts, half_w, material, taper=None, bevel=0.0, bevel_segments=3, face_mats=None):
    """Extruda um perfil lateral [(y, z)] entre x = -half_w e +half_w.
    taper(z) -> fator de escala em x (ex.: estreitar o teto). face_mats(normal) -> índice de material."""
    n = len(pts)
    verts = []
    for side in (-1, 1):
        for (y, z) in pts:
            k = taper(z) if taper else 1.0
            verts.append((side * half_w * k, y, z))
    faces = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    ob = make_obj(name, verts, faces, material, smooth=False, sharp_angle=None)
    if face_mats is not None:
        me = ob.data
        for p in me.polygons:
            p.material_index = face_mats(p.normal, p.center)
    if bevel:
        md = ob.modifiers.new('bevel', 'BEVEL')
        md.width = bevel
        md.segments = bevel_segments
        md.limit_method = 'ANGLE'
        md.angle_limit = math.radians(30)
        md.harden_normals = False
        ob.data.shade_smooth()
        try:
            ob.data.set_sharp_from_angle(angle=math.radians(50))
        except Exception:
            pass
    return ob

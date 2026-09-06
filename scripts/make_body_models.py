#!/usr/bin/env python3
"""
Generates the two body models used by the 3D body studio.

The figures are built here rather than sourced so that every mesh can be named
after a body-map region (head, chest, stomach, ...). The studio reads those names
to turn "you painted here" back into a mark the rest of the session already
understands. Building them also means each part gets a clean cylindrical UV
layout by construction, so nothing needs unwrapping at runtime.

    python3 scripts/make_body_models.py

Writes frontend/public/models/body-*.glb
"""
import json, math, struct, os

SEGS = 28  # points around each cross-section


def tube(sections, segs=SEGS, cap_top=True, cap_bottom=True):
    """Sweep an elliptical cross-section along a path.

    sections: [(y, radius_x, radius_z, centre_x, centre_z), ...] bottom to top.
    UVs are cylindrical: u around, v along. That keeps every part inside 0..1
    with a single seam, which the paint layer's dilation pass already handles.
    """
    verts, uvs, faces = [], [], []
    rings = len(sections)
    for i, (y, rx, rz, cx, cz) in enumerate(sections):
        v = i / (rings - 1)
        for j in range(segs + 1):           # +1 duplicates the seam column
            u = j / segs
            a = u * math.tau
            verts.append((cx + math.cos(a) * rx, y, cz + math.sin(a) * rz))
            uvs.append((u, v))
    stride = segs + 1
    for i in range(rings - 1):
        for j in range(segs):
            a = i * stride + j
            b = a + 1
            c = a + stride + 1
            d = a + stride
            faces += [(a, b, c), (a, c, d)]

    def cap(ring_index, y, cx, cz, flip):
        centre = len(verts)
        verts.append((cx, y, cz))
        uvs.append((0.5, 0.0 if flip else 1.0))
        base = ring_index * stride
        for j in range(segs):
            a, b = base + j, base + j + 1
            faces.append((centre, b, a) if flip else (centre, a, b))

    if cap_bottom:
        y, _, _, cx, cz = sections[0]
        cap(0, y, cx, cz, True)
    if cap_top:
        y, _, _, cx, cz = sections[-1]
        cap(rings - 1, y, cx, cz, False)
    return verts, uvs, faces


def normals_for(verts, faces):
    acc = [[0.0, 0.0, 0.0] for _ in verts]
    for a, b, c in faces:
        ax, ay, az = verts[a]; bx, by, bz = verts[b]; cx, cy, cz = verts[c]
        ux, uy, uz = bx - ax, by - ay, bz - az
        vx, vy, vz = cx - ax, cy - ay, cz - az
        nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
        for i in (a, b, c):
            acc[i][0] += nx; acc[i][1] += ny; acc[i][2] += nz
    out = []
    for nx, ny, nz in acc:
        ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
        out.append((nx / ln, ny / ln, nz / ln))
    return out


def mirrored(sections):
    return [(y, rx, rz, -cx, cz) for (y, rx, rz, cx, cz) in sections]


def build(shape):
    """shape: dict of proportion knobs. Returns [(region, name, mesh), ...]."""
    sh = shape
    parts = []

    def add(region, name, sections, **kw):
        v, uv, f = tube(sections, **kw)
        parts.append((region, name, (v, uv, f)))

    # head and neck
    add('head', 'head', [
        (1.518, 0.048, 0.052, 0, 0), (1.552, 0.078, 0.086, 0, 0.004),
        (1.600, 0.090, 0.098, 0, 0.006), (1.655, 0.088, 0.095, 0, 0.004),
        (1.705, 0.068, 0.073, 0, 0.001), (1.740, 0.028, 0.030, 0, -0.004)])
    add('throat', 'throat', [
        (1.435, 0.058, 0.056, 0, 0), (1.480, 0.052, 0.052, 0, 0.002),
        (1.525, 0.050, 0.050, 0, 0.004)])

    # Shoulders: a rounded deltoid over each arm socket. An earlier version swept
    # a single yoke sideways across the chest, which collapsed into flat flaps —
    # tube() always builds its rings in the XZ plane, so a sideways sweep just
    # stacks overlapping rings on top of each other.
    sw = sh['shoulder']
    deltoid = [
        (1.300, 0.052, 0.054, sw * 0.92, 0.002),
        (1.340, 0.064, 0.066, sw * 0.90, 0.004),
        (1.378, 0.062, 0.064, sw * 0.86, 0.004),
        (1.404, 0.044, 0.046, sw * 0.78, 0.002)]
    add('shoulders', 'shoulders_R', deltoid)
    add('shoulders', 'shoulders_L', mirrored(deltoid))

    # torso
    add('chest', 'chest', [
        (1.130, sh['waist'] * 1.02, sh['waist'] * 0.62, 0, 0),
        (1.200, sh['chest'] * 0.97, sh['chest'] * 0.60, 0, 0.004),
        (1.280, sh['chest'], sh['chest'] * 0.62, 0, 0.006),
        (1.360, sh['chest'] * 0.95, sh['chest'] * 0.58, 0, 0.004),
        (1.405, sh['chest'] * 0.74, sh['chest'] * 0.46, 0, 0)])
    add('stomach', 'stomach', [
        (0.955, sh['waist'] * 1.06, sh['waist'] * 0.66, 0, 0),
        (1.020, sh['waist'], sh['waist'] * 0.62, 0, 0.002),
        (1.085, sh['waist'] * 1.01, sh['waist'] * 0.62, 0, 0.002),
        (1.135, sh['waist'] * 1.03, sh['waist'] * 0.63, 0, 0)])
    add('hips', 'hips', [
        (0.790, sh['hip'] * 0.88, sh['hip'] * 0.60, 0, 0),
        (0.850, sh['hip'], sh['hip'] * 0.66, 0, 0.002),
        (0.920, sh['hip'] * 0.98, sh['hip'] * 0.64, 0, 0.002),
        (0.965, sh['hip'] * 0.90, sh['hip'] * 0.60, 0, 0)])

    # arms: shoulder to wrist, drifting outward as they fall
    arm = [
        (1.375, 0.046, 0.047, sh['shoulder'] * 0.80, 0.002),
        (1.320, 0.051, 0.052, sh['shoulder'] * 0.90, 0.002),
        (1.240, 0.048, 0.048, sh['shoulder'] * 1.02, 0.002),
        (1.110, 0.041, 0.041, sh['shoulder'] * 1.08, 0),
        (0.985, 0.037, 0.037, sh['shoulder'] * 1.14, 0),
        (0.880, 0.032, 0.032, sh['shoulder'] * 1.19, 0)]
    hand = [
        (0.870, 0.033, 0.026, sh['shoulder'] * 1.19, 0),
        (0.815, 0.038, 0.026, sh['shoulder'] * 1.21, 0),
        (0.755, 0.030, 0.021, sh['shoulder'] * 1.22, 0)]
    add('arms', 'arms_R', arm)
    add('arms', 'arms_L', mirrored(arm))
    add('hands', 'hands_R', hand)
    add('hands', 'hands_L', mirrored(hand))

    # legs: hip to ankle
    leg = [
        (0.800, sh['thigh'], sh['thigh'] * 0.95, sh['stance'], 0),
        (0.640, sh['thigh'] * 0.86, sh['thigh'] * 0.84, sh['stance'] * 1.02, 0),
        (0.470, sh['thigh'] * 0.62, sh['thigh'] * 0.62, sh['stance'] * 1.02, 0.004),
        (0.300, sh['thigh'] * 0.56, sh['thigh'] * 0.56, sh['stance'] * 1.00, 0.002),
        (0.150, sh['thigh'] * 0.40, sh['thigh'] * 0.40, sh['stance'] * 0.98, 0),
        (0.070, sh['thigh'] * 0.34, sh['thigh'] * 0.34, sh['stance'] * 0.96, 0)]
    foot = [
        (0.060, 0.035, 0.038, sh['stance'] * 0.96, 0.004),
        (0.030, 0.038, 0.058, sh['stance'] * 0.96, 0.022),
        (0.004, 0.036, 0.070, sh['stance'] * 0.96, 0.034)]
    add('legs', 'legs_R', leg)
    add('legs', 'legs_L', mirrored(leg))
    add('feet', 'feet_R', foot)
    add('feet', 'feet_L', mirrored(foot))
    return parts


MASCULINE = dict(shoulder=0.205, chest=0.150, waist=0.126, hip=0.148, thigh=0.078, stance=0.075)
FEMININE  = dict(shoulder=0.176, chest=0.132, waist=0.106, hip=0.152, thigh=0.075, stance=0.066)


def write_glb(parts, path):
    """Minimal glTF 2.0 binary writer — one primitive per named part."""
    bin_blob = bytearray()
    accessors, buffer_views, meshes, nodes = [], [], [], []

    def view(data, target):
        while len(bin_blob) % 4:
            bin_blob.append(0)
        offset = len(bin_blob)
        bin_blob.extend(data)
        buffer_views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(data), 'target': target})
        return len(buffer_views) - 1

    for region, name, (verts, uvs, faces) in parts:
        norms = normals_for(verts, faces)
        pos = b''.join(struct.pack('<3f', *v) for v in verts)
        nor = b''.join(struct.pack('<3f', *n) for n in norms)
        tex = b''.join(struct.pack('<2f', u, 1.0 - v) for (u, v) in uvs)
        idx = b''.join(struct.pack('<3I', *f) for f in faces)

        xs = [v[0] for v in verts]; ys = [v[1] for v in verts]; zs = [v[2] for v in verts]
        base = len(accessors)
        accessors.append({'bufferView': view(pos, 34962), 'componentType': 5126, 'count': len(verts),
                          'type': 'VEC3', 'min': [min(xs), min(ys), min(zs)], 'max': [max(xs), max(ys), max(zs)]})
        accessors.append({'bufferView': view(nor, 34962), 'componentType': 5126, 'count': len(verts), 'type': 'VEC3'})
        accessors.append({'bufferView': view(tex, 34962), 'componentType': 5126, 'count': len(uvs), 'type': 'VEC2'})
        accessors.append({'bufferView': view(idx, 34963), 'componentType': 5125, 'count': len(faces) * 3, 'type': 'SCALAR'})

        meshes.append({'name': name, 'primitives': [{
            'attributes': {'POSITION': base, 'NORMAL': base + 1, 'TEXCOORD_0': base + 2},
            'indices': base + 3, 'material': 0}]})
        # The region is carried on the node so the studio can map paint to a mark.
        nodes.append({'name': name, 'mesh': len(meshes) - 1, 'extras': {'region': region}})

    gltf = {
        'asset': {'version': '2.0', 'generator': 'soma make_body_models.py'},
        'scene': 0,
        'scenes': [{'nodes': list(range(len(nodes)))}],
        'nodes': nodes,
        'meshes': meshes,
        'accessors': accessors,
        'bufferViews': buffer_views,
        'buffers': [{'byteLength': len(bin_blob)}],
        'materials': [{
            'name': 'skin',
            'pbrMetallicRoughness': {'baseColorFactor': [0.898, 0.882, 0.859, 1.0],
                                     'metallicFactor': 0.0, 'roughnessFactor': 0.86},
            'doubleSided': False}],
    }

    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    while len(bin_blob) % 4:
        bin_blob.append(0)
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_blob))
    glb += struct.pack('<II', len(js), 0x4E4F534A) + js
    glb += struct.pack('<II', len(bin_blob), 0x004E4942) + bytes(bin_blob)
    with open(path, 'wb') as f:
        f.write(glb)
    return len(glb), sum(len(p[2][2]) for p in parts), len(parts)


if __name__ == '__main__':
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend', 'public', 'models')
    os.makedirs(out, exist_ok=True)
    for label, shape in (('masculine', MASCULINE), ('feminine', FEMININE)):
        path = os.path.join(out, f'body-{label}.glb')
        size, tris, n = write_glb(build(shape), path)
        print(f'body-{label}.glb  {size/1024:.0f} KB  {n} parts  {tris} triangles')

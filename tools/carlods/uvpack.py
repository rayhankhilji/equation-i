# Livery atlas repack for the GLB car (LIVERY-POLISH, wave 9).
# The painted parts' UV islands are re-laid out so the bodywork gets texels where the camera sees it: every island is
# un-squashed (per-island affine: the inverse square root of its mean UV->metre metric, so a texel is square on the car),
# rotated to its tightest box, scaled by its part's weight and packed by shape (FFT overlap test) into the full square.
# Vertex count, positions and indices are untouched (ei-car-lohi.bin / ei-car-lods.bin stay valid: they check positions only).
# The ID atlas becomes a ROLE atlas (R = role index * 16 + 8, meta.roleAtlas = 1, roles dilated into the gutters) and the AO
# atlas is resampled to the new layout (also dilated), so mip levels never pull in the dark gutter.
# usage: UVK=49.8 python3 tools/carlods/uvpack.py <dir with the ORIGINAL ei-car-{hi,lo}.glb + ei-car-{id,ao}.png> <out dir>
#   (the originals: git show 53f3e6c:assets/models/<file>; UVK fixes the stage-1 scale the shipped files were made with)
import sys, os, json, numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage, signal
sys.path.insert(0, os.path.dirname(__file__)); import glbio

SRC, DST = sys.argv[1], sys.argv[2]
N = 2048          # atlas resolution of the ID / AO images
G = 256           # packing grid (8 texels per cell at 2048)
PAD = 2           # gutter cells around each island (16 texels at 2048 between neighbours = 6 at 768)
ROLE_NAMES = ['none', 'body', 'fwFlap', 'fwEnd', 'fwTip', 'rwMain', 'rwEnd', 'rwFlap', 'halo', 'mirror', 'fin', 'fwMain', 'carbon', 'foam']
PART_ROLES = {
    'body': {'red': 'body', 'yellow': 'body', 'orange': 'body', 'green': 'halo', 'blue': 'carbon'},
    'front_wing': {'red': 'fwMain', 'blue': 'fwFlap', 'yellow': 'fwTip', 'green': 'carbon', 'orange': 'fwEnd'},
    'rear_wing': {'green': 'rwMain', 'orange': 'rwFlap', 'blue': 'rwEnd', 'yellow': 'rwEnd', 'red': 'rwEnd'},
    'mirrors': {'red': 'mirror', 'yellow': 'mirror', 'orange': 'mirror', 'green': 'mirror', 'blue': 'mirror'},
    'winglets': {'blue': 'fin', 'green': 'fin', 'red': 'carbon', 'orange': 'carbon'},
    'cockpit_foam': {'green': 'foam'},
}
# texel density weight per mesh (linear): the bodywork, halo, mirrors and wings are what the chase / TV cameras look at
WEIGHT = {'body_main': 1.0, 'halo_main': 1.0, 'mirror_main': 0.9, 'wing_rear_main': 0.9, 'drsflap_main': 0.9, 'wing_front_main': 0.8,
          'susp_fin_fl': 0.65, 'susp_fin_fr': 0.65, 'body_cockpit': 0.5, 'wing_front_pylons': 0.45}

def classify(r, g, b):
    if r < 60 and g < 60 and b < 60: return 'none'
    if b > 150: return 'blue'
    if g > 150 and r < 80: return 'green'
    if r > 150 and g > 150: return 'yellow'
    if r > 150 and 40 < g < 140: return 'orange'
    if r > 150: return 'red'
    return 'none'

j, bin_ = glbio.read(os.path.join(SRC, 'ei-car-hi.glb'))
meta = j['scenes'][0]['extras']; atlas = meta['atlas']
assert not meta.get('roleAtlas'), 'already repacked'
idOld = np.asarray(Image.open(os.path.join(SRC, 'ei-car-id.png')).convert('RGB')); aoOld = np.asarray(Image.open(os.path.join(SRC, 'ei-car-ao.png')).convert('L')).astype(np.float32)
assert idOld.shape[0] == N
# colour class -> role per atlas part (rect test on the old layout), as a lookup over the whole old image
def part_at(u, v):
    for p, (u0, v0, w, h) in atlas.items():
        if u0 <= u < u0 + w and 1 - v0 - h <= v < 1 - v0: return p
    return None
CLS = ['none', 'red', 'yellow', 'orange', 'green', 'blue']
lut = {}
def role_of(px, u, v):
    p = part_at(u, v); c = classify(*px)
    if p is None or c == 'none': return 0
    return ROLE_NAMES.index(PART_ROLES.get(p, {}).get(c, 'none'))

# the old atlas as a role image (vectorised classify + part rects, exactly as carglb.js paintSheetGen read it)
r_, g_, b_ = [idOld[..., c].astype(int) for c in range(3)]
cls = np.full((N, N), 'none', object)
cls = np.where(r_ > 150, 'red', 'none').astype(object)
cls = np.where((r_ > 150) & (g_ > 40) & (g_ < 140), 'orange', cls)
cls = np.where((r_ > 150) & (g_ > 150), 'yellow', cls)
cls = np.where((g_ > 150) & (r_ < 80), 'green', cls)
cls = np.where(b_ > 150, 'blue', cls)
cls = np.where((r_ < 60) & (g_ < 60) & (b_ < 60), 'none', cls)
roleOld = np.zeros((N, N), np.uint8)
for p, (u0, v0, w, h) in atlas.items():
    x0, y0, ww, hh = round(u0 * N), round((1 - v0 - h) * N), round(w * N), round(h * N)
    sub = cls[y0:y0 + hh, x0:x0 + ww]; tab = PART_ROLES.get(p, {})
    roleOld[y0:y0 + hh, x0:x0 + ww] = np.vectorize(lambda c: ROLE_NAMES.index(tab.get(c, 'none')), otypes=[np.uint8])(sub)
# ---------------------------------------------------------------- islands
prims = []   # painted primitives
for mi, nname, M in glbio.mesh_worlds(j):
    m = j['meshes'][mi]
    for pi, p in enumerate(m['primitives']):
        mat = j['materials'][p['material']]['name'] if 'material' in p else ''
        if not (mat == 'paint' or m['name'] == 'halo_main'): continue
        P = glbio.get(j, bin_, p['attributes']['POSITION']).astype(np.float64); P = (np.c_[P, np.ones(len(P))] @ M.T)[:, :3]
        UV = glbio.get(j, bin_, p['attributes']['TEXCOORD_0']).astype(np.float64)
        I = glbio.get(j, bin_, p['indices']).reshape(-1, 3).astype(np.int64) if 'indices' in p else np.arange(len(P)).reshape(-1, 3)
        prims.append(dict(mesh=m['name'], prim=pi, acc=p['attributes']['TEXCOORD_0'], P=P, UV=UV, I=I))
islands = []
for pr in prims:
    n = len(pr['P']); par = np.arange(n)
    def find(x):
        r = x
        while par[r] != r: r = par[r]
        while par[x] != r: par[x], x = r, par[x]
        return r
    for a, b, c in pr['I']:
        ra, rb, rc = find(a), find(b), find(c)
        par[rb] = ra; par[find(rc)] = ra
    root = np.array([find(i) for i in range(n)]); used = np.zeros(n, bool); used[pr['I'].ravel()] = True
    pr['vis'] = -np.ones(n, np.int64)
    troot = root[pr['I'][:, 0]]
    for r in np.unique(troot):
        tris = pr['I'][troot == r]; vs = np.unique(tris.ravel())
        P, UV = pr['P'], pr['UV']
        e1 = P[tris[:, 1]] - P[tris[:, 0]]; e2 = P[tris[:, 2]] - P[tris[:, 0]]; a3 = np.linalg.norm(np.cross(e1, e2), axis=1) / 2
        d1 = UV[tris[:, 1]] - UV[tris[:, 0]]; d2 = UV[tris[:, 2]] - UV[tris[:, 0]]; det = d1[:, 0] * d2[:, 1] - d2[:, 0] * d1[:, 1]
        ok = (np.abs(det) > 1e-12) & (a3 > 1e-10)
        if ok.sum() == 0: continue
        # J = d pos / d uv (3x2): columns Ju, Jv
        Ju = (e1[ok] * d2[ok, 1:2] - e2[ok] * d1[ok, 1:2]) / det[ok, None]; Jv = (-e1[ok] * d2[ok, 0:1] + e2[ok] * d1[ok, 0:1]) / det[ok, None]
        # robust mean metric: log-Euclidean mean of the per-triangle metrics (anisotropy clamped to 8:1), weighted by 3D area, then
        # rescaled so the island keeps its true area (texels in proportion to the surface they cover)
        w = a3[ok]; Gt = np.stack([np.stack([(Ju * Ju).sum(1), (Ju * Jv).sum(1)], 1), np.stack([(Ju * Jv).sum(1), (Jv * Jv).sum(1)], 1)], 1)
        tev, tvec = np.linalg.eigh(Gt); tev = np.maximum(tev, 1e-18); tev[:, 0] = np.maximum(tev[:, 0], tev[:, 1] / 64.0)
        Lg = np.einsum('nij,nj,nkj->nik', tvec, np.log(tev), tvec); Lm = (Lg * w[:, None, None]).sum(0) / w.sum()
        ev, evec = np.linalg.eigh(Lm); ev = np.exp(ev); S = evec @ np.diag(np.sqrt(ev)) @ evec.T   # uv -> metres (up to scale)
        auv = np.abs(det).sum() / 2; S *= np.sqrt(a3.sum() / max(np.linalg.det(S) * auv, 1e-18))
        mm = UV[vs] @ S.T
        best = None
        for th in np.radians(np.arange(0, 180, 3)):
            R = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]]); q = mm @ R.T; ext = q.max(0) - q.min(0)
            if best is None or ext[0] * ext[1] < best[0]: best = (ext[0] * ext[1], R)
        A = best[1] @ S   # uv_old -> metres, tight orientation
        isl = dict(pr=pr, tris=tris, vs=vs, area=a3.sum(), A=A, w=WEIGHT.get(pr['mesh'], 0.6), aniso=float(np.sqrt(ev.max() / max(ev.min(), 1e-12))))
        pr['vis'][vs] = len(islands); islands.append(isl)
print('islands', len(islands), 'painted m2 %.2f' % sum(i['area'] for i in islands))
for k, isl in enumerate(islands): pass

# old AO with its gutters filled from inside the old islands
oldin = Image.new('L', (N, N), 0); dd = ImageDraw.Draw(oldin)
for isl in islands:
    for t in isl['tris']: dd.polygon([tuple(p) for p in isl['pr']['UV'][t] * N], fill=1)
oldin = ndimage.binary_erosion(np.asarray(oldin).astype(bool), iterations=1)
_, (iy0, ix0) = ndimage.distance_transform_edt(~oldin, return_indices=True); aoOld = aoOld[iy0, ix0]
# ---------------------------------------------------------------- shape masks + packing
def tri_mask(isl, k, rot):
    """island mask in grid cells at scale k (cells per metre * weight); rot = 0..3 quarter turns. returns (mask, T 2x3 uv_old->cells)"""
    A = isl['A'] * (k * isl['w'])
    R = [np.eye(2), np.array([[0, -1], [1, 0]]), -np.eye(2), np.array([[0, 1], [-1, 0]])][rot]; A = R @ A
    q = isl['pr']['UV'][isl['vs']] @ A.T; lo = q.min(0) - PAD - 1; hi = q.max(0) + PAD + 1
    W, H = int(np.ceil(hi[0] - lo[0])) + 1, int(np.ceil(hi[1] - lo[1])) + 1
    im = Image.new('L', (W, H), 0); d = ImageDraw.Draw(im); UVa = isl['pr']['UV']
    for t in isl['tris']:
        pts = (UVa[t] @ A.T) - lo; d.polygon([tuple(p) for p in pts], fill=1, outline=1)
    m = np.asarray(im).astype(bool); m = ndimage.binary_dilation(m, iterations=PAD)
    return m, np.c_[A, -lo]
def pack(k, final=False):
    occ = np.zeros((G, G), np.float32); place = {}
    order = sorted(range(len(islands)), key=lambda i: -islands[i]['area'] * islands[i]['w'] ** 2)
    for i in order:
        best = None
        for rot in range(4):
            m, T = tri_mask(islands[i], k, rot); h, w = m.shape
            if h > G or w > G: continue
            ov = signal.fftconvolve(occ, m[::-1, ::-1].astype(np.float32), mode='valid')   # ov[y, x] = overlap with the mask at (x, y)
            free = np.argwhere(ov < 0.5)
            if not len(free): continue
            sc = (free[:, 0] + h) * G + free[:, 1] + w * 0.5   # bottom-left-ish: lowest bottom edge, then leftmost
            y, x = free[np.argmin(sc)]; s = (y + h) * G + x
            if best is None or s < best[0]: best = (s, rot, y, x, m, T)
        if best is None: return None
        _, rot, y, x, m, T = best; occ[y:y + m.shape[0], x:x + m.shape[1]] += m
        T = T.copy(); T[:, 2] += [x, y]; place[i] = T
    return place, occ
# stage 1: the global scale (bound by the body sides, ~5 m long); stage 2: with it fixed, the other parts grow (weight factor f,
# capped at the body's density) into the space that is left
WFIX = os.environ.get('UVK')
lo_k, hi_k, best = 10.0, 400.0, None
if WFIX: lo_k = float(WFIX); best = pack(lo_k)
else:
    for it in range(12):
        k = (lo_k + hi_k) / 2; r = pack(k)
        print('k %.2f %s' % (k, 'fit' if r else 'no'), flush=True)
        if r: lo_k, best = k, r
        else: hi_k = k
k = lo_k * 0.985; best = pack(k); base_w = [isl['w'] for isl in islands]
lo_f, hi_f = 1.0, 2.5
for it in range(8):
    f = (lo_f + hi_f) / 2
    for isl, w0 in zip(islands, base_w): isl['w'] = min(1.0, w0 * f) if isl['pr']['mesh'] != 'body_main' else w0
    r = pack(k); print('f %.3f %s' % (f, 'fit' if r else 'no'), flush=True)
    if r: lo_f, best = f, r
    else: hi_f = f
for isl, w0 in zip(islands, base_w): isl['w'] = min(1.0, w0 * lo_f) if isl['pr']['mesh'] != 'body_main' else w0
place, occ = best
print('final k %.2f cells/m -> body %.2f texels/cm at 1024 (was 0.87); fill %.2f' % (k, k * 1.0 / G * 1024 / 100, (occ > 0).mean()))

# ---------------------------------------------------------------- new UVs, role + AO atlases
newUV = {id(pr): pr['UV'].copy() for pr in prims}
for i, isl in enumerate(islands):
    T = place[i]; pr = isl['pr']; vs = isl['vs']
    newUV[id(pr)][vs] = (pr['UV'][vs] @ T[:, :2].T + T[:, 2]) / G
for pr in prims:
    glbio.put(j, bin_, pr['acc'], newUV[id(pr)].astype(np.float32))
# island index raster at N on the new layout
idx = Image.new('I', (N, N), 0); d = ImageDraw.Draw(idx)
for i, isl in enumerate(islands):
    UVn = newUV[id(isl['pr'])]
    for t in isl['tris']: d.polygon([tuple(p) for p in UVn[t] * N], fill=i + 1, outline=i + 1)
idx = np.asarray(idx).astype(np.int64)
roles = np.zeros((N, N), np.uint8); ao = np.zeros((N, N), np.float32)
ys, xs = np.nonzero(idx)
for i, isl in enumerate(islands):
    sel = idx[ys, xs] == i + 1; yy, xx = ys[sel], xs[sel]
    if not len(yy): continue
    T = place[i] / G; Ainv = np.linalg.inv(T[:, :2])
    pn = np.c_[(xx + 0.5) / N, (yy + 0.5) / N]; po = (pn - T[:, 2]) @ Ainv.T   # old uv
    ox = np.clip(po[:, 0] * N, 0, N - 1); oy = np.clip(po[:, 1] * N, 0, N - 1)
    ix, iy = ox.astype(int), oy.astype(int)
    rr = roleOld[iy, ix]
    roles[yy, xx] = rr
    a = ndimage.map_coordinates(aoOld, [oy - 0.5, ox - 0.5], order=1, mode='nearest'); ao[yy, xx] = a
    isl['roles'] = np.bincount(rr, minlength=len(ROLE_NAMES))
# texels whose old ID sample fell in the old gutter (role 0) inside an island: nearest painted role of the same island
inside = idx > 0; bad = inside & (roles == 0)
print('inside texels %d, unresolved role %d' % (inside.sum(), bad.sum()))
good = inside & (roles > 0)
_, (iy, ix) = ndimage.distance_transform_edt(~good, return_indices=True)
roles[bad] = roles[iy[bad], ix[bad]]
# gutters: nearest island texel's role and AO (so mips and bilinear filtering never reach the dark background)
_, (iy, ix) = ndimage.distance_transform_edt(~inside, return_indices=True)
dist = ndimage.distance_transform_edt(~inside)
gut = (~inside) & (dist <= 24)
roles[gut] = roles[iy[gut], ix[gut]]; ao[gut] = ao[iy[gut], ix[gut]]
ao[~inside & ~gut] = 255
os.makedirs(DST, exist_ok=True)
rgb = np.zeros((N, N, 3), np.uint8); rgb[..., 0] = np.where(roles > 0, roles.astype(np.uint16) * 16 + 8, 0); rgb[..., 1] = rgb[..., 0]; rgb[..., 2] = rgb[..., 0]
Image.fromarray(rgb).save(os.path.join(DST, 'ei-car-id.png'), optimize=True)
Image.fromarray(np.clip(ao + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(DST, 'ei-car-ao.png'), optimize=True)
meta['roleAtlas'] = 1
meta['roleNames'] = ROLE_NAMES
glbio.write(os.path.join(DST, 'ei-car-hi.glb'), j, bin_)
# the fallback lo GLB (only used when ei-car-lohi.bin cannot be applied): each painted vertex takes the transform of the hi island
# (same mesh) under its old UV, from an old-layout island map per mesh
jl, binl = glbio.read(os.path.join(SRC, 'ei-car-lo.glb'))
maps = {}
for i, isl in enumerate(islands):
    mname = isl['pr']['mesh']
    if mname not in maps: maps[mname] = Image.new('I', (N, N), 0)
    dd = ImageDraw.Draw(maps[mname])
    for t in isl['tris']: dd.polygon([tuple(p) for p in isl['pr']['UV'][t] * N], fill=i + 1, outline=i + 1)
near = {}
for mname, im in maps.items():
    a = np.asarray(im).astype(np.int64); _, (iy, ix) = ndimage.distance_transform_edt(a == 0, return_indices=True); near[mname] = a[iy, ix]
nlo = 0
for mi, nname, M in glbio.mesh_worlds(jl):
    m = jl['meshes'][mi]
    for p in m['primitives']:
        mat = jl['materials'][p['material']]['name'] if 'material' in p else ''
        if not (mat == 'paint' or m['name'] == 'halo_main') or m['name'] not in near: continue
        UV = glbio.get(jl, binl, p['attributes']['TEXCOORD_0']).astype(np.float64)
        px = np.clip((UV * N).astype(int), 0, N - 1); ii = near[m['name']][px[:, 1], px[:, 0]] - 1
        out = UV.copy()
        for k in np.unique(ii):
            T = place[k] / G; sel = ii == k; out[sel] = UV[sel] @ T[:, :2].T + T[:, 2]
        glbio.put(jl, binl, p['attributes']['TEXCOORD_0'], out.astype(np.float32)); nlo += 1
jl['scenes'][0].setdefault('extras', {})
if 'atlas' in jl['scenes'][0]['extras'] or True: jl['scenes'][0]['extras'].update({'roleAtlas': 1})
glbio.write(os.path.join(DST, 'ei-car-lo.glb'), jl, binl); print('lo glb prims remapped', nlo)
# report
rep = {'k_cells_per_m': k, 'grid': G, 'islands': []}
for i, isl in enumerate(islands):
    rep['islands'].append(dict(mesh=isl['pr']['mesh'], area=round(isl['area'], 4), aniso=round(isl['aniso'], 2), w=isl['w'], roles={ROLE_NAMES[r]: int(c) for r, c in enumerate(isl.get('roles', [])) if c}))
json.dump(rep, open(os.path.join(DST, 'uvpack_report.json'), 'w'), indent=1, default=float)
np.save(os.path.join(DST, 'island_index.npy'), idx.astype(np.int16))
print('done')

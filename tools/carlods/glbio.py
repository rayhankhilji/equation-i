# minimal GLB reader / writer + accessor helpers
import json, struct, numpy as np
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def read(path):
    b = open(path, 'rb').read(); assert b[:4] == b'glTF'
    jl = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + jl]); o = 20 + jl
    bl = struct.unpack('<I', b[o:o + 4])[0]; assert b[o + 4:o + 8] == b'BIN\x00'
    return j, bytearray(b[o + 8:o + 8 + bl])
def write(path, j, bin_):
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    bn = bytes(bin_) + b'\x00' * ((4 - len(bin_) % 4) % 4)
    tot = 12 + 8 + len(js) + 8 + len(bn)
    with open(path, 'wb') as f:
        f.write(b'glTF' + struct.pack('<II', 2, tot)); f.write(struct.pack('<I', len(js)) + b'JSON' + js); f.write(struct.pack('<I', len(bn)) + b'BIN\x00' + bn)
def acc_view(j, bin_, ai):
    a = j['accessors'][ai]; bv = j['bufferViews'][a['bufferView']]; dt = np.dtype(CT[a['componentType']]); n = NC[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride', 0) or dt.itemsize * n
    return a, dt, n, off, stride
def get(j, bin_, ai):
    a, dt, n, off, stride = acc_view(j, bin_, ai); cnt = a['count']
    if stride == dt.itemsize * n: return np.frombuffer(bin_, dtype=dt, count=cnt * n, offset=off).reshape(cnt, n).copy()
    out = np.zeros((cnt, n), dt)
    for i in range(cnt): out[i] = np.frombuffer(bin_, dtype=dt, count=n, offset=off + i * stride)
    return out
def put(j, bin_, ai, arr):
    a, dt, n, off, stride = acc_view(j, bin_, ai); arr = np.asarray(arr, dt).reshape(a['count'], n)
    assert stride == dt.itemsize * n
    bin_[off:off + arr.nbytes] = arr.tobytes()
    if 'min' in a: a['min'] = [float(x) for x in arr.min(0)]; a['max'] = [float(x) for x in arr.max(0)]
def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
def node_mat(nd):
    if 'matrix' in nd: return np.array(nd['matrix'], float).reshape(4, 4).T
    M = np.eye(4); R = quat_mat(nd.get('rotation', [0, 0, 0, 1])); S = np.diag(nd.get('scale', [1, 1, 1]))
    M[:3, :3] = R @ S; M[:3, 3] = nd.get('translation', [0, 0, 0]); return M
def mesh_worlds(j):
    """[(meshIndex, nodeName, worldMatrix)]"""
    out = []
    def rec(ni, P):
        nd = j['nodes'][ni]; M = P @ node_mat(nd)
        if 'mesh' in nd: out.append((nd['mesh'], nd.get('name', ''), M))
        for c in nd.get('children', []): rec(c, M)
    for r in j['scenes'][j.get('scene', 0)]['nodes']: rec(r, np.eye(4))
    return out

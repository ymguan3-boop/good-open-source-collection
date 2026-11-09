"""Reproduce body-only GLB variants; original meshes and binary buffers stay unchanged."""
from pathlib import Path
import json, struct
root = Path(__file__).resolve().parents[1] / 'overlay/public/models'
for mode, material in [('car', 'Ocean blue paint'), ('scooter', 'Coral body')]:
    source = (root / f'taiwan-{mode}.glb').read_bytes()
    length, kind = struct.unpack_from('<II', source, 12)
    assert kind == 0x4e4f534a
    gltf = json.loads(source[20:20 + length]); remainder = source[20 + length:]
    for color, rgb in [('blue', (0.025, .34, .8)), ('red', (.85, .035, .025)), ('white', (.92, .94, .96))]:
        model = json.loads(json.dumps(gltf))
        paint = [item for item in model['materials'] if item.get('name') == material]
        assert len(paint) == 1, 'Expected exactly one body paint material'
        paint[0]['pbrMetallicRoughness']['baseColorFactor'] = [*rgb, 1]
        data = json.dumps(model, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
        data += b' ' * (-len(data) % 4)
        output = struct.pack('<III', 0x46546c67, 2, 20 + len(data) + len(remainder))
        output += struct.pack('<II', len(data), 0x4e4f534a) + data + remainder
        (root / f'taiwan-{mode}-{color}.glb').write_bytes(output)

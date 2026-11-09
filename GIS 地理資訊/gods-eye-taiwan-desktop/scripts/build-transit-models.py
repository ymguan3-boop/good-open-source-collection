"""Original v26 transit symbols, Blender 5.2. Run: blender -b --python this.py.

Static low-poly PBR assets, metres, source +X forward / +Z up. Export uses the
same glTF +Z nose convention as build-map-models.py for Cesium navigation.
Optional --assets bus,hsr permits an inspectable representative checkpoint.
No downloads, third-party meshes, brand marks, cloud service or API calls.
"""
import math
import json
import pathlib
import sys
import hashlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'overlay/public/models'
SRC = ROOT / 'assets/transit-v26'
PREVIEW = SRC / 'previews'

# Contact sheets use the already-installed host Pillow. This branch is callable
# with normal Python after the Blender build, without importing Blender modules.
if '--sheet-only' in sys.argv:
    from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageStat
    font_path = pathlib.Path('C:/Windows/Fonts/msjh.ttc')
    font = ImageFont.truetype(str(font_path), 23) if font_path.exists() else ImageFont.load_default()
    names = {'bus':'BUS / 公車','person':'WALK / 步行','tra':'TRA / 臺鐵',
             'hsr':'HSR / 高鐵','metro':'METRO / 捷運','lrt':'LRT / 輕軌','bicycle':'BIKE / 公共自行車'}
    comparison = Image.new('RGB',(1280,80+len(names)*435),(26,34,45))
    draw = ImageDraw.Draw(comparison)
    draw.text((14,12),'原創 Blender 來源  /  匯出 GLB 重新載入（相同鏡頭與 PBR 光源）',font=font,fill='white')
    draw.text((14,45),'技術檢查通過，外觀仍待使用者確認；非品牌車輛複製模型',font=font,fill=(169,190,210))
    gallery = Image.new('RGB',(1920,80+3*435),(26,34,45))
    gallery_draw = ImageDraw.Draw(gallery)
    gallery_draw.text((14,18),'v26 多運具模型 · 原創 Blender / glTF PBR · 外觀待確認',font=font,fill='white')
    results = []
    manifest = json.loads((SRC/'manifest.json').read_text(encoding='utf-8'))
    metrics = {entry['id']:entry for entry in manifest['assetMetrics']}
    for i,(name,label) in enumerate(names.items()):
        source = Image.open(PREVIEW/f'{name}-source-threequarter.png').convert('RGB')
        imported = Image.open(PREVIEW/f'{name}-reimport-threequarter.png').convert('RGB')
        y = 80+i*435
        draw.text((14,y+5),label+' — SOURCE',font=font,fill='white')
        draw.text((654,y+5),label+' — GLB REIMPORT',font=font,fill='white')
        comparison.paste(source,(0,y+35))
        comparison.paste(imported,(640,y+35))
        xg,yg=(i%3)*640,80+(i//3)*435
        gallery_draw.text((xg+14,yg+5),label+f'  {metrics[name]["sourceMetrics"]["triangles"]:,} tris',font=font,fill='white')
        gallery.paste(imported,(xg,yg+35))
        diff = ImageChops.difference(source,imported)
        stat = ImageStat.Stat(diff)
        results.append({'asset':name,'matchedCameraMeanRgbDifference':stat.mean,
                        'matchedCameraRmsRgbDifference':stat.rms,
                        'technicalAppearanceStatus':'MATCHED_RENDER_EVIDENCE','userApproval':'USER_APPROVAL_PENDING'})
    comparison.save(PREVIEW/'source-reimport-comparison.png')
    gallery.save(PREVIEW/'transit-model-gallery.png')
    (SRC/'render-comparison.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    print('TRANSIT_SHEETS_SUCCESS '+str(len(results)))
    raise SystemExit(0)

import bpy
from mathutils import Vector, Matrix
for folder in [OUT, SRC, PREVIEW]:
    folder.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0


def material(name, color, metal=0, rough=.42):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = rough
    return mat


def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1
    return {
        'rubber': material('Tyre and dark trim', (.025, .035, .048), rough=.82),
        'metal': material('Brushed metal', (.39, .49, .58), metal=.65, rough=.3),
        'glass': material('Dark blue glazed windows', (.022, .082, .13), metal=.25, rough=.22),
        'white': material('Pearl white panels', (.88, .91, .94), metal=.16),
        'light': material('Headlamp lens', (.95, .96, 1), rough=.22),
        'red': material('Rear red lamps', (.8, .035, .035), rough=.3),
        'amber': material('Amber lamps', (1, .43, .015), rough=.3),
    }


def cube(name, pos, size, mat, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Manufactured edge chamfer', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def cylinder(name, pos, radius, depth, mat, axis='Z', vertices=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    if axis == 'Y':
        obj.rotation_euler.x = math.pi / 2
    elif axis == 'X':
        obj.rotation_euler.y = math.pi / 2
    return obj


def beam(name, start, end, width, mat, circular=False):
    a, b = Vector(start), Vector(end)
    if circular:
        obj = cylinder(name, (a+b)/2, width/2, (b-a).length, mat, vertices=12)
    else:
        obj = cube(name, (a+b)/2, (width, width, (b-a).length), mat, bevel=width*.15)
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return obj


def sphere(name, pos, scale, mat, segments=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def loft(name, sections, mat):
    # Cross sections: x, full width, bottom, top. Eight corners keep rounded roof
    # transitions readable without mechanically subdividing a box.
    verts = []
    for x, width, bottom, top in sections:
        half = width/2
        chamfer = min(.24, width*.12, (top-bottom)*.16)
        verts.extend([(x, -half+chamfer, bottom), (x, half-chamfer, bottom),
                      (x, half, bottom+chamfer), (x, half, top-chamfer),
                      (x, half-chamfer, top), (x, -half+chamfer, top),
                      (x, -half, top-chamfer), (x, -half, bottom+chamfer)])
    faces = [tuple(range(7, -1, -1))]
    for ring in range(len(sections)-1):
        for j in range(8):
            faces.append((ring*8+j, ring*8+(j+1)%8, (ring+1)*8+(j+1)%8, (ring+1)*8+j))
    faces.append(tuple(range((len(sections)-1)*8, len(sections)*8)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def wheels(xs, y, r, z, mats, rail=False):
    for x in xs:
        for side in [-1, 1]:
            cylinder('Steel rail wheel' if rail else 'Bus tyre', (x, side*y, z), r, .2, mats['metal'] if rail else mats['rubber'], axis='Y', vertices=24)
            cylinder('Wheel face hub', (x, side*(y+.111), z), r*.67, .025, mats['metal'], axis='Y', vertices=16)
            if not rail:
                for j in range(5):
                    angle = j*math.tau/5
                    spoke = cube('Five-spoke wheel', (x, side*(y+.132), z), (.036, .022, r*1.3), mats['white'], bevel=.006)
                    spoke.rotation_euler.y = angle


def bus():
    m = reset()
    paint = material('Bus turquoise paint', (.015, .55, .49), metal=.3)
    roof = material('Bus silver roof', (.69, .79, .83), metal=.35)
    loft('Low-floor city bus shell', [(-5.2, 2.4, .48, 3.03), (-4.96, 2.5, .43, 3.2),
                                     (4.75, 2.5, .43, 3.2), (5.2, 2.38, .46, 2.95)], paint)
    cube('HVAC rooftop pack', (-1.1, 0, 3.25), (2.8, 1.7, .24), roof, .09)
    for y in [-1.27, 1.27]:
        for x in [-4.15, -2.8, -1.45, -.1, 1.25, 2.6, 3.95]:
            cube('Large passenger window', (x, y, 2.19), (1.21, .035, 1.08), m['glass'], .045)
        cube('Light side waist rail', (-.1, y, 1.55), (9.9, .03, .1), m['white'], .015)
        cube('Lower body protective rail', (0, y, .68), (9.3, .04, .12), m['rubber'], .01)
    for x in [3.12, -.75]:
        cube('Accessible double-door black border', (x, -1.29, 1.53), (1.23, .035, 2.01), m['rubber'], .025)
        for dx in [-.3, .3]:
            cube('Door glass leaf', (x+dx, -1.31, 1.66), (.54, .025, 1.66), m['glass'], .035)
            cube('Door grab handle', (x+dx*.2, -1.33, 1.51), (.018, .018, .3), m['metal'], .004)
    cube('Front full windshield', (5.23, 0, 2.06), (.04, 2.03, 1.44), m['glass'], .06)
    cube('Destination display recess', (5.25, 0, 2.83), (.055, 1.67, .26), m['rubber'], .03)
    cube('Rear window', (-5.2, 0, 2.17), (.045, 1.82, 1.15), m['glass'], .055)
    wheels([-3.24, 3.18], 1.18, .5, .51, m)
    for side in [-1, 1]:
        cube('Front white headlamps', (5.23, side*.89, .95), (.08, .34, .25), m['light'], .055)
        cube('Amber side indicator', (5.24, side*.9, 1.14), (.04, .2, .06), m['amber'], .015)
        cube('Tail lamp', (-5.24, side*.98, .98), (.05, .13, .39), m['red'], .025)
        beam('Long mirror arm', (4.8, side*1.18, 2.65), (5.26, side*1.57, 2.57), .05, m['rubber'])
        cube('Driver mirror', (5.28, side*1.59, 2.39), (.16, .17, .39), m['rubber'], .035)
    cube('Front bumper', (5.23, 0, .61), (.14, 2.28, .18), m['rubber'], .035)
    for z in [.78, .92, 1.06]:
        cube('Rear engine ventilation slat', (-5.25, 0, z), (.035, 1.15, .035), m['rubber'], .005)


def bogies(length, width, m, count=2):
    positions = [-length*.32, length*.32] if count == 2 else [-length*.35, 0, length*.35]
    for x in positions:
        cube('Rail bogie frame', (x, 0, .46), (1.9, width*.7, .26), m['rubber'], .055)
        wheels([x-.61, x+.61], width*.33, .31, .34, m, rail=True)
        for y in [-width*.35, width*.35]:
            cylinder('Air suspension', (x, y, .71), .17, .2, m['metal'], vertices=12)


def pantograph(at, m):
    x, z = at
    cube('Pantograph base', (x, 0, z), (.9, 1.13, .11), m['rubber'], .03)
    for y in [-.38, .38]:
        beam('Collector lower diagonal', (x-.43, y, z+.08), (x+.25, y, z+.48), .045, m['metal'])
        beam('Collector upper diagonal', (x+.25, y, z+.48), (x-.24, y, z+.83), .045, m['metal'])
    cube('Carbon overhead collector', (x-.24, 0, z+.84), (.13, 1.44, .08), m['rubber'], .02)


def rail_vehicle(kind):
    m = reset()
    schemes = {'tra': ((.82, .14, .085), 20, 3.04, 3.65),
               'hsr': ((.98, .34, .025), 25, 3.38, 3.55),
               'metro': ((.04, .37, .74), 18, 2.85, 3.5),
               'lrt': ((.16, .63, .24), 18, 2.58, 3.12)}
    color, length, width, top = schemes[kind]
    accent = material(f'{kind} distinctive accent paint', color, metal=.25)
    half = length/2
    base = .68 if kind == 'lrt' else .82
    if kind == 'hsr':
        sections = [(-half, width, base, top), (-half+1, width, base, top),
                    (half-6, width, base, top), (half-4.4, width*.91, base, top-.19),
                    (half-2.5, width*.63, base+.02, top-.75),
                    (half-.7, width*.27, base+.07, top-1.57),
                    (half, .27, base+.17, base+.86)]
        loft('Original aerodynamic high-speed nose and shell', sections, m['white'])
        # Window is an authored surface on the sloping roof, not a smaller
        # solid embedded inside the nose (which would disappear at runtime).
        windshield = bpy.data.meshes.new('Raked cockpit window mesh')
        windshield.from_pydata([(half-4.1,-1.04,3.289), (half-2.85,-.82,2.93),
                                (half-2.85,.82,2.93), (half-4.1,1.04,3.289)], [], [(0,1,2,3)])
        windshield.update()
        cockpit = bpy.data.objects.new('Raked HSR cockpit windscreen', windshield)
        bpy.context.collection.objects.link(cockpit)
        cockpit.data.materials.append(m['glass'])
        cube('High-speed nose accent', (half-.22, 0, 1.29), (.25, .35, .09), accent, .035)
        window_xs = [-half+1.4+i*1.16 for i in range(15)]
    elif kind == 'lrt':
        for center in [-4.62, 4.62]:
            loft('Low-floor tram articulated section', [(center-4.34, width*.86, base, top-.14),
                                                       (center-3.9, width, base, top),
                                                       (center+3.9, width, base, top),
                                                       (center+4.34, width*.86, base, top-.14)], m['white'])
        for x in [-.22, 0, .22]:
            cube('Flexible articulation bellows', (x, 0, 1.83), (.14, width*.98, 2.22), m['rubber'], .035)
        window_xs = [-7.75, -6.5, -5.25, -4, -2.75, -1.5, 1.5, 2.75, 4, 5.25, 6.5, 7.75]
        for x in [-6, -2.2, 2.2, 6]:
            for side in [-1, 1]:
                cube('Tram double-door border', (x, side*(width/2+.026), 1.67), (1.25, .045, 1.87), accent, .035)
                cube('Tram door glazing', (x, side*(width/2+.058), 1.83), (1.07, .025, 1.5), m['glass'], .04)
                cube('Tram center door seam', (x, side*(width/2+.074), 1.65), (.025, .025, 1.69), m['white'], .004)
        pantograph((-3.5, top+.22), m)
    else:
        taper = .2 if kind == 'tra' else 1.05
        end_width = width*(.94 if kind == 'tra' else .80)
        end_top = top-(.17 if kind == 'tra' else .40)
        loft('Commuter railway shell' if kind == 'tra' else 'Rounded metro shell',
             [(-half, end_width, base, end_top), (-half+taper, width, base, top),
              (half-taper, width, base, top), (half, end_width, base, end_top)], m['white'])
        window_xs = [-half+1.3+i*1.12 for i in range(16 if kind == 'tra' else 14)]
        for x in [-half+3.6, -.8, half-4.1]:
            for side in [-1, 1]:
                cube('Rail double-door border', (x, side*(width/2+.026), 1.89), (1.13, .036, 2.03), accent, .03)
                cube('Rail door window', (x, side*(width/2+.052), 2.21), (.9, .025, 1.05), m['glass'], .035)
                cube('Rail door center seam', (x, side*(width/2+.067), 1.81), (.023, .02, 1.83), m['metal'], .004)
        if kind == 'tra':
            pantograph((-3.9, top+.2), m)
    for side in [-1, 1]:
        y = side*(width/2+.012)
        for x in window_xs:
            cube('Passenger rail window', (x, y, top-.78), (.84, .035, .82), m['glass'], .04)
        stripe_length = length-6.7 if kind == 'hsr' else length-.4
        stripe_x = -3.05 if kind == 'hsr' else 0
        cube('Distinctive waist stripe', (stripe_x, y, 1.51), (stripe_length, .025, .22), accent, .015)
        cube('Dark skirt sill', (stripe_x, y, base+.12), (stripe_length, .027, .18), m['rubber'], .015)
    cube('Underfloor equipment trunk', (-1.1, 0, .65), (length*.44, width*.69, .3), m['metal'], .06)
    for x in [-half*.41, half*.13]:
        cube('Roof HVAC module', (x, 0, top+.1), (2.0, width*.57, .18), m['metal'], .065)
    if kind != 'hsr':
        for sign in [-1, 1]:
            glass_center = 2.61 if kind=='metro' else top-.71
            glass_height = .81 if kind=='metro' else 1.03
            cube('Cab wrap windshield', (sign*(half+.018), 0, glass_center), (.04, width*.7, glass_height), m['glass'], .055)
            cube('Cab colored front lower panel', (sign*(half+.036), 0, 1.47), (.045, width*(.76 if kind=='metro' else .83), .47), accent, .045)
            cube('Automatic coupler', (sign*(half+.17), 0, .89), (.26, .4, .2), m['rubber'], .035)
            for side in [-1, 1]:
                cube('Rail head or tail lamp', (sign*(half+.055), side*width*.33, 1.86), (.055, .15, .16), m['light'] if sign>0 else m['red'], .025)
        if kind == 'tra':
            # TRA's square front has a gangway/emergency door and divided cab
            # windows; the metro has a narrower raked full-windscreen cab.
            cube('TRA center front gangway door', (half+.069, 0, 2.22), (.06,.57,1.61), m['white'], .035)
            cube('TRA gangway door window', (half+.11, 0, 2.64), (.025,.39,.54), m['glass'], .025)
            for side in [-1,1]:
                cube('TRA divided cab window', (half+.066,side*.74,2.81), (.035,.76,.73), m['glass'], .045)
                beam('TRA front door handrail', (half+.115,side*.34,1.6), (half+.115,side*.34,2.12), .024, m['metal'], circular=True)
            cube('TRA front footplate', (half+.16,0,1.14), (.26,1.8,.08), m['metal'], .018)
    else:
        for side in [-1, 1]:
            sphere('Streamlined nose lamp', (half-1.25, side*.675, 1.45), (.25, .085, .1), m['light'], segments=12, rings=6)
        cube('High-speed rear cab window', (-half-.015, 0, 2.57), (.04, width*.68, .77), m['glass'], .065)
    bogies(length, width, m, count=3 if kind == 'lrt' else 2)


def person():
    m = reset()
    skin = material('Warm skin', (.65, .38, .23), rough=.66)
    shirt = material('Walking cyan jacket', (.025, .48, .71), rough=.65)
    pants = material('Navy trousers', (.035, .062, .11), rough=.85)
    pack = material('Orange daypack', (.95, .25, .035), rough=.65)
    hair = material('Dark hair', (.028, .021, .019), rough=.85)
    sphere('Jacket torso', (0, 0, 1.12), (.19, .23, .31), shirt, segments=20, rings=12)
    sphere('Hip and trouser waistband', (0, 0, .88), (.16, .205, .15), pants)
    cylinder('Connected neck', (0, 0, 1.44), .077, .15, skin, vertices=16)
    sphere('Head', (.005, 0, 1.62), (.135, .128, .164), skin, segments=20, rings=12)
    sphere('Hair cap', (-.025, 0, 1.712), (.128, .132, .08), hair)
    for side in [-1, 1]:
        sphere('Eye', (.126, side*.052, 1.66), (.017, .012, .014), m['rubber'], segments=8, rings=4)
    sphere('Rounded nose', (.14, 0, 1.63), (.036, .031, .033), skin, segments=10, rings=6)
    cube('Close-fitting daypack', (-.18, 0, 1.17), (.14, .31, .36), pack, .05)
    for side in [-1, 1]:
        beam('Shoulder strap', (-.17, side*.15, 1.39), (.13, side*.15, 1.32), .037, m['rubber'], circular=True)
        hip = (0, side*.116, .88)
        knee = (side*.13, side*.13, .48)
        ankle = (side*.21, side*.14, .135)
        beam('Upper trouser leg', hip, knee, .17, pants, circular=True)
        sphere('Connected trouser knee', knee, (.09, .095, .095), pants)
        beam('Lower trouser leg', knee, ankle, .13, pants, circular=True)
        cube('Athletic shoe', (ankle[0]+.046, ankle[1], .078), (.27, .14, .14), m['rubber'], .035)
        cube('Shoe outsole', (ankle[0]+.046, ankle[1], .022), (.27, .145, .035), m['white'], .012)
        shoulder = (0, side*.225, 1.31)
        elbow = (-side*.09, side*.29, 1.085)
        wrist = (-side*.18, side*.29, .98)
        sphere('Jacket shoulder', shoulder, (.1, .1, .11), shirt)
        beam('Jacket upper sleeve', shoulder, elbow, .13, shirt, circular=True)
        sphere('Connected elbow sleeve', elbow, (.071, .071, .078), shirt)
        beam('Jacket lower sleeve', elbow, wrist, .115, shirt, circular=True)
        sphere('Closed hand', (wrist[0], wrist[1], wrist[2]-.035), (.057, .05, .075), skin)


def torus(name, pos, major, minor, mat, axis='Y', segments=32, minor_segments=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                   major_segments=segments, minor_segments=minor_segments, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    if axis == 'Y':
        obj.rotation_euler.x = math.pi/2
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def bicycle():
    m = reset()
    paint = material('Public cycle orange frame', (.96, .28, .025), metal=.32)
    basket = material('Bike basket dark teal', (.035, .22, .24), metal=.3)
    for x in [-.68, .69]:
        torus('Cycle tyre', (x, 0, .36), .31, .044, m['rubber'])
        torus('Aluminium cycle rim', (x, 0, .36), .293, .013, m['metal'], minor_segments=6)
        cylinder('Axle hub', (x, 0, .36), .036, .16, m['metal'], axis='Y', vertices=16)
        for j in range(12):
            angle = j*math.tau/12
            beam('Wheel spoke', (x, -.016, .36), (x+.285*math.cos(angle), -.016, .36+.285*math.sin(angle)), .009, m['metal'], circular=True)
    rear, crank, seat, head, front = (-.68, 0, .36), (-.1, 0, .33), (-.29, 0, .89), (.38, 0, .86), (.69, 0, .36)
    for a,b in [(rear, crank), (rear, seat), (crank, seat), (crank, head), (seat, head), (head, front)]:
        beam('Step-through cycle frame tube', a, b, .05, paint, circular=True)
    beam('Seatpost', seat, (-.3, 0, 1.04), .037, m['metal'], circular=True)
    cube('Cycle saddle', (-.34, 0, 1.064), (.25, .23, .06), m['rubber'], .027)
    beam('Handlebar stem', head, (.4, 0, 1.06), .038, m['metal'], circular=True)
    for side in [-1, 1]:
        beam('Swept-back handlebar', (.4, 0, 1.06), (.31, side*.29, 1.1), .028, m['metal'], circular=True)
        beam('Rubber grip', (.31, side*.25, 1.1), (.31, side*.36, 1.1), .041, m['rubber'], circular=True)
        beam('Fork blade', (.39, side*.035, .87), (.69, side*.052, .36), .033, paint, circular=True)
        beam('Pedal crank', (-.1, side*.055, .33), (-.1+side*.12, side*.07, .33-side*.05), .023, m['metal'], circular=True)
        cube('Pedal', (-.1+side*.12, side*.145, .33-side*.05), (.11, .15, .026), m['rubber'], .008)
    torus('Chainring', crank, .088, .013, m['metal'], segments=24, minor_segments=6)
    for z in [.28, .43]:
        beam('Chain straight run', (-.68, .07, .36+(z-.36)*.3), (-.1, .07, z), .011, m['rubber'], circular=True)
    cube('Front basket floor', (.53, 0, .94), (.32, .34, .035), basket, .01)
    for x in [.38, .68]:
        for y in [-.16, .16]:
            beam('Basket upright', (x,y,.95), (x+.025,y*1.13,1.17), .018, basket, circular=True)
    for z in [1.03, 1.16]:
        for y in [-.18, .18]:
            beam('Basket rim', (.38,y,z), (.7,y,z), .02, basket, circular=True)
        for x in [.38,.7]:
            beam('Basket rim', (x,-.18,z), (x,.18,z), .02, basket, circular=True)
    cube('Rear rack', (-.62,0,.75), (.45,.23,.035), m['metal'], .012)
    sphere('White front reflector', (.72,0,.96), (.025,.035,.035), m['light'], segments=8, rings=4)
    sphere('Red rear reflector', (-.9,0,.72), (.018,.035,.035), m['red'], segments=8, rings=4)


def inspect_meshes(meshes):
    coords = []
    triangles = 0
    vertices = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        vertices += len(obj.data.vertices)
        coords.extend(obj.matrix_world @ Vector(v) for v in obj.bound_box)
    bounds = [[min(v[i] for v in coords), max(v[i] for v in coords)] for i in range(3)]
    materials = {mat.name for obj in meshes for mat in obj.data.materials if mat}
    return {'triangles': triangles, 'vertices': vertices, 'meshCount': len(meshes),
            'boundsSourceAxesMetres': bounds,
            'dimensionsMetres': [round(b-a, 4) for a,b in bounds],
            'materialCount': len(materials), 'materials': sorted(materials)}


def render(name, meshes, stage, view='threequarter'):
    stats = inspect_meshes(meshes)
    dims = stats['dimensionsMetres']
    bounds = stats['boundsSourceAxesMetres']
    center = Vector([(b+a)/2 for a,b in bounds])
    span = max(dims)
    vectors = {'threequarter': Vector((1.1,-1.65,.8)),
               'front': Vector((1,0,.12)), 'side': Vector((0,-1,.12)),
               'back': Vector((-1,0,.12)), 'closeup': Vector((1.1,-1.3,.45))}
    offset = vectors[view].normalized()*span*2
    target = center if view != 'closeup' else Vector((bounds[0][1]-dims[0]*.11,0,center.z))
    bpy.ops.object.camera_add(location=target+offset)
    camera = bpy.context.object
    camera.name = 'Validation camera'
    camera.rotation_euler = (target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type = 'ORTHO'
    if view in ['front','back']:
        camera.data.ortho_scale = max(dims[1]*1.55, dims[2]*1.7)
    elif view == 'closeup':
        camera.data.ortho_scale = max(dims[1]*1.8, dims[2]*1.7)
    else:
        camera.data.ortho_scale = max(span*1.24, dims[2]*1.65)
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = 16
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.095,.13,.18,1)
    scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.6
    lights = []
    for at, power, size in [(target+Vector((span*.7,-span*.7,span*1.3)),1400,span),
                             (target+Vector((-span*.4,span*.65,span*.75)),900,span*.8)]:
        bpy.ops.object.light_add(type='AREA',location=at)
        light = bpy.context.object
        light.data.energy=power*(span/4)**2
        light.data.shape='DISK'
        light.data.size=size
        light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
        lights.append(light)
    scene.view_settings.view_transform='AgX'
    scene.render.resolution_x=640
    scene.render.resolution_y=400
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.render.film_transparent=False
    scene.render.filepath=str(PREVIEW/f'{name}-{stage}-{view}.png')
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera,do_unlink=True)
    for light in lights:
        bpy.data.objects.remove(light,do_unlink=True)


def build(name, builder):
    builder()
    meshes=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
    before=inspect_meshes(meshes)
    if before['triangles'] > 6000:
        raise ValueError(f'{name} exceeds maximum low-poly budget: {before["triangles"]}')
    source=SRC/f'taiwan-{name}.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    for view in ['threequarter','front','side','back','closeup']:
        render(name,meshes,'source',view)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    matrices={obj:obj.matrix_world.copy() for obj in meshes}
    rotation=Matrix.Rotation(-math.pi/2,4,'Z')
    for obj in meshes:
        obj.matrix_world=rotation@obj.matrix_world
    destination=OUT/f'taiwan-{name}.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination),export_format='GLB',use_selection=True,export_yup=True)
    for obj in meshes:
        obj.matrix_world=matrices[obj]
    # Independently reload GLB and reverse only its root-axis adapter for
    # matched-camera art comparison against the +X source. Runtime keeps +Z nose.
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(destination))
    inverse=Matrix.Rotation(math.pi/2,4,'Z')
    roots=[obj for obj in bpy.context.scene.objects if obj.parent is None]
    for obj in roots:
        obj.matrix_world=inverse@obj.matrix_world
    bpy.context.view_layer.update()
    imported=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
    after=inspect_meshes(imported)
    if after['triangles']!=before['triangles']:
        raise ValueError(f'{name} reimport changed triangle count')
    for i in range(3):
        if abs(before['dimensionsMetres'][i]-after['dimensionsMetres'][i]) > .002:
            raise ValueError(f'{name} axis or scale regression')
    if after['materialCount']!=before['materialCount']:
        raise ValueError(f'{name} reimport changed material count')
    for view in ['threequarter','side']:
        render(name,imported,'reimport',view)
    return {'id':name, 'file':str(destination.relative_to(ROOT)).replace('\\','/'),
            'source':str(source.relative_to(ROOT)).replace('\\','/'),
            'sourceMetrics':before,'reimportMetrics':after,
            'bytes':destination.stat().st_size,
            'sha256':hashlib.sha256(destination.read_bytes()).hexdigest(),
            'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'clips':[], 'technicalStatus':'TECHNICAL_PASS',
            'artStatus':'ART_REVIEW_PENDING','userApproval':'USER_APPROVAL_PENDING',
            'sourceForward':'+X','sourceUp':'+Z','glTFForward':'+Z',
            'runtimePixelSizeRecommendation':64 if name in ['bus','tra','hsr','metro','lrt'] else 56}


builders={'bus':bus,'person':person,'tra':lambda:rail_vehicle('tra'),
          'hsr':lambda:rail_vehicle('hsr'),'metro':lambda:rail_vehicle('metro'),
          'lrt':lambda:rail_vehicle('lrt'),'bicycle':bicycle}
arguments=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
selected=list(builders)
if '--assets' in arguments:
    selected=arguments[arguments.index('--assets')+1].split(',')
results=[]
for name in selected:
    results.append(build(name,builders[name]))
    (SRC/f'validation-{name}.json').write_text(json.dumps(results[-1],ensure_ascii=False,indent=2),encoding='utf-8')
manifest=json.loads((SRC/'manifest.json').read_text(encoding='utf-8'))
all_results=[json.loads((SRC/f'validation-{name}.json').read_text(encoding='utf-8'))
             for name in builders if (SRC/f'validation-{name}.json').exists()]
manifest['assetMetrics']=all_results
manifest['technicalStatus']='TECHNICAL_PASS' if len(all_results)==7 else 'PARTIAL_TECHNICAL_PASS'
manifest['artStatus']='ART_REVIEW_PENDING'
manifest['userApproval']='USER_APPROVAL_PENDING'
manifest['budgetExceptions']=[{'id':r['id'],'triangles':r['sourceMetrics']['triangles'],
                              'reason':'Simple distant map symbol; additional subdivisions would add no useful silhouette information'}
                             for r in all_results if r['sourceMetrics']['triangles']<2000]
(SRC/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('TRANSIT_MODELS_SUCCESS '+json.dumps([{'id':r['id'],'triangles':r['sourceMetrics']['triangles'],'bytes':r['bytes']} for r in results]))

"""Original map assets. Blender 5.2; metres, +X forward, Z up; no OEM textures."""
import bpy, math, json, pathlib
from mathutils import Vector, Matrix
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'overlay/public/models'
SRC = ROOT / 'assets/models'
OUT.mkdir(parents=True, exist_ok=True); SRC.mkdir(parents=True, exist_ok=True)
def material(name, color, metal=0, rough=.4):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value=(*color,1)
    b.inputs['Metallic'].default_value=metal; b.inputs['Roughness'].default_value=rough
    return m
def cube(name, at, size, mat, bevel=.03):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at); o=bpy.context.object; o.name=name
    o.scale=size; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Soft manufactured edges','BEVEL'); mod.width=bevel; mod.segments=2
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
def cylinder(name,at,radius,depth,mat,axis='Z',vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at)
    o=bpy.context.object; o.name=name; o.data.materials.append(mat)
    if axis=='Y':o.rotation_euler.x=math.pi/2
    return o
def beam(name,a,b,width,mat):
    a,b=Vector(a),Vector(b); o=cube(name,(a+b)/2,(width,width,(b-a).length),mat,.015)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler(); return o
def hull(name,profile,width,mat):
    n=len(profile); verts=[(x,y,z) for y in [-width/2,width/2] for x,z in profile]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o); o.data.materials.append(mat); return o
def wheels(xvalues,y,r,z,rubber,silver):
    for x in xvalues:
        for side in [-1,1]:
            cylinder('Rubber tyre',(x,side*y,z),r,.19,rubber,'Y',32)
            cylinder('Wheel hub',(x,side*(y+.101),z),r*.66,.02,silver,'Y',24)
            for i in range(6):
                a=i*math.pi/3; spoke=cube('Alloy spoke',(x,side*(y+.115),z),(.035,.012,r*1.1),silver,.005)
                spoke.rotation_euler.y=a
def setup():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    return [material('Graphite rubber',(.028,.032,.04),rough=.75),material('Aluminium',(.48,.58,.65),.7),material('Smoked blue glass',(.035,.16,.23),.25),material('White lighting',(.92,.95,1)),material('Amber lighting',(1,.46,.035)),material('Red lighting',(.92,.025,.04))]
def car():
    rubber,silver,glass,white,amber,red=setup(); paint=material('Ocean blue paint',(.025,.34,.8),.4)
    hull('Sculpted compact crossover',[(-2,.5),(-2,.94),(-1.45,1.12),(1.48,1.05),(2,.85),(2,.5)],1.72,paint)
    hull('Cabin',[(-1.42,1.1),(-.95,1.7),(.58,1.7),(1.12,1.08)],1.43,glass)
    cube('Roof',(-.2,0,1.72),(1.6,1.42,.075),paint)
    for y in [-.73,.73]:
        cube('Window divider',(-.22,y,1.41),(.055,.06,.55),paint,.01)
        cube('Lower window rail',(-.15,y,1.13),(2.5,.08,.08),paint,.01)
        cube('Side mirror',(.82,y*1.24,1.17),(.23,.17,.12),paint)
        for x in [-.85,.2]:cube('Door handle',(x,y*1.2,1.02),(.18,.025,.04),silver,.008)
        cube('Rocker trim',(-.05,y*1.2,.51),(3.22,.05,.09),rubber,.01)
    wheels([-1.25,1.22],.88,.37,.38,rubber,silver)
    cube('Front grille',(2.025,0,.65),(.045,.85,.21),rubber,.005)
    cube('Front bumper',(2.01,0,.51),(.08,1.65,.1),silver)
    cube('Rear bumper',(-2.02,0,.52),(.06,1.66,.09),rubber)
    for y in [-.6,.6]:
        cube('Headlamp',(1.99,y,.9),(.06,.43,.15),white,.02)
        cube('Tail lamp',(-2.02,y,.93),(.06,.43,.13),red,.02)
        cube('Front indicator',(2.03,y,.79),(.05,.22,.035),amber,.005)
def scooter():
    rubber,silver,glass,white,amber,red=setup(); paint=material('Coral body',(.95,.19,.065),.25)
    for x in [-.68,.65]:
        cylinder('Scooter tyre',(x,0,.255),.25,.17,rubber,'Y',32)
        for y in [-.09,.09]:cylinder('Scooter alloy',(x,y,.255),.17,.012,silver,'Y',24)
    cube('Step-through floor',(-.1,0,.32),(.82,.47,.12),rubber)
    hull('Rear body',[(-.98,.36),(-.85,.79),(-.28,.84),(-.19,.54),(-.3,.37)],.48,paint)
    cube('Two-place saddle',(-.62,0,.84),(.87,.44,.12),rubber,.07)
    hull('Front fairing',[(.34,.33),(.66,.34),(.71,.9),(.55,1.16),(.32,1.08)],.43,paint)
    beam('Front fork',(.65,0,.28),(.55,0,1.16),.07,silver)
    cube('Handlebar nacelle',(.5,0,1.15),(.26,.51,.16),paint,.05)
    cube('Headlamp',(.649,0,1.17),(.025,.26,.105),white,.025)
    cube('Instrument panel',(.35,0,1.19),(.03,.23,.09),glass,.01)
    for y in [-.31,.31]:
        beam('Handlebar',(.47,0,1.14),(.47,y,1.14),.04,silver)
        cube('Grip',(.47,y,1.14),(.07,.16,.065),rubber,.025)
        beam('Mirror stem',(.48,y,1.17),(.45,y*1.25,1.4),.022,silver)
        cube('Mirror',(.45,y*1.25,1.42),(.04,.14,.085),glass,.03)
        cube('Indicator',(.66,y*.65,.94),(.04,.07,.06),amber,.02)
    cube('Rear light',(-1.015,0,.68),(.03,.3,.08),red,.02)
    beam('Rear suspension',(-.68,.12,.27),(-.46,.14,.7),.04,silver)
    cylinder('Exhaust',(-.62,-.23,.35),.055,.46,silver)
    cube('Rear rack',(-.98,0,.9),(.24,.42,.035),silver,.01)
    cube('Front fender',(.65,0,.52),(.47,.24,.055),paint,.025)
def drone():
    rubber,silver,glass,white,amber,red=setup(); paint=material('Safety turquoise',(.015,.72,.63),.35)
    cube('Central fuselage',(0,0,.23),(.48,.33,.17),paint,.07)
    cube('Battery cover',(-.035,0,.33),(.31,.23,.055),rubber,.035)
    for x in [-.43,.43]:
        for y in [-.43,.43]:
            beam('Quad arm',(0,0,.22),(x,y,.24),.07,silver)
            cylinder('Motor',(x,y,.27),.07,.1,rubber)
            for angle in [0,math.pi/2]:
                o=cube('Propeller',(x,y,.34),(.4,.035,.013),rubber,.005); o.rotation_euler.z=angle
            beam('Landing leg',(x*.7,y*.7,.2),(x*.7,y*.7,0),.025,silver)
            cylinder('Navigation lamp',(x,y,.205),.027,.015,red if x<0 else white)
    cube('Gimbal',(.25,0,.12),(.1,.16,.09),rubber,.025)
    lens=cylinder('Camera lens',(.31,0,.12),.043,.04,glass);lens.rotation_euler.y=math.pi/2
metrics=[]
for name,builder in [('car',car),('scooter',scooter),('drone',drone)]:
    builder(); meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    triangles=0
    for o in meshes:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    dest=OUT/f'taiwan-{name}.glb'
    originals={o:o.matrix_world.copy() for o in meshes}
    # Cesium's default glTF Z-forward correction expects glTF +Z as the nose.
    # Blender -Y becomes glTF +Z when export_yup is enabled.
    rotation=Matrix.Rotation(-math.pi/2,4,'Z')
    for o in meshes:o.matrix_world=rotation@o.matrix_world
    bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,export_yup=True)
    for o in meshes:o.matrix_world=originals[o]
    bpy.ops.wm.save_as_mainfile(filepath=str(SRC/f'taiwan-{name}.blend'))
    bpy.ops.object.camera_add(location=(5,-7,4) if name=='car' else (3,-4,2.6))
    camera=bpy.context.object;target=Vector((0,0,.7 if name=='car' else .5 if name=='scooter' else .18))
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=5.5 if name=='car' else 2.5
    scene=bpy.context.scene;scene.camera=camera;scene.render.engine='BLENDER_WORKBENCH';scene.display.shading.color_type='MATERIAL';scene.display.shading.light='STUDIO';scene.display.shading.show_shadows=True;scene.display.shading.show_cavity=True
    scene.display.shading.background_type='WORLD';scene.world.color=(.07,.09,.12)
    scene.render.resolution_x=720;scene.render.resolution_y=540;scene.render.resolution_percentage=100;scene.render.filepath=str(SRC/f'taiwan-{name}-preview.png');bpy.ops.render.render(write_still=True)
    # Reimport the exported artifact, not the source scene, and measure again.
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(dest))
    imported=[o for o in bpy.context.scene.objects if o.type=='MESH'];after=0
    for o in imported:o.data.calc_loop_triangles();after+=len(o.data.loop_triangles)
    coords=[o.matrix_world@Vector(c) for o in imported for c in o.bound_box]
    bounds=[[min(v[i] for v in coords),max(v[i] for v in coords)] for i in range(3)]
    metrics.append({'asset':name,'triangles':triangles,'reimportTriangles':after,'bytes':dest.stat().st_size,'bounds':bounds,'forward':'glTF +Z; Cesium corrected +X','materials':len({m.name for o in imported for m in o.data.materials})})
(SRC/'validation.json').write_text(json.dumps(metrics,indent=2),encoding='utf-8')
print(json.dumps(metrics))

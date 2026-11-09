import * as C from 'cesium';
const decoder=new TextDecoder();

// Read only uncompressed, embedded GLB accessors. Never estimate geometry from
// a bounding sphere or transform height/XY during the measurement.
export function decodeOfficialGlb(buffer,{tileTransform=C.Matrix4.IDENTITY}={}){
  const view=new DataView(buffer);
  if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2)throw new Error('官方 content 不是 GLB 2.0');
  const jsonLength=view.getUint32(12,true),gltf=JSON.parse(decoder.decode(new Uint8Array(buffer,20,jsonLength)).trim());
  const binaryStart=20+jsonLength+8;
  if(view.getUint32(20+jsonLength+4,true)!==0x004e4942)throw new Error('GLB 缺少內嵌 binary chunk');
  const bytes=(index)=>{const item=gltf.bufferViews[index];if(!item||item.buffer!==0)throw new Error('不支援外部 accessor buffer');return new Uint8Array(buffer,binaryStart+(item.byteOffset||0),item.byteLength);};
  const numeric=(accessor,index,axis=0)=>{
    const a=gltf.accessors[accessor],item=gltf.bufferViews[a.bufferView];
    if(a.sparse||item.buffer!==0)throw new Error('不支援 sparse/external accessor，未猜测頂點');
    const size={5121:1,5123:2,5125:4,5126:4}[a.componentType],components={SCALAR:1,VEC3:3}[a.type];
    if(!size||!components)throw new Error('不支援此 accessor 的格式');
    const offset=binaryStart+(item.byteOffset||0)+(a.byteOffset||0)+index*(item.byteStride||size*components)+axis*size;
    return a.componentType===5121?view.getUint8(offset):a.componentType===5123?view.getUint16(offset,true):a.componentType===5125?view.getUint32(offset,true):view.getFloat32(offset,true);
  };
  const propertyTables=gltf.extensions?.EXT_structural_metadata?.propertyTables||[];
  function properties(tableIndex,id){
    const table=propertyTables[tableIndex],result={};if(!table||id>=table.count)return result;
    for(const [name,property] of Object.entries(table.properties||{})){
      if(property.stringOffsets===undefined)continue;
      const offsets=bytes(property.stringOffsets),offsetView=new DataView(offsets.buffer,offsets.byteOffset,offsets.byteLength);
      if(property.stringOffsetType&&property.stringOffsetType!=='UINT32')continue;
      const start=offsetView.getUint32(id*4,true),end=offsetView.getUint32((id+1)*4,true);
      result[name]=decoder.decode(bytes(property.values).subarray(start,end));
    }
    return result;
  }
  const yUpToZ=C.Matrix4.fromRotationTranslation(C.Matrix3.fromRotationX(Math.PI/2));
  const axis=C.Matrix4.multiply(tileTransform,yUpToZ,new C.Matrix4()),groups=new Map();
  function walkNode(index,parent=C.Matrix4.IDENTITY){
    const node=gltf.nodes[index],local=node.matrix?C.Matrix4.fromArray(node.matrix):C.Matrix4.fromTranslationQuaternionRotationScale(C.Cartesian3.fromArray(node.translation||[0,0,0]),C.Quaternion.unpack(node.rotation||[0,0,0,1]),C.Cartesian3.fromArray(node.scale||[1,1,1]));
    const matrix=C.Matrix4.multiply(parent,local,new C.Matrix4()),world=C.Matrix4.multiply(axis,matrix,new C.Matrix4());
    if(node.mesh!==undefined){
      for(const primitive of gltf.meshes[node.mesh].primitives){
        if(primitive.extensions?.KHR_draco_mesh_compression)throw new Error('不支援壓縮模型，需用 Cesium 真實幾何取樣');
        const feature=primitive.extensions?.EXT_mesh_features?.featureIds?.find(value=>value.attribute!==undefined),featureAccessor=feature?primitive.attributes[`_FEATURE_ID_${feature.attribute}`]:undefined;
        const positionAccessor=primitive.attributes.POSITION,a=gltf.accessors[positionAccessor];
        if(a.componentType!==5126||a.type!=='VEC3')throw new Error('POSITION 不是未壓縮 Float32 VEC3');
        for(let index=0;index<a.count;index++){
          const id=featureAccessor===undefined?0:numeric(featureAccessor,index),table=feature?.propertyTable??0,key=`${table}:${id}`;
          if(!groups.has(key))groups.set(key,{featureId:id,propertyTable:table,metadata:properties(table,id),vertices:[]});
          const localPoint=new C.Cartesian3(numeric(positionAccessor,index,0),numeric(positionAccessor,index,1),numeric(positionAccessor,index,2));
          const c=C.Cartographic.fromCartesian(C.Matrix4.multiplyByPoint(world,localPoint,new C.Cartesian3()));
          groups.get(key).vertices.push({lon:C.Math.toDegrees(c.longitude),lat:C.Math.toDegrees(c.latitude),height:c.height});
        }
      }
    }
    for(const child of node.children||[])walkNode(child,matrix);
  }
  for(const index of gltf.scenes[gltf.scene||0].nodes)walkNode(index);
  const buildings=[...groups.values()].map(group=>{
    const lons=group.vertices.map(p=>p.lon),lats=group.vertices.map(p=>p.lat),heights=group.vertices.map(p=>p.height),west=Math.min(...lons),east=Math.max(...lons),south=Math.min(...lats),north=Math.max(...lats),center=[(west+east)/2,(south+north)/2];
    const e=Number(group.metadata.CENT_E_97),n=Number(group.metadata.CENT_N_97),declaredCenter=null;
    return {...group,baseHeight:Math.min(...heights),roofHeight:Math.max(...heights),bounds:{west,east,south,north},center,declaredCenter,centerDifference:declaredCenter?C.Cartesian3.distance(C.Cartesian3.fromDegrees(...center),C.Cartesian3.fromDegrees(...declaredCenter)):null};
  });
  return {asset:gltf.asset,extensionsUsed:gltf.extensionsUsed,buildings};
}

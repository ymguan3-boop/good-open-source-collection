import * as Cesium from 'cesium';

/** Original local GLB. minimumPixelSize only enhances the placement preview;
 * the real body stays 1.26 m wide and the collision radius stays 1 m. Never use
 * the visually enlarged model's bounding sphere as the physical collision body.
 */
export function createAerialDrone({viewer,url='/models/taiwan-drone.glb'}){
  let entity=null,position=null;const quaternion=new Cesium.Quaternion();
  function place(cartesian,heading=0){position=Cesium.Cartesian3.clone(cartesian);if(!entity)entity=viewer.entities.add({name:'空拍無人機',position,model:{uri:url,scale:1,minimumPixelSize:48,maximumScale:80,runAnimations:true},label:{text:'無人機（可拖曳）',font:'14px sans-serif',fillColor:Cesium.Color.CYAN,outlineColor:Cesium.Color.BLACK,outlineWidth:2,style:Cesium.LabelStyle.FILL_AND_OUTLINE,showBackground:true,pixelOffset:new Cesium.Cartesian2(0,-34),disableDepthTestDistance:Number.POSITIVE_INFINITY},properties:{aerialDrone:true,collisionExcluded:true,physicalCollisionRadius:1,previewMinimumPixels:48}});entity.position=position;entity.orientation=Cesium.Transforms.headingPitchRollQuaternion(position,new Cesium.HeadingPitchRoll(heading-Math.PI/2,0,0),Cesium.Ellipsoid.WGS84,Cesium.Transforms.eastNorthUpToFixedFrame,quaternion);entity.show=true;viewer.scene.requestRender();return entity;}
  return {place,move:place,show(value=true){if(entity)entity.show=value;},get entity(){return entity;},get position(){return position;},get collisionRadius(){return 1;},destroy(){if(entity)viewer.entities.remove(entity);entity=null;position=null;}};
}

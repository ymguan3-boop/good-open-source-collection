import * as Cesium from 'cesium';

// Match the original moving-dot presentation. These are flow illustrations,
// driven by the measured speed ratio, rather than individual vehicle tracks.
export function createTrafficDots(viewer){
  const points=viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());let dots=[],last=0,visible=true,elapsed=0;
  function replace(segments){
    points.removeAll();dots=[];
    const moving=segments.filter(s=>!s.closure&&s.coords.length>1);
    const step=Math.max(1,Math.ceil(moving.length/800));
    for(let i=0;i<moving.length;i+=step){
      const segment=moving[i],coords=segment.coords,lengths=[0],heights=[];
      for(let k=0;k<coords.length;k++){
        const [lon,lat]=coords[k],c=Cesium.Cartographic.fromDegrees(lon,lat);
        // Terrain height lookup is CPU-only; synchronous scene.sampleHeight
        // reads the GPU for every vertex and freezes dense street views.
        heights.push((viewer.scene.globe.getHeight(c)||0)+2);
        if(k){const a=coords[k-1];lengths.push(lengths[k-1]+Math.hypot((lon-a[0])*111320*Math.cos(lat*Math.PI/180),(lat-a[1])*110540));}
      }
      const length=lengths.at(-1);if(length<5)continue;
      const color=Cesium.Color.fromCssColorString(segment.trafficLevel<.4?'#ff5c54':segment.trafficLevel<.75?'#ffd45c':'#70ffc7');
      const base=/(motorway|freeway|trunk)/i.test(segment.roadType)?24:12;
      const point=points.add({position:Cesium.Cartesian3.fromDegrees(coords[0][0],coords[0][1],heights[0]),pixelSize:4,color,outlineColor:Cesium.Color.BLACK.withAlpha(.7),outlineWidth:1,disableDepthTestDistance:Number.POSITIVE_INFINITY});
      dots.push({coords,lengths,heights,length,speed:base*segment.trafficLevel,distance:(i*.61803398875%1)*length,point});
    }
    last=0;viewer.scene.requestRender();return dots.length;
  }
  const remove=viewer.scene.preUpdate.addEventListener(()=>{
    const now=performance.now();if(!visible||!dots.length){last=now;return;}
    const dt=last?Math.min(.15,(now-last)/1000):0;last=now;elapsed+=dt;if(elapsed<1/24)return;const tick=elapsed;elapsed=0;
    for(const dot of dots){
      dot.distance=(dot.distance+dot.speed*tick)%dot.length;let k=1;while(k<dot.lengths.length-1&&dot.lengths[k]<dot.distance)k++;
      const t=(dot.distance-dot.lengths[k-1])/Math.max(.001,dot.lengths[k]-dot.lengths[k-1]),a=dot.coords[k-1],b=dot.coords[k];
      dot.point.position=Cesium.Cartesian3.fromDegrees(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,dot.heights[k-1]+(dot.heights[k]-dot.heights[k-1])*t);
    }
    viewer.scene.requestRender();
  });
  const timer=setInterval(()=>{if(visible&&dots.length)viewer.scene.requestRender();},1000/24);
  return {replace,setVisibility(value){visible=value;points.show=value;last=0;},dispose(){clearInterval(timer);remove();viewer.scene.primitives.remove(points);dots=[];}};
}

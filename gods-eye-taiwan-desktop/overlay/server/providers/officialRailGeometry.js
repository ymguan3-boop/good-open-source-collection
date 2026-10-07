import {readFile} from 'node:fs/promises';
const distance=(a,b)=>Math.hypot((a[0]-b[0])*100900,(a[1]-b[1])*111200);
/** Public NLSC rail geometry is a corridor illustration, never a live track assignment. */
export function createOfficialRailGeometry(){
 let loading;
 async function graph(){
  if(!loading)loading=(async()=>{
   const data=JSON.parse(await readFile(new URL('../../src/taiwan/data/taiwan-rail.geojson',import.meta.url),'utf8'));
   const nodes=[],edges=[],ids=new Map(),adj=[];
   function node(p){const key=p.slice(0,2).map(v=>v.toFixed(6)).join(',');if(ids.has(key))return ids.get(key);const id=nodes.length;ids.set(key,id);nodes.push(p.slice(0,2));adj.push([]);return id;}
   function edge(a,b){const w=distance(nodes[a],nodes[b]);if(a===b||w<=0)return;adj[a].push([b,w]);adj[b].push([a,w]);edges.push([a,b,w]);}
   const ends=new Set();
   for(const f of data.features){if(f.properties?.railCategory!=='臺灣鐵路'||/林業|糖業|專用/.test(f.properties.RAILNAME||''))continue;
    const lines=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.type==='MultiLineString'?f.geometry.coordinates:[];
    for(const line of lines){if(line.length<2)continue;const indices=line.map(node);ends.add(indices[0]);ends.add(indices.at(-1));for(let i=1;i<indices.length;i++)edge(indices[i-1],indices[i]);}
   }
   // Join surveyed line endpoints only within 15 m. Never bridge an arbitrary missing corridor.
   const grid=new Map(),cell=p=>[Math.floor(p[0]*100900/15),Math.floor(p[1]*111200/15)];
   for(const id of ends){const [x,y]=cell(nodes[id]);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const other of grid.get(`${x+dx},${y+dy}`)||[])if(distance(nodes[id],nodes[other])<=15)edge(id,other);const key=`${x},${y}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(id);}
   return {nodes,edges,adj,metadata:data.metadata};
  })();return loading;
 }
 async function route(from,to,stops=[],signal){
  const g=await graph();signal?.throwIfAborted();
  function snap(point){let best=null;for(const [a,b,w] of g.edges){const A=g.nodes[a],B=g.nodes[b],dx=(B[0]-A[0])*100900,dy=(B[1]-A[1])*111200,t=Math.max(0,Math.min(1,((point.lon-A[0])*100900*dx+(point.lat-A[1])*111200*dy)/(w*w))),p=[A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t],gap=distance(p,[point.lon,point.lat]);if(!best||gap<best.gap)best={a,b,w,t,p,gap};}return best?.gap<=250?best:null;}
  function shortest(a,b){
   if(a.a===b.a&&a.b===b.b)return [a.p,b.p];
   const costs=new Float64Array(g.nodes.length).fill(Infinity),previous=new Int32Array(g.nodes.length).fill(-1),heap=[];
   function push(id,cost){let i=heap.length;heap.push([id,cost]);while(i){const parent=(i-1)>>1;if(heap[parent][1]<=cost)break;heap[i]=heap[parent];i=parent;}heap[i]=[id,cost];}
   function pop(){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1][1]<heap[child][1])child++;if(heap[child][1]>=last[1])break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;}
   for(const [id,cost] of [[a.a,a.w*a.t],[a.b,a.w*(1-a.t)]]){costs[id]=cost;push(id,cost);}
   let end=-1,total=Infinity;
   while(heap.length){const [id,cost]=pop();if(cost!==costs[id])continue;if(cost>total)break;
    for(const [target,extra] of [[b.a,b.w*b.t],[b.b,b.w*(1-b.t)]])if(id===target&&cost+extra<total){end=id;total=cost+extra;}
    for(const [next,w] of g.adj[id])if(cost+w<costs[next]){costs[next]=cost+w;previous[next]=id;push(next,cost+w);}
   }
   if(end<0)return null;const path=[];for(let id=end;id>=0;id=previous[id])path.push(g.nodes[id]);return [a.p,...path.reverse(),b.p];
  }
  const points=[from,...stops,to],snaps=points.map(snap);if(snaps.some(p=>!p))return null;
  const coordinates=[];for(let i=1;i<snaps.length;i++){signal?.throwIfAborted();const leg=shortest(snaps[i-1],snaps[i]);if(!leg)return null;coordinates.push(...(i===1?leg:leg.slice(1)));}
  if(coordinates.length<2)return null;
  return {geometry:{type:'LineString',coordinates},geometryStatus:'ready',geometrySource:'NLSC 官方鐵路路廊（依官方班表停站順序串接；非營運股道或即時位置）',geometryUpdatedAt:g.metadata.downloadedAt,geometrySourceUrl:'https://data.gov.tw/dataset/73220'};
 }
 return {route};
}

// Only verified TDX Shape lines and TomTom pedestrian/bicycle paths are used.
const normal=value=>String(value||'').replaceAll('臺','台').replace(/(?:火車站|車站|站)$/,'').trim();
const distance=(a,b)=>Math.hypot((a[0]-b[0])*111320*Math.cos((a[1]+b[1])*Math.PI/360),(a[1]-b[1])*110540);
export function parseTdxWkt(text){
  if(typeof text!=='string'||text.length>4000000)return [];
  const wkt=text.trim().replace(/^SRID=4326;/i,'');let sections;
  if(/^LINESTRING\s*\(/i.test(wkt))sections=[wkt.replace(/^LINESTRING\s*\(/i,'').replace(/\)\s*$/,'')];
  else if(/^MULTILINESTRING\s*\(\(/i.test(wkt))sections=wkt.replace(/^MULTILINESTRING\s*\(\(/i,'').replace(/\)\)\s*$/,'').split(/\)\s*,\s*\(/);
  else return [];
  const lines=sections.map(s=>s.split(',').map(p=>p.trim().split(/\s+/).map(Number).slice(0,2)));
  return lines.filter(points=>points.length>=2&&points.length<100000&&points.every(p=>p.length===2&&p.every(Number.isFinite)&&p[0]>=117&&p[0]<=123.5&&p[1]>=20&&p[1]<=27));
}
// Join only the exact shared endpoints of official MULTILINESTRING pieces.
// A branch, gap or parallel choice is never bridged or guessed.
export function joinTdxShapeParts(lines){
  const parts=lines.map(points=>points.map(p=>[...p]));
  const key=p=>`${p[0]},${p[1]}`;
  for(;;){
    const ends=new Map();
    parts.forEach((p,i)=>{for(const side of [0,1]){const k=key(side?p.at(-1):p[0]);if(!ends.has(k))ends.set(k,[]);ends.get(k).push({i,side});}});
    const pair=[...ends.values()].find(matches=>{if(matches.length!==2||matches[0].i===matches[1].i)return false;const a=parts[matches[0].i],b=parts[matches[1].i];return ![key(a[0]),key(a.at(-1))].every(k=>[key(b[0]),key(b.at(-1))].includes(k));});
    if(!pair)break;
    const [a,b]=pair,left=a.side?parts[a.i]:[...parts[a.i]].reverse(),right=b.side?[...parts[b.i]].reverse():parts[b.i],joined=[...left,...right.slice(1)];
    const hi=Math.max(a.i,b.i),lo=Math.min(a.i,b.i);parts.splice(hi,1);parts.splice(lo,1,joined);
  }
  return parts;
}
function project(points,position){
  let best=null;const cos=Math.cos(position[1]*Math.PI/180),scaleX=111320*cos,scaleY=110540;
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],dx=(b[0]-a[0])*scaleX,dy=(b[1]-a[1])*scaleY,x=(position[0]-a[0])*scaleX,y=(position[1]-a[1])*scaleY;
    const t=Math.max(0,Math.min(1,(x*dx+y*dy)/(dx*dx+dy*dy||1))),point=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],gap=distance(position,point),index=i+t;
    if(!best||gap<best.gap)best={point,gap,index};
  }return best;
}
export function clipTdxShape(lines,from,to,stops=[],maxGap=150,{allowParallel=false}={}){
  const candidates=[];
  for(const points of joinTdxShapeParts(lines)){
    const start=project(points,[from.lon,from.lat]),end=project(points,[to.lon,to.lat]);
    if(!start||!end||start.gap>maxGap||end.gap>maxGap||Math.abs(end.index-start.index)<.000001)continue;
    const direction=Math.sign(end.index-start.index),intermediate=stops.map(p=>project(points,[p.lon,p.lat]));
    if(intermediate.some(p=>!p||p.gap>maxGap||(p.index-start.index)*direction<0||(end.index-p.index)*direction<0))continue;
    if(intermediate.some((p,i)=>i&&(p.index-intermediate[i-1].index)*direction<-.001))continue;
    let result;if(direction>0)result=[start.point,...points.slice(Math.floor(start.index)+1,Math.ceil(end.index)),end.point];
    else result=[start.point,...points.slice(Math.floor(end.index)+1,Math.ceil(start.index)).reverse(),end.point];
    result=result.filter((p,i)=>!i||distance(p,result[i-1])>.01);
    if(result.length>=2)candidates.push({type:'LineString',coordinates:result});
  }
  if(candidates.length===1)return candidates[0];
  // Parallel tracks may share one verified line and ordered stations. Choose
  // an existing official line only when all candidates occupy the same corridor.
  // Divergent branches and large/unbounded comparisons remain unresolved.
  if(allowParallel&&candidates.length>1&&candidates.length<=4){
    const reference=candidates[0].coordinates;
    const length=points=>points.slice(1).reduce((n,p,i)=>n+distance(p,points[i]),0),baseline=length(reference);
    const equivalent=candidates.every(({coordinates})=>reference.length<=2000&&coordinates.length<=2000&&baseline>0&&Math.abs(length(coordinates)-baseline)/baseline<=.03&&distance(reference[0],coordinates[0])<=25&&distance(reference.at(-1),coordinates.at(-1))<=25&&coordinates.every(p=>project(reference,p)?.gap<=25)&&reference.every(p=>project(coordinates,p)?.gap<=25));
    if(equivalent)return {...candidates[0],illustrativeCorridor:true};
  }
  return null;
}
const cities={臺北市:'Taipei',台北市:'Taipei',新北市:'NewTaipei',桃園市:'Taoyuan',臺中市:'Taichung',台中市:'Taichung',臺南市:'Tainan',台南市:'Tainan',高雄市:'Kaohsiung',基隆市:'Keelung',新竹市:'Hsinchu',新竹縣:'HsinchuCounty',苗栗縣:'MiaoliCounty',彰化縣:'ChanghuaCounty',南投縣:'NantouCounty',雲林縣:'YunlinCounty',嘉義縣:'ChiayiCounty',嘉義市:'Chiayi',屏東縣:'PingtungCounty',宜蘭縣:'YilanCounty',花蓮縣:'HualienCounty',臺東縣:'TaitungCounty',台東縣:'TaitungCounty',金門縣:'KinmenCounty',澎湖縣:'PenghuCounty',連江縣:'LienchiangCounty'};
const byName=(name,p,rows)=>rows.filter(s=>normal(name(s))===normal(p.name)&&distance([Number(s.StationPosition?.PositionLon??s.StopPosition?.PositionLon),Number(s.StationPosition?.PositionLat??s.StopPosition?.PositionLat)],[p.lon,p.lat])<250);

export function createTdxGeometry({basic,credential,fetcher=fetch,signal,ttl}){
  async function bikeIdentity(segment){
    const city=cities[segment.city]||(['Taipei','NewTaipei','Taoyuan','Taichung','Tainan','Kaohsiung'].includes(segment.city)?segment.city:null);if(!city)return;
    const rows=await basic(`/v2/Bike/Station/City/${city}`,ttl.stations,signal,{'$top':3000});
    const match=p=>rows.filter(r=>normal(r.StationName?.Zh_tw)===normal(p.name)&&distance([r.StationPosition?.PositionLon,r.StationPosition?.PositionLat],[p.lon,p.lat])<100);
    const a=match(segment.from),b=match(segment.to);if(a.length!==1||b.length!==1)return;
    const region={Taipei:'taipei',NewTaipei:'newtaipei',Taoyuan:'taoyuan',Taichung:'taichung',Tainan:'tainan',Kaohsiung:'kaohsiung'}[city];
    // Station identity establishes the operator/region, not the chosen bicycle.
    if(!region||![a[0],b[0]].every(r=>/^YouBike2\.0/.test(r.StationName?.Zh_tw||'')))return;
    segment.bikeRegion=region;segment.to.bikeRegion=region;segment.bikeSystems=['YouBike 2.0'];segment.agency='YouBike';segment.from.id=a[0].StationUID;segment.to.id=b[0].StationUID;
  }
  async function walking(segment){
    const key=credential('TOMTOM_API_KEY');if(!key)return false;
    const url=new URL(`https://api.tomtom.com/routing/1/calculateRoute/${segment.from.lat},${segment.from.lon}:${segment.to.lat},${segment.to.lon}/json`);
    Object.entries({key,travelMode:segment.mode==='BIKE'?'bicycle':'pedestrian',routeType:'shortest',traffic:false}).forEach(([k,v])=>url.searchParams.set(k,String(v)));
    const response=await fetcher(url.href,{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)].filter(Boolean))});
    if(!response.ok){await response.body?.cancel();return false;}
    const data=await response.json(),points=data.routes?.[0]?.legs?.flatMap(l=>l.points||[]).map(p=>[p.longitude,p.latitude]);
    if(!points||points.length<2||points.length>50000||!points.every(p=>p.every(Number.isFinite)))return false;
    if(distance(points[0],[segment.from.lon,segment.from.lat])>100||distance(points.at(-1),[segment.to.lon,segment.to.lat])>100)return false;
    segment.geometry={type:'LineString',coordinates:points};segment.geometryStatus='ready';segment.geometrySource='TomTom 步行／自行車實際路線';segment.geometryUpdatedAt=new Date().toISOString();return true;
  }
  async function rail(segment,system){
    const prefix=system?`/v2/Rail/Metro`:`/v2/Rail/${segment.mode==='HSR'?'THSR':'TRA'}`,suffix=system?`/${system}`:'';
    const stationRows=await basic(`${prefix}/Station${suffix}`,ttl.stations,signal,{'$top':500});
    const origins=byName(s=>s.StationName?.Zh_tw,segment.from,stationRows),destinations=byName(s=>s.StationName?.Zh_tw,segment.to,stationRows);
    if(!origins.length||!destinations.length)return false;
    if(origins.length===1&&destinations.length===1){segment.railSystem=system||segment.mode;segment.from.id=origins[0].StationID;segment.to.id=destinations[0].StationID;}
    const lines=await basic(`${prefix}/StationOfLine${suffix}`,ttl.stations,signal,{'$top':500});
    const matched=[];
    for(const origin of origins)for(const destination of destinations)for(const line of lines)if(line.Stations?.some(s=>s.StationID===origin.StationID)&&line.Stations?.some(s=>s.StationID===destination.StationID))matched.push({line,origin,destination});
    if(!matched.length)return false;
    const identities=new Map(matched.map(m=>[`${m.origin.StationID}/${m.destination.StationID}`,m]));if(identities.size===1){const m=[...identities.values()][0];segment.railSystem=system||segment.mode;segment.from.id=m.origin.StationID;segment.to.id=m.destination.StationID;}
    const shapes=await basic(`${prefix}/Shape${suffix}`,ttl.stations,signal,{'$top':500}),geometries=[];
    for(const {line,origin,destination} of matched){
      const ordered=[...line.Stations].sort((a,b)=>(a.Sequence??a.StationSequence??0)-(b.Sequence??b.StationSequence??0)),a=ordered.findIndex(s=>s.StationID===origin.StationID),b=ordered.findIndex(s=>s.StationID===destination.StationID);
      if(a===b)continue;
      const between=ordered.slice(Math.min(a,b),Math.max(a,b)+1);if(a>b)between.reverse();
      const names=between.map(s=>normal(s.StationName?.Zh_tw));
      // A line containing both endpoints must also contain every returned MaaS
      // intermediate stop in travel order. Branch ambiguities remain missing.
      let last=-1,valid=true;for(const stop of segment.intermediateStops||[]){const next=names.findIndex((n,i)=>i>last&&n===normal(stop.name));if(next<0){valid=false;break;}last=next;}if(!valid)continue;
      for(const shape of shapes.filter(s=>s.LineID===line.LineID)){
        const geometry=clipTdxShape(parseTdxWkt(shape.Geometry),segment.from,segment.to,segment.intermediateStops||[],250,{allowParallel:true});
        if(geometry)geometries.push({geometry,shape,origin,destination});
      }
    }
    const unique=new Map(geometries.map(g=>[JSON.stringify(g.geometry),g]));if(unique.size!==1)return false;
    const chosen=[...unique.values()][0];Object.assign(segment,{geometry:chosen.geometry,geometryStatus:'ready',geometrySource:`TDX ${system||segment.mode} Shape（${chosen.geometry.illustrativeCorridor?'同線平行軌道路廊示意，非實際營運股道':'依站點與路線核實'}）`,geometryUpdatedAt:chosen.shape.UpdateTime||null,railSystem:system||segment.mode});
    segment.from.id=chosen.origin.StationID;segment.to.id=chosen.destination.StationID;return true;
  }
  async function bus(segment){
    const city=cities[segment.city],intercity=/HighwayBus/i.test(segment.transportType);
    if(!city&&!intercity)return false;
    const route=segment.routeName.replace(/[去返]$/,'').trim();if(!route||route.length>100)return false;
    const suffix=intercity?`InterCity/${encodeURIComponent(route)}`:`City/${city}/${encodeURIComponent(route)}`;
    const rows=await basic(`/v2/Bus/StopOfRoute/${suffix}`,ttl.stations,signal,{'$top':100});
    const matches=[];
    const exactSubroutes=rows.filter(row=>normal(row.SubRouteName?.Zh_tw)===normal(route));
    for(const row of (exactSubroutes.length?exactSubroutes:rows)){
      if(![row.RouteName?.Zh_tw,row.SubRouteName?.Zh_tw].some(n=>normal(n)===normal(route)))continue;
      const stops=[...(row.Stops||[])].sort((a,b)=>a.StopSequence-b.StopSequence),origins=byName(s=>s.StopName?.Zh_tw,segment.from,stops),destinations=byName(s=>s.StopName?.Zh_tw,segment.to,stops);
      if(origins.length!==1||destinations.length!==1||origins[0].StopSequence>=destinations[0].StopSequence)continue;
      const between=stops.filter(s=>s.StopSequence>=origins[0].StopSequence&&s.StopSequence<=destinations[0].StopSequence);let last=-1,valid=true;
      for(const stop of segment.intermediateStops||[]){const i=between.findIndex((s,j)=>j>last&&normal(s.StopName?.Zh_tw)===normal(stop.name));if(i<0){valid=false;break;}last=i;}
      if(valid)matches.push({row,origin:origins[0],destination:destinations[0]});
    }
    if(matches.length!==1)return false;
    const match=matches[0];
    Object.assign(segment,{routeId:match.row.RouteID,subRouteId:match.row.SubRouteID,operatorId:match.row.Operators?.find(o=>normal(o.OperatorName?.Zh_tw)===normal(segment.agency))?.OperatorID||(match.row.Operators?.length===1?match.row.Operators[0].OperatorID:null),routeUid:match.row.RouteUID,subRouteUid:match.row.SubRouteUID,direction:match.row.Direction,busCity:city||null});
    segment.from.id=match.origin.StopUID;segment.to.id=match.destination.StopUID;segment.from.stopId=match.origin.StopID;segment.to.stopId=match.destination.StopID;segment.from.stopSequence=match.origin.StopSequence;segment.to.stopSequence=match.destination.StopSequence;segment.busStops=match.row.Stops.map(s=>({id:s.StopID,sequence:s.StopSequence}));
    const shapes=await basic(`/v2/Bus/Shape/${suffix}`,ttl.stations,signal,{'$top':100}),results=[];
    for(const shape of shapes.filter(s=>s.RouteUID===match.row.RouteUID&&s.SubRouteUID===match.row.SubRouteUID&&s.Direction===match.row.Direction)){
      const geometry=clipTdxShape(parseTdxWkt(shape.Geometry),segment.from,segment.to,segment.intermediateStops||[],120);if(geometry)results.push({shape,geometry});
    }
    if(results.length!==1)return false;
    Object.assign(segment,{geometry:results[0].geometry,geometryStatus:'ready',geometrySource:'TDX 公車 Shape（依路線、方向、站序核實）',geometryUpdatedAt:results[0].shape.UpdateTime||null,routeId:match.row.RouteID,subRouteId:match.row.SubRouteID,operatorId:match.row.Operators?.find(o=>normal(o.OperatorName?.Zh_tw)===normal(segment.agency))?.OperatorID||(match.row.Operators?.length===1?match.row.Operators[0].OperatorID:null),routeUid:match.row.RouteUID,subRouteUid:match.row.SubRouteUID,direction:match.row.Direction,busCity:city||null});
    segment.from.id=match.origin.StopUID;segment.to.id=match.destination.StopUID;segment.from.stopId=match.origin.StopID;segment.to.stopId=match.destination.StopID;segment.from.stopSequence=match.origin.StopSequence;segment.to.stopSequence=match.destination.StopSequence;segment.busStops=match.row.Stops.map(s=>({id:s.StopID,sequence:s.StopSequence}));
    return true;
  }
  async function enrich(segment){
    signal?.throwIfAborted();
    try{
      if(['WALK','BIKE'].includes(segment.mode)){if(segment.mode==='BIKE')await bikeIdentity(segment);return await walking(segment);}
      if(['TRA','HSR'].includes(segment.mode))return await rail(segment);
      if(segment.mode==='BUS')return await bus(segment);
      if(['METRO','LRT'].includes(segment.mode)){
        // Candidates are only search bounds. Acceptance uses real station/line
        // identity, never city proximity alone.
        const systems=segment.mode==='LRT'?(segment.from.lat<23?['KLRT']:['NTDLRT','NTALRT']):segment.from.lat<23?['KRTC']:segment.from.lat<24.7?['TMRT']:['TRTC','TYMC','NTMC'];
        const original={system:segment.railSystem,from:segment.from.id,to:segment.to.id},identities=[];
        for(const system of systems){
          segment.railSystem=original.system;segment.from.id=original.from;segment.to.id=original.to;
          if(await rail(segment,system))return true;
          if(segment.railSystem===system&&segment.from.id&&segment.to.id)identities.push({system,from:segment.from.id,to:segment.to.id});
        }
        const unique=new Map(identities.map(i=>[`${i.system}/${i.from}/${i.to}`,i])),chosen=unique.size===1?[...unique.values()][0]:original;
        segment.railSystem=chosen.system;segment.from.id=chosen.from;segment.to.id=chosen.to;
      }
    }catch{signal?.throwIfAborted();}
    return false;
  }
  return {enrich};
}

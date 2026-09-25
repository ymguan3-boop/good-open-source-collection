#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import json, math, os, time
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import pandas as pd
import requests
import rasterio
from pyproj import Transformer
from rasterio.features import geometry_mask, rasterize
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from scipy import ndimage
from shapely.geometry import LineString, Polygon, box, mapping, shape
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parents[2]
TASK_ID = "yilan-green-fragmentation-2020-2024"
MANIFEST = Path(os.environ.get("GEOLIBRE_TASK_MANIFEST", ROOT / "GeoLibre-Web/tasks/current-task.json"))
OUT = Path(os.environ.get("GEOLIBRE_OUTPUT_DIR", ROOT / "GeoLibre-Web/analysis" / TASK_ID))
OUT.mkdir(parents=True, exist_ok=True)

YEARS = [2020, 2021, 2022, 2023, 2024]
RES = 30.0
GRID = 1000.0
SMALL_HA = 2.0
LARGE_HA = 10.0
RIPARIAN_M = 100.0

CLS = {"water":1, "trees":2, "flooded":4, "crops":5, "built":7, "bare":8, "snow":9, "clouds":10, "rangeland":11}
VEG = {2,4,5,11}
STAC = "https://api.impactobservatory.com/stac-aws"
COLL = "io-10m-annual-lulc"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
OVERPASS = ["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"]
FALLBACK = (121.20,24.30,122.10,25.10)
S = requests.Session()
S.headers.update({"User-Agent":"GeoLibre-Green-Fragmentation/1.0"})
TO3826 = Transformer.from_crs("EPSG:4326","EPSG:3826",always_xy=True)
TO4326 = Transformer.from_crs("EPSG:3826","EPSG:4326",always_xy=True)
notes, subs, sources = [], [], []

def log(x): print("[green-fragmentation]", x, flush=True)

def get_json(url, **kw):
    r=S.get(url, timeout=kw.pop("timeout",60), **kw); r.raise_for_status(); return r.json()

def post_json(url, payload, timeout=90):
    r=S.post(url,json=payload,timeout=timeout); r.raise_for_status(); return r.json()

def boundary():
    try:
        d=get_json(NOMINATIM,params={"q":"宜蘭縣, 台灣","format":"geojson","polygon_geojson":1,"limit":1,"countrycodes":"tw"})
        f=d.get("features",[])
        if f:
            g=shape(f[0]["geometry"])
            if not g.is_empty:
                sources.append({"name":"OpenStreetMap Nominatim","role":"宜蘭縣界","url":NOMINATIM}); return g
    except Exception as e: notes.append("縣界查詢失敗："+str(e))
    subs.append("縣界查詢失敗，改用宜蘭縣保守外接矩形。")
    return box(*FALLBACK)

def stac_items(year,bbox):
    payload={"collections":[COLL],"bbox":list(bbox),"datetime":f"{year}-01-01T00:00:00Z/{year}-12-31T23:59:59Z","limit":100}
    errs=[]
    try:
        f=post_json(STAC+"/search",payload).get("features",[])
        if f:return f
    except Exception as e: errs.append("POST "+str(e))
    try:
        p={"bbox":",".join(map(str,bbox)),"datetime":f"{year}-01-01T00:00:00Z/{year}-12-31T23:59:59Z","limit":100}
        f=get_json(STAC+f"/collections/{COLL}/items",params=p,timeout=90).get("features",[])
        if f:return f
    except Exception as e: errs.append("GET "+str(e))
    notes.append(f"{year} STAC 查詢改用臺灣 51R 公開 S3 檔名規則："+ " | ".join(errs))
    return [{"id":f"51R-{year}-fallback","assets":{"data":{"href":f"https://s3.us-west-2.amazonaws.com/io-10m-annual-lulc/51R_{year}.tif"}}}]

def href(item):
    a=item.get("assets",{}); h=None
    for k in ("data","image","lulc","visual"):
        if k in a and a[k].get("href"): h=a[k]["href"]; break
    if not h:
        for v in a.values():
            c=v.get("href") if isinstance(v,dict) else None
            if c and c.lower().endswith((".tif",".tiff")): h=c; break
    if not h: raise RuntimeError("STAC item 無 GeoTIFF")
    if h.startswith("s3://"):
        b,_,k=h[5:].partition("/"); h=f"https://s3.us-west-2.amazonaws.com/{b}/{k}"
    return h

def target_grid(g):
    a,b,c,d=g.bounds
    a=math.floor(a/RES)*RES; b=math.floor(b/RES)*RES
    c=math.ceil(c/RES)*RES; d=math.ceil(d/RES)*RES
    w=int(round((c-a)/RES)); h=int(round((d-b)/RES))
    return from_origin(a,d,RES,RES),w,h,(a,b,c,d)

def read_year(year,bbox,tr,w,h):
    out=np.zeros((h,w),np.uint8); ok=0; errs=[]
    for it in stac_items(year,bbox):
        try:
            u=href(it)
            with rasterio.Env(GDAL_HTTP_MAX_RETRY="3",GDAL_HTTP_RETRY_DELAY="2"):
                with rasterio.open(u) as src:
                    tmp=np.zeros_like(out)
                    reproject(rasterio.band(src,1),tmp,src_transform=src.transform,src_crs=src.crs,src_nodata=src.nodata,
                              dst_transform=tr,dst_crs="EPSG:3826",dst_nodata=0,resampling=Resampling.nearest,num_threads=2)
                    q=tmp!=0; out[q]=tmp[q]; ok+=1
                    sources.append({"name":f"Impact Observatory 10m Annual LULC {year}","role":"年度土地覆蓋","url":u,"item_id":it.get("id")})
        except Exception as e: errs.append(str(e))
    if not ok: raise RuntimeError(f"{year} 年 LULC 無法讀取："+ " | ".join(errs))
    if errs: notes.append(f"{year} 有部分圖磚失敗："+ " | ".join(errs))
    log(f"LULC {year}: {ok} tile(s)")
    return out

def op(q):
    last=None
    for u in OVERPASS:
        try:
            r=S.post(u,data={"data":q},timeout=240); r.raise_for_status(); return r.json().get("elements",[])
        except Exception as e: last=e; time.sleep(2)
    raise RuntimeError(last)

def osm_context(g4326,g3826):
    W,S0,E,N=g4326.bounds; bb=f"({S0},{W},{N},{E})"
    roads=[]; rivers=[]; parks=[]
    try:
        e=op(f'[out:json][timeout:180];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track|path)$"]{bb};out geom qt;')
        for x in e:
            p=[(z["lon"],z["lat"]) for z in x.get("geometry",[]) if "lon" in z]
            if len(p)>1:
                z=transform(TO3826.transform,LineString(p)).intersection(g3826)
                if not z.is_empty: roads.extend(list(z.geoms) if hasattr(z,"geoms") else [z])
        sources.append({"name":"OpenStreetMap Overpass","role":"道路切割","url":OVERPASS[0]})
    except Exception as e: subs.append("道路 OSM 取得失敗，僅保留建成區邊界切割指標："+str(e))
    try:
        e=op(f'[out:json][timeout:180];way["waterway"~"^(river|stream|canal|drain)$"]{bb};out geom qt;')
        for x in e:
            p=[(z["lon"],z["lat"]) for z in x.get("geometry",[]) if "lon" in z]
            if len(p)>1:
                z=transform(TO3826.transform,LineString(p)).intersection(g3826)
                if not z.is_empty: rivers.extend(list(z.geoms) if hasattr(z,"geoms") else [z])
        sources.append({"name":"OpenStreetMap Overpass","role":"河川沿岸範圍","url":OVERPASS[0]})
    except Exception as e: subs.append("河川 OSM 取得失敗，改以 LULC 水體距離建立沿岸範圍："+str(e))
    try:
        e=op(f'[out:json][timeout:180];(way["leisure"~"^(park|garden|recreation_ground|nature_reserve)$"]{bb};way["landuse"~"^(recreation_ground|village_green|grass|forest)$"]{bb};);out geom qt;')
        for x in e:
            p=[(z["lon"],z["lat"]) for z in x.get("geometry",[]) if "lon" in z]
            if len(p)>3:
                if p[0]!=p[-1]:p.append(p[0])
                try:
                    z=transform(TO3826.transform,Polygon(p))
                    if not z.is_valid:z=z.buffer(0)
                    z=z.intersection(g3826)
                    if not z.is_empty: parks.extend(list(z.geoms) if hasattr(z,"geoms") else [z])
                except: pass
        sources.append({"name":"OpenStreetMap Overpass","role":"公園／都市綠地範圍","url":OVERPASS[0]})
    except Exception as e: subs.append("公園 OSM 取得失敗，改用建成區 150m 內植被代理："+str(e))
    return roads,rivers,parks

def rast(gs,shape_,tr):
    if not gs:return np.zeros(shape_,np.uint8)
    return rasterize([(mapping(g),1) for g in gs if not g.is_empty],out_shape=shape_,transform=tr,fill=0,all_touched=True,dtype="uint8")

def pstats(m):
    lab,n=ndimage.label(m,np.ones((3,3),np.uint8)); sz=np.bincount(lab.ravel()); sz[0]=0
    small=np.isin(lab,np.flatnonzero((sz>0)&(sz<math.ceil(SMALL_HA*10000/(RES*RES)))))
    large=np.isin(lab,np.flatnonzero(sz>=math.ceil(LARGE_HA*10000/(RES*RES))))
    dist=ndimage.distance_transform_edt(~large)*RES if large.any() else np.full(m.shape,5000,np.float32)
    return lab,sz,small,dist

def edge(a,b):
    x=np.zeros(a.shape,bool)
    x[:-1]|=a[:-1]&b[1:]; x[1:]|=a[1:]&b[:-1]; x[:,:-1]|=a[:,:-1]&b[:,1:]; x[:,1:]|=a[:,1:]&b[:,:-1]
    return x

def grids(g,bounds):
    a,b,c,d=bounds; a=math.floor(a/GRID)*GRID; b=math.floor(b/GRID)*GRID; c=math.ceil(c/GRID)*GRID; d=math.ceil(d/GRID)*GRID
    out=[]; r=0; y=b
    while y<d:
        cc=0; x=a
        while x<c:
            z=box(x,y,x+GRID,y+GRID); i=z.intersection(g)
            if not i.is_empty and i.area>=0.05*GRID*GRID: out.append((f"G{r:03d}_{cc:03d}",z,i))
            x+=GRID; cc+=1
        y+=GRID; r+=1
    return out

def win(b,bounds,sh):
    a,b0,c,d=b; A,B,C,D=bounds; h,w=sh
    c0=max(0,int((a-A)//RES)); c1=min(w,int(math.ceil((c-A)/RES)))
    r0=max(0,int((D-d)//RES)); r1=min(h,int(math.ceil((D-b0)/RES)))
    return r0,r1,c0,c1

def rank(s):
    s=pd.to_numeric(s,errors="coerce")
    return (s.rank(method="average",pct=True)*100).fillna(0) if s.notna().sum()>1 else pd.Series(np.zeros(len(s)),index=s.index)

def writej(p,o): p.write_text(json.dumps(o,ensure_ascii=False,indent=2),encoding="utf-8")

def main():
    man=json.loads(MANIFEST.read_text(encoding="utf-8"))
    if man.get("task_id")!=TASK_ID or not man.get("enabled"): raise RuntimeError("manifest 不符或未啟用")
    g4326=boundary(); g3826=transform(TO3826.transform,g4326)
    tr,w,h,bounds=target_grid(g3826)
    county=geometry_mask([mapping(g3826)],out_shape=(h,w),transform=tr,invert=True)
    annual={y:read_year(y,g4326.bounds,tr,w,h) for y in YEARS}
    for a in annual.values(): a[~county]=0

    sources.append({"name":"NLSC 國土利用現況調查","role":"臺灣官方分類／資料可得性參考","url":"https://www.nlsc.gov.tw/"})
    notes.append("NLSC 國土利用 WFS 與歷年比較 API 為申請／綁定服務，本次年度變化改用免申請、可重現的 Impact Observatory 年度 LULC。")
    notes.append("免費年度 LULC 完整資料目前至 2024，因此近五年採 2020、2021、2022、2023、2024 五個年度。")

    roads,rivers,parks=osm_context(g4326,g3826)
    latest=annual[2024]; veg=np.isin(latest,list(VEG))&county; built=(latest==7)&county; water=(latest==1)&county
    rr=rast(roads,latest.shape,tr).astype(bool); pp=rast(parks,latest.shape,tr).astype(bool)
    if not pp.any():
        pp=veg&(ndimage.distance_transform_edt(~built)*RES<=150); subs.append("都市綠地使用建成區 150m 內植被代理。")
    if rivers:
        rv=rast([unary_union(rivers).buffer(RIPARIAN_M)],latest.shape,tr).astype(bool)
    else:
        rv=ndimage.distance_transform_edt(~water)*RES<=RIPARIAN_M; subs.append("河川沿岸使用 LULC 水體 100m 距離代理。")
    ctx={"park":pp,"rip":rv}
    def mask(y,t):
        a=annual[y]; v=np.isin(a,list(VEG))&county
        if t=="森林":return (a==2)&county
        if t=="農地":return (a==5)&county
        if t=="公園／都市綠地":return v&ctx["park"]
        return v&ctx["rip"]

    types=["森林","農地","公園／都市綠地","河川沿岸自然地表"]
    masks={t:{y:mask(y,t) for y in YEARS} for t in types}
    stats={(t,y):pstats(masks[t][y]) for t in types for y in (2020,2024)}
    cells=grids(g3826,bounds); rec=[]; geom={}
    pxarea=RES*RES
    for t in types:
        b0=masks[t][2020]; c0=masks[t][2024]
        lb,sb,_,_=stats[(t,2020)]; lc,sc,small,dist=stats[(t,2024)]
        be=edge(c0,built)
        for gid,full,clip in cells:
            r0,r1,x0,x1=win(full.bounds,bounds,c0.shape); local=county[r0:r1,x0:x1]
            if not local.any():continue
            a=b0[r0:r1,x0:x1]&local; c=c0[r0:r1,x0:x1]&local
            na,nb=int(a.sum()),int(c.sum())
            if not na and not nb:continue
            A=na*pxarea/10000; C=nb*pxarea/10000
            ua=np.unique(lb[r0:r1,x0:x1][a]); ua=ua[ua>0]
            uc=np.unique(lc[r0:r1,x0:x1][c]); uc=uc[uc>0]
            ma=float(np.mean(sb[ua])*pxarea/10000) if len(ua) else 0
            mc=float(np.mean(sc[uc])*pxarea/10000) if len(uc) else 0
            area=max(1e-9,local.sum()*pxarea/1e6)
            road=(rr[r0:r1,x0:x1]&local).sum()*RES/1000/area
            bed=(be[r0:r1,x0:x1]&local).sum()*RES/1000/area
            iso=(small[r0:r1,x0:x1]&c).sum()/max(nb,1)*100
            ds=dist[r0:r1,x0:x1][c]; dlarge=float(ds.mean()) if len(ds) else 0
            annual_ha={str(y):round(float((masks[t][y][r0:r1,x0:x1]&local).sum()*pxarea/10000),3) for y in YEARS}
            p=clip.representative_point(); lon,lat=TO4326.transform(p.x,p.y)
            rec.append({"grid_id":gid,"綠地類型":t,"中心經度":round(lon,6),"中心緯度":round(lat,6),"分析面積_km2":round(area,3),
                        "2020面積_ha":round(A,3),"2024面積_ha":round(C,3),"面積減少率_pct":round(max(0,(A-C)/max(A,1e-9)*100) if A else 0,2),
                        "2020斑塊數":len(ua),"2024斑塊數":len(uc),"斑塊數增加率_pct":round(max(0,(len(uc)-len(ua))/max(len(ua),1)*100),2),
                        "2020平均斑塊面積_ha":round(ma,3),"2024平均斑塊面積_ha":round(mc,3),"平均斑塊面積下降率_pct":round(max(0,(ma-mc)/max(ma,1e-9)*100) if ma else 0,2),
                        "道路切割密度_km_per_km2":round(float(road),3),"建成區邊界切割密度_km_per_km2":round(float(bed),3),
                        "孤立小斑塊比例_pct":round(float(iso),2),"距大型連續綠地平均距離_m":round(dlarge,1),"annual_area_ha":annual_ha})
            geom[(gid,t)]=clip
    df=pd.DataFrame(rec)
    frames=[]
    for t,p in df.groupby("綠地類型",sort=False):
        p=p.copy()
        p["score_面積減少"]=rank(p["面積減少率_pct"]); p["score_斑塊增加"]=rank(p["斑塊數增加率_pct"])
        p["score_平均斑塊縮小"]=rank(p["平均斑塊面積下降率_pct"])
        p["score_道路建成區切割"]=(rank(p["道路切割密度_km_per_km2"])+rank(p["建成區邊界切割密度_km_per_km2"]))/2
        p["score_孤立比例"]=rank(p["孤立小斑塊比例_pct"]); p["score_距大型綠地"]=rank(p["距大型連續綠地平均距離_m"])
        cols=["score_面積減少","score_斑塊增加","score_平均斑塊縮小","score_道路建成區切割","score_孤立比例","score_距大型綠地"]
        p["綜合破碎化分數"]=p[cols].mean(axis=1).round(1); q1=p["綜合破碎化分數"].quantile(1/3); q2=p["綜合破碎化分數"].quantile(2/3)
        p["破碎化等級"]=np.where(p["綜合破碎化分數"]>=q2,"高",np.where(p["綜合破碎化分數"]>=q1,"中","低"))
        p["判定原因"]=p.apply(lambda r:f"面積減少{r['面積減少率_pct']:.1f}%；斑塊增加{r['斑塊數增加率_pct']:.1f}%；平均斑塊縮小{r['平均斑塊面積下降率_pct']:.1f}%；道路密度{r['道路切割密度_km_per_km2']:.2f} km/km²；孤立比例{r['孤立小斑塊比例_pct']:.1f}%；距大型綠地{r['距大型連續綠地平均距離_m']:.0f}m",axis=1)
        frames.append(p)
    df=pd.concat(frames,ignore_index=True)
    meta={"task_id":TASK_ID,"generated_at":datetime.now(timezone.utc).isoformat(),"years":YEARS,"analysis_resolution_m":RES,"grid_size_m":GRID,
          "small_patch_ha":SMALL_HA,"large_patch_ha":LARGE_HA,"sources":sources,"notes":notes,"substitutions":subs,"screening_only":True}
    feats=[]; by={}; high=[]
    for _,r in df.iterrows():
        g=transform(TO4326.transform,geom[(r["grid_id"],r["綠地類型"])])
        prop={}
        for k,v in r.items():
            if k=="annual_area_ha": continue
            prop[k]=v.item() if hasattr(v,"item") else v
        for y,v in r["annual_area_ha"].items():prop[f"{y}面積_ha"]=v
        f={"type":"Feature","geometry":mapping(g),"properties":prop}; feats.append(f); by.setdefault((r["綠地類型"],r["破碎化等級"]),[]).append(f)
        if r["破碎化等級"]=="高":high.append(f)
    fc={"type":"FeatureCollection","features":feats,"metadata":meta}; writej(OUT/"result.geojson",fc)
    for t,slug in [("森林","forest"),("農地","agriculture"),("公園／都市綠地","urban-green"),("河川沿岸自然地表","riparian")]:
        writej(OUT/f"{slug}.geojson",{"type":"FeatureCollection","features":[f for f in feats if f["properties"]["綠地類型"]==t],"metadata":meta})
    colors={"高":"#dc2626","中":"#f59e0b","低":"#22c55e"}
    layers=[{"id":"boundary","name":"宜蘭縣界","type":"geojson","source":{"type":"geojson"},"visible":True,"opacity":1,"style":{"fillColor":"#ffffff","fillOpacity":0.01,"strokeColor":"#334155","strokeWidth":2},"geojson":{"type":"FeatureCollection","features":[{"type":"Feature","geometry":mapping(g4326),"properties":{"名稱":"宜蘭縣"}}]}}]
    layers.append({"id":"all-high","name":"綜合－高破碎化區","type":"geojson","source":{"type":"geojson"},"visible":True,"opacity":0.72,"style":{"fillColor":"#dc2626","fillOpacity":0.45,"strokeColor":"#991b1b","strokeWidth":1.2},"geojson":{"type":"FeatureCollection","features":high}})
    tids={"森林":"forest","農地":"agriculture","公園／都市綠地":"urban-green","河川沿岸自然地表":"riparian"}
    for t,tid in tids.items():
        for lv in ("高","中","低"):
            layers.append({"id":f"{tid}-{lv}","name":f"{t}－{lv}破碎化","type":"geojson","source":{"type":"geojson"},"visible":lv=="高","opacity":0.7,"style":{"fillColor":colors[lv],"fillOpacity":0.38 if lv!="低" else 0.22,"strokeColor":colors[lv],"strokeWidth":0.8},"geojson":{"type":"FeatureCollection","features":by.get((t,lv),[])}})
    writej(OUT/"map.geolibre.json",{"version":"0.2.0","name":"宜蘭縣近5年綠地破碎化分析（2020-2024）","mapView":{"center":[121.72,24.68],"zoom":9.5,"bearing":0,"pitch":0},"basemapStyleUrl":"https://tiles.openfreemap.org/styles/liberty","basemapVisible":True,"basemapOpacity":1,"blankBackgroundColor":None,"layers":layers,"metadata":meta})
    c=df.copy(); c["annual_area_ha"]=c["annual_area_ha"].apply(lambda x:json.dumps(x,ensure_ascii=False)); c.to_csv(OUT/"result.csv",index=False,encoding="utf-8-sig")
    with pd.ExcelWriter(OUT/"result.xlsx",engine="openpyxl") as wri:
        c.to_excel(wri,sheet_name="破碎化分析",index=False); pd.DataFrame(sources).to_excel(wri,sheet_name="資料來源",index=False); pd.DataFrame({"說明":notes+subs}).to_excel(wri,sheet_name="限制與替代",index=False)
    top=df[df["破碎化等級"]=="高"].nlargest(20,"綜合破碎化分數")
    summary={**meta,"result_count":int(len(df)),"high_risk_count":int((df["破碎化等級"]=="高").sum()),"risk_counts_by_type":df.groupby(["綠地類型","破碎化等級"]).size().unstack(fill_value=0).to_dict(orient="index"),"top_high_risk":top[["grid_id","綠地類型","綜合破碎化分數","判定原因","中心經度","中心緯度"]].to_dict(orient="records"),"risk_method":"各綠地類型內，六組指標等權百分位排名後取平均，再依相對三分位分高／中／低。"}
    writej(OUT/"summary.json",summary)
    report=f"# 宜蘭縣近 5 年綠地破碎化分析（2020–2024）\n\n本分析使用 2020–2024 五個年度；Impact Observatory 10m Annual LULC 為年度變化主資料，OSM 補道路、河川與公園脈絡，NLSC 作為臺灣官方土地利用分類／可得性參考。\n\n## 六項指標\n\n- 綠地面積減少率\n- 斑塊數增加率\n- 平均斑塊面積下降率\n- 道路＋建成區邊界切割壓力\n- 孤立小斑塊比例（< {SMALL_HA:g} ha）\n- 距大型連續同類綠地（>= {LARGE_HA:g} ha）\n\n## 結果\n\n- 有效類型－網格紀錄：{len(df):,}\n- 高破碎化紀錄：{int((df['破碎化等級']=='高').sum()):,}\n- 運算解析度：{RES:g} m；篩選網格：{GRID/1000:g} km\n\n## 限制與替代\n\n"
    report+="\n".join("- "+x for x in notes+subs)+"\n\n## 高風險前 20 筆\n\n"
    report+="\n".join(f"- {r['綠地類型']} / {r['grid_id']}：{r['綜合破碎化分數']}；{r['判定原因']}" for _,r in top.iterrows())
    (OUT/"report.md").write_text(report,encoding="utf-8")
    log(f"完成：{len(df)} 筆，高風險 {(df['破碎化等級']=='高').sum()} 筆")

if __name__=="__main__":
    main()

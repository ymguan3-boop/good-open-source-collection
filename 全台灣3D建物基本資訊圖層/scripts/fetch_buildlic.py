#!/usr/bin/env python3
"""Rate-limited, resumable BUILDLIC downloader. Requires explicit non-personal query filters."""
import argparse, hashlib, http.client, json, os, pathlib, random, socket, ssl, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone
BASE="https://building-apply.publicwork.ntpc.gov.tw/opendata/OpenDataSearchUrl.do"
def request(url,retries):
 for n in range(retries+1):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"TaiwanBuildingOpenData/0.2 (+https://github.com/ymguan3-boop/good-open-source-collection)","Accept":"application/json, application/xml, text/xml"}),timeout=35) as r:
    data=r.read(8_000_000); mime=r.headers.get("Content-Type","")
    if r.status!=200 or not data or b"<html" in data[:512].lower() or "text/html" in mime.lower(): raise ValueError("invalid/HTML response")
    if not (data.lstrip().startswith((b"{",b"[",b"<?xml",b"<"))): raise ValueError("unknown response format")
    return data,mime
  except urllib.error.HTTPError as e:
   if e.code not in (429,500,502,503,504) or n==retries: raise
   wait=float(e.headers.get("Retry-After","0")) if e.headers.get("Retry-After","").isdigit() else min(180,2**n*5)
  except (urllib.error.URLError, TimeoutError, ConnectionError, ConnectionResetError, http.client.RemoteDisconnected, http.client.BadStatusLine, http.client.IncompleteRead, socket.timeout, ssl.SSLError) as e:
   if n==retries: raise
   wait=min(180,2**n*5)
  time.sleep(wait+random.uniform(0,2))
def main():
 p=argparse.ArgumentParser()
 p.add_argument("--filter",action="append",required=True,help="欄位=值；僅非個人欄位")
 p.add_argument("--out",default="data/raw/buildlic")
 p.add_argument("--max-pages",type=int,default=50)
 p.add_argument("--interval",type=float,default=5)
 p.add_argument("--retries",type=int,default=3)
 a=p.parse_args()
 filters=dict(x.split("=",1) for x in a.filter)
 if any(k not in ("門牌.行政區","地號.行政區","地號.地段","執照類別","發照日期") for k in filters): p.error("不允許未核准欄位，避免個資查詢")
 if not 1<=a.max_pages<=50 or a.interval<3: p.error("max-pages 1~50; interval >=3 seconds")
 key=hashlib.sha256(json.dumps(filters,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:16]
 root=pathlib.Path(a.out)/key;root.mkdir(parents=True,exist_ok=True)
 state=root/"state.json";current=json.loads(state.read_text()) if state.exists() else {"next_start":1,"pages":[],"filters":filters}
 for _ in range(a.max_pages):
  start=current["next_start"]
  url=BASE+"?"+urllib.parse.urlencode({"d":"OPENDATA","c":"BUILDLIC","Start":start,**filters})
  try:
   body,mime=request(url,a.retries)
   name=f"page_{start:08d}.raw"
   (root/name).write_bytes(body)
   current["pages"].append({"start":start,"filename":name,"sha256":hashlib.sha256(body).hexdigest(),"bytes":len(body),"mime":mime,"fetched_at":datetime.now(timezone.utc).isoformat(),"url":url})
   current["next_start"]=start+100
   state.write_text(json.dumps(current,ensure_ascii=False,indent=2))
   print("downloaded",start,len(body),mime)
   if body.strip() in (b"[]",b"{}"): break
  except Exception as e:
   (root/"last_error.json").write_text(json.dumps({"start":start,"error":repr(e),"time":datetime.now(timezone.utc).isoformat()},ensure_ascii=False,indent=2))
   raise
  time.sleep(a.interval+random.uniform(0,1.5))
if __name__=="__main__":main()

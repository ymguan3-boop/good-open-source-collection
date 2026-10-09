#!/usr/bin/env python3
"""政府建管開放資料擷取器；僅儲存實際回傳的原始資料，不捏造地理座標。"""
import argparse, json, pathlib, time, urllib.parse, urllib.request
BASE="https://building-apply.publicwork.ntpc.gov.tw/opendata/OpenDataSearchUrl.do"
def fetch(start, filters):
    params={"d":"OPENDATA","c":"BUILDLIC","Start":str(start),**filters}
    url=BASE+"?"+urllib.parse.urlencode(params)
    req=urllib.request.Request(url,headers={"User-Agent":"TaiwanBuildingOpenData/0.1 (research; source attribution)"})
    with urllib.request.urlopen(req,timeout=30) as response:
        body=response.read()
        typ=response.headers.get("Content-Type","")
    return url,body,typ
def main():
    a=argparse.ArgumentParser()
    a.add_argument("--filter",action="append",default=[],help="欄位=值，可重複")
    a.add_argument("--pages",type=int,default=1)
    a.add_argument("--delay",type=float,default=2.0)
    a.add_argument("--out",default="data/raw/buildlic")
    args=a.parse_args()
    filters=dict(v.split("=",1) for v in args.filter)
    if not filters:
        raise SystemExit("請提供 --filter（例如：'門牌.行政區=宜蘭市'）；禁止無限制全站掃描")
    dest=pathlib.Path(args.out);dest.mkdir(parents=True,exist_ok=True)
    manifest=[]
    for page in range(args.pages):
        start=1+page*100
        try:
            url,body,ctype=fetch(start,filters)
            if not body:break
            name=f"page_{start:07}.raw"
            (dest/name).write_bytes(body)
            manifest.append({"url":url,"file":name,"bytes":len(body),"content_type":ctype,"status":"downloaded_unvalidated"})
            print(name,len(body),ctype)
            if len(body)<30:break
        except Exception as exc:
            manifest.append({"start":start,"status":"failed","error":str(exc)})
            print("ERROR",exc)
            break
        time.sleep(args.delay)
    (dest/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
if __name__=="__main__":main()

"""Build fixed OSM vectors from a verified Taiwan PBF (osmium 4.2, shapely 2.1).

Usage: python scripts/prepare-national-osm.py PATH_TO_PBF DOWNLOAD_JSON
This is a release preparation tool; the browser does not require Python.
"""
import gzip
import hashlib
import json
import os
import sys
from collections import Counter
from pathlib import Path
import osmium
from shapely import from_wkb
from shapely.geometry import mapping, shape
from shapely.strtree import STRtree

root = Path(__file__).resolve().parents[1]
pbf = Path(sys.argv[1]).absolute()
download = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
destination = root / "overlay/src/taiwan/data"
out = root / ".work/national-osm-snapshot-stage"
out.mkdir(parents=True, exist_ok=True)
boundaries = json.loads((destination / "taiwan-counties.geojson").read_text(encoding="utf-8"))
names = [f["properties"]["COUNTYNAME"] for f in boundaries["features"]]
regions = [shape(f["geometry"]) for f in boundaries["features"]]
tree = STRtree(regions)
# Only coastlines receive a small shoreline tolerance, retaining original geometry.
# OSM shorelines and the bundled county boundary are different vintages.
coast_tree = STRtree([g.buffer(.001) for g in regions])
road_types = set("motorway trunk primary secondary tertiary motorway_link trunk_link primary_link secondary_link tertiary_link unclassified residential living_street service road".split())
waterway_types = set("river stream canal drain".split())
reader = osmium.io.Reader(str(pbf))
timestamp = reader.header().get("osmosis_replication_timestamp")
reader.close()
source = {
    "source": "OpenStreetMap / Geofabrik Taiwan extract",
    "sourceUrl": download["url"],
    "sourceTimestamp": timestamp or download.get("lastModified"),
    "downloadedAt": download["downloadedAt"],
    "crs": "EPSG:4326", "license": "ODbL-1.0",
    "attribution": "© OpenStreetMap contributors; extract by Geofabrik",
    "scopeMethod": "Original features intersecting the bundled county boundary; coastlines use 0.001-degree shoreline tolerance.",
    "snapshot": True,
    "verifiedMd5": download.get("verifiedMd5"),
}
ids = ["osm-roads", "osm-waterways", "osm-water", "osm-coastline"]
streams = {key: gzip.open(out / f"{key}-national.geojson.gz", "wt", encoding="utf-8") for key in ids}
counts = Counter()
county_counts = {key: Counter() for key in ids}
for stream in streams.values():
    stream.write('{"type":"FeatureCollection","features":[')


class Extract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.factory = osmium.geom.WKBFactory()
        self.skipped = Counter()

    def write(self, key, geom, tags, osm_id, object_id):
        selected = coast_tree if key == "osm-coastline" else tree
        counties = [names[int(i)] for i in selected.query(geom, predicate="intersects")]
        if not counties:
            return
        properties = {"osmId": osm_id, **tags, "snapshotCounties": counties}
        feature = {"type": "Feature", "id": object_id, "properties": properties, "geometry": mapping(geom)}
        if counts[key]:
            streams[key].write(",")
        streams[key].write(json.dumps(feature, ensure_ascii=False, separators=(",", ":")))
        counts[key] += 1
        county_counts[key].update(counties)
        if counts[key] % 25000 == 0:
            print(json.dumps(dict(counts)), flush=True)

    def way(self, way):
        tags = dict(way.tags)
        categories = []
        if tags.get("highway") in road_types:
            categories.append("osm-roads")
        if tags.get("waterway") in waterway_types:
            categories.append("osm-waterways")
        if tags.get("natural") == "coastline":
            categories.append("osm-coastline")
        if not categories:
            return
        try:
            geom = from_wkb(self.factory.create_linestring(way), on_invalid="raise")
            for key in categories:
                self.write(key, geom, tags, way.id, f"osm-way-{way.id}")
        except osmium.InvalidLocationError:
            self.skipped["missingNodeLocations"] += 1

    def area(self, area):
        tags = dict(area.tags)
        if tags.get("natural") != "water" and not tags.get("water"):
            return
        try:
            geom = from_wkb(self.factory.create_multipolygon(area), on_invalid="raise")
            origin = "way" if area.from_way() else "relation"
            ident = area.orig_id()
            self.write("osm-water", geom, tags, ident if origin == "way" else f"relation/{ident}", f"osm-{origin}-{ident}")
        except osmium.InvalidLocationError:
            self.skipped["missingAreaLocations"] += 1


handler = Extract()
try:
    handler.apply_file(str(pbf), locations=True, idx=f"sparse_file_array,{pbf.parent / 'node-index'}")
finally:
    for stream in streams.values():
        stream.write("]}")
        stream.close()
if handler.skipped:
    raise RuntimeError(f"Snapshot has missing coordinates: {dict(handler.skipped)}")
if any(not counts[key] for key in ids):
    raise RuntimeError(f"A required category is empty: {dict(counts)}")
source["pbfSha256"] = hashlib.file_digest(pbf.open("rb"), "sha256").hexdigest()
source["layers"] = {}
for key in ids:
    target = out / f"{key}-national.geojson.gz"
    source["layers"][key] = {"count": counts[key], "countyCounts": dict(county_counts[key]), "bytes": target.stat().st_size, "sha256": hashlib.file_digest(target.open("rb"), "sha256").hexdigest()}
(out / "osm-national-metadata.json").write_text(json.dumps(source, ensure_ascii=False, indent=2), encoding="utf-8")
for key in ids:
    os.replace(out / f"{key}-national.geojson.gz", destination / f"{key}-national.geojson.gz")
os.replace(out / "osm-national-metadata.json", destination / "osm-national-metadata.json")
print(json.dumps(source, ensure_ascii=False), flush=True)

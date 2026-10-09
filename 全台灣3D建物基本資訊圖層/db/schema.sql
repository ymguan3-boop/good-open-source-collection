CREATE TABLE IF NOT EXISTS buildings (
 building_id TEXT PRIMARY KEY,
 address TEXT, county TEXT, town TEXT,
 floors_above INTEGER, floors_below INTEGER,
 height_m REAL, height_method TEXT DEFAULT 'unknown',
 completion_date TEXT, building_year INTEGER,
 usage TEXT, structure TEXT,
 building_area_m2 REAL, total_floor_area_m2 REAL,
 permit_no TEXT, license_no TEXT,
 confidence TEXT DEFAULT 'UNKNOWN',
 updated_at TEXT
);
CREATE TABLE IF NOT EXISTS provenance (
 building_id TEXT NOT NULL,
 field_name TEXT NOT NULL,
 source_id TEXT NOT NULL,
 source_record_id TEXT,
 source_url TEXT,
 source_date TEXT,
 method TEXT,
 confidence TEXT,
 PRIMARY KEY(building_id, field_name, source_id)
);
CREATE INDEX IF NOT EXISTS idx_buildings_address ON buildings(address);
CREATE INDEX IF NOT EXISTS idx_buildings_county_town ON buildings(county,town);

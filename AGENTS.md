# Repository agent instructions

## GeoLibre

For GeoLibre, GIS analysis, spatial audit, map analysis, risk-location screening, or requests that explicitly say "使用 GeoLibre 技能", use the user's installed personal Codex skill:

`$geolibre-analysis`

Canonical skill source:

`ymguan3-boop/audit-codex-skills/skills/geolibre-analysis/`

Do not recreate, fork, or maintain a second repository-local copy of this skill in this repository.
All future updates to the GeoLibre analysis skill must be made only in the canonical path above.

Repository-specific GeoLibre locations:

- Source: `GeoLibre/`
- Published web build: `GeoLibre-Web/`
- Binding/profile: `.geolibre/skill-profile.json`

The personal skill owns the guided analysis workflow. The GeoLibre source tree and published web build in this repository remain the execution target for analysis and map publication when the saved profile points here.

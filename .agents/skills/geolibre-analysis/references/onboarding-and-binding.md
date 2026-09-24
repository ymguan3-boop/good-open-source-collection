# GeoLibre first-use onboarding and persistent binding

This protocol is used before analysis whenever no valid saved GeoLibre profile is available.

## A. Detect existing binding without bothering the user

Try in this order:

1. Local cache: `$CODEX_HOME/geolibre-profile.json`; fallback `~/.codex/geolibre-profile.json`.
2. Current repo: `.geolibre/skill-profile.json`.
3. Connected GitHub search for the exact marker `geolibre_skill_profile_version`.
4. If a likely repository named GeoLibre exists, inspect it for:
   - `.geolibre/skill-profile.json`
   - `package.json` with GeoLibre workspace metadata, or
   - `<source_path>/package.json` plus the official upstream structure.

If one valid profile is found, bind it automatically.

If more than one exists, ask the user to select by repository and Pages URL.

Never ask for a GitHub path before these checks.

## B. If the user already has GeoLibre on GitHub

Ask for the repository URL/path only when auto-discovery failed.

Validate:
- repository is reachable,
- the authenticated user can write to it for execution,
- determine default branch,
- determine whether source is at repo root or a subdirectory,
- check GeoLibre source signature,
- check Pages status/URL if available.

If GeoLibre source exists but no profile exists, create `.geolibre/skill-profile.json` and cache it locally.

## C. GitHub is not connected

If a GitHub connector/MCP exists but is not connected, instruct the user to connect it first.

If the user says they do not have a GitHub account:
1. Direct them to GitHub account signup.
2. Explain that account creation/verification must be completed by the user.
3. After they return, connect GitHub/MCP and resume from repository setup.

Do not falsely claim that the skill created or verified a GitHub identity.

## D. No GeoLibre repository exists

Default recommendation: create a dedicated repository, usually `<owner>/GeoLibre`.

Why: easiest Pages URL, upgrades, permissions, and analysis isolation.

Support two install modes:

### 1. standalone_repo (default)
- Repo: `<owner>/GeoLibre` or a collision-safe name.
- `source_path = "."`
- `analysis_root = "GeoLibre-Web/analysis"`
- `task_script_root = "scripts/geolibre_tasks"`

### 2. subdirectory
- Existing repo supplied by user.
- `source_path = "GeoLibre"` (or explicit chosen path)
- `analysis_root = "<source_path>/GeoLibre-Web/analysis"`
- `task_script_root = "<source_path>/scripts/geolibre_tasks"`

If repo-creation tooling is available, use it after the user agrees to setup.

If unavailable:
- use browser automation when available, or
- ask the user for one minimal UI action: create an empty repository.
Then continue immediately; do not repeat setup questions.

## E. Official upstream verification

Official source:
`https://github.com/opengeos/GeoLibre`

Before install/update:
1. fetch official repository metadata,
2. resolve latest stable release when available,
3. otherwise use `main`,
4. record selected ref/tag and commit SHA when possible.

Never silently switch to a fork.

## F. Bootstrap latest GeoLibre into the user's repository

Do not copy thousands of source files one-by-one through MCP.

Preferred flow:
1. Create canonical profile with status `provisioning`.
2. Copy/adapt `assets/geolibre-bootstrap-pages.yml` into the user's `.github/workflows/geolibre-bootstrap-pages.yml`.
3. Trigger the workflow by committing the profile/workflow or using workflow dispatch.
4. Workflow clones `opengeos/GeoLibre` at the recorded ref and syncs it into `source_path`.
5. Preserve skill-owned paths such as `.geolibre/`, analysis outputs, task scripts, and skill workflows.
6. Build with Node.js 22+.
7. Set `GEOLIBRE_APP_BASE` to the GitHub Pages base path.
8. Deploy `apps/geolibre-desktop/dist` to GitHub Pages.
9. Verify repository source and the published site.
10. Update profile status to `ready`.

The official GeoLibre Vite config supports `GEOLIBRE_APP_BASE`, so use it for project-site subpaths.

## G. GitHub Pages enablement

Try automatic enablement only when the available credential/tool has the required Pages/admin permissions.

If automatic enablement is unavailable, request this one-time user action only:

`Repository → Settings → Pages → Build and deployment → Source = GitHub Actions`

After the user says it is done:
- rerun/continue the workflow,
- verify the Pages URL,
- save it to the profile.

Do not send the user through repository creation again.

## H. Persistent profile

Canonical path:
`.geolibre/skill-profile.json`

Use a structure compatible with `assets/geolibre-profile.example.json`.

After successful validation:
- write/update canonical profile,
- write local cache when allowed,
- set `status = "ready"`,
- update `last_verified_at`.

The local cache may contain multiple profiles and an active profile. Never store access tokens, PATs, secrets, API keys, or cookies.

## I. Later runs

On later uses:
1. load local cache,
2. validate the canonical profile with a lightweight repo check,
3. use it automatically,
4. refresh `last_verified_at` only when useful.

Only re-onboard when:
- repository was deleted/inaccessible,
- write permission was lost,
- canonical profile is corrupt,
- source path no longer contains GeoLibre,
- user explicitly asks to bind another GeoLibre project.

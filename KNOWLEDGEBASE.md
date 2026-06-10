# Seerr Gelato Fork — Knowledge Base

## Overview

This is a fork of [Seerr](https://github.com/seerr-team/seerr) (branch `develop`) that replaces Radarr/Sonarr integration with [Gelato](https://github.com/lostb1t/Gelato), a Jellyfin plugin that adds virtual/streamed media items to Jellyfin libraries via Stremio addons.

**Repo**: `ashipaek0/seerr-gelato` on GitHub
**Branch**: `gelato-integration` (sole branch, set as default)
**DockerHub**: `irunmole/seerr-gelato:latest`

## How It Works (The Flow)

When a user requests media and it gets approved (or auto-approved):

```
Seerr approves request (status = APPROVED)
  ↓
MediaRequestSubscriber.afterUpdate / afterInsert fires
  ↓
1. updateParentStatus() — sets Media.status = PROCESSING (requires APPROVED status)
2. sendToGelato():
   a. Fetch title from TMDB (by TMDB ID) — "Title Year" format
   b. Authenticate with Jellyfin via /Users/AuthenticateByName (env vars)
      → Get session token with proper userId (NOT API key — see Gotcha #1)
   c. Search Jellyfin: GET /Users/{userId}/Items?searchTerm=Title&IncludeItemTypes=Movie&Recursive=true&Limit=25
      → Gelato's SearchActionFilter intercepts, searches Stremio, caches StremioMeta
   d. Parse response, find item where ProviderIds.Tmdb matches target TMDB ID
   e. "Click" the item: GET /Users/{userId}/Items/{stremioGuid}
      → Gelato's InsertActionFilter intercepts, reads cached StremioMeta, calls InsertMeta()
      → Virtual item created in Jellyfin database
   f. Mark request COMPLETED
3. Jellyfin scanner detects new item → updates Media.status to AVAILABLE
```

## Files Modified (from upstream Seerr develop)

### 1. `server/entity/MediaRequest.ts`
Added `imdbId` optional column:
```typescript
@Column({ type: 'varchar', length: 20, nullable: true })
public imdbId?: string;
```

### 2. `server/interfaces/api/requestInterfaces.ts`
Added `imdbId` to `MediaRequestBody` type.

### 3. `server/api/jellyfin.ts`
Added `triggerGelatoInsert(searchTerms, type, tmdbId, userId)` method:
- Takes array of search terms (tries each until TMDB match found)
- Searches Jellyfin `/Users/{userId}/Items` endpoint (user-scoped for Gelato compatibility)
- Verifies match by `ProviderIds.Tmdb`
- "Clicks" matched item via `/Users/{userId}/Items/{guid}` to trigger InsertActionFilter

### 4. `server/subscriber/MediaRequestSubscriber.ts`
Added `sendToGelato(entity)` method:
- Triggers on `MediaRequestStatus.APPROVED` in `afterUpdate` and `afterInsert`
- Fetches title from TMDB (with year for disambiguation)
- Gets Jellyfin session token via `AuthenticateByName` (see Gotcha #1)
- Calls `triggerGelatoInsert()` with multiple search term variations
- On success: marks request as `COMPLETED`
- On failure: logs warning, leaves request as APPROVED

Replaced `sendToRadarr()`/`sendToSonarr()` calls in `afterUpdate` and `afterInsert` with `sendToGelato()`.

### 5. `server/api/github.ts`
Changed version check endpoints:
- `/repos/seerr-team/seerr` → `/repos/ashipaek0/seerr-gelato`
- Default branch: `develop` → `gelato-integration`

### 6. `server/migration/sqlite/1780000000000-AddImdbIdToMediaRequest.ts` (NEW)
### 7. `server/migration/postgres/1780000000000-AddImdbIdToMediaRequest.ts` (NEW)
Database migrations for the `imdbId` column.

### 8. `compose.yaml`
Production Docker Compose using pre-built image:
```yaml
services:
  seerr-gelato:
    image: irunmole/seerr-gelato:latest
    user: ${PUID:-1000}:${PGID:-1000}
    ports:
      - 5055:5055
    volumes:
      - ./config:/app/config
    environment:
      - JELLYFIN_URL=${JELLYFIN_URL:-http://jellyfin:8096}
      - JELLYFIN_API_KEY=${JELLYFIN_API_KEY}
      - JELLYFIN_USERNAME=${JELLYFIN_USERNAME}
      - JELLYFIN_PASSWORD=${JELLYFIN_PASSWORD}
    restart: unless-stopped
```

### 9. `.github/workflows/ci.yml`
- Image destination: `irunmole/seerr-gelato`
- Secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`
- Build triggers: push to `gelato-integration`
- Tags: `latest`, `sha-xxx`
- Discord webhook job removed (upstream leftover)

### 10. `.github/workflows/release.yml`
Same DockerHub/GHCR updates, triggers on `v*` tags.

### 11. `README.md`
Rewritten for the fork — explains Gelato integration, no Plex/Emby references, Jellyfin-only.

### 12. Various `.github/` files
All `seerr-team/seerr` references replaced with `ashipaek0/seerr-gelato`.
- `CODEOWNERS`: `@seerr-team/seerr-core` → `@ashipaek0`
- Issue templates, PR template, renovate config
- `preview.yml` DockerHub destination
- Discord invite links removed

## Gotchas & Critical Insights

### Gotcha #1: API Keys have zero GUID UserId claims
**Problem**: Jellyfin API keys carry a `UserId` claim of `00000000-0000-0000-0000-000000000000`. Gelato's `TryGetUserId()` extracts this from claims, parses as `Guid.Empty`, and returns `false`. The `??` fallback to query string never triggers because the claim value is non-null (it's a valid, but zero, GUID).

**Impact**: `InsertActionFilter` requires a valid non-empty userId. With API key auth, `TryGetUserId` returns false, filter skips, Jellyfin returns 404 for Stremio GUIDs.

**Fix**: Use session tokens obtained via `/Users/AuthenticateByName` with `JELLYFIN_USERNAME`/`JELLYFIN_PASSWORD` env vars. Session tokens have proper userId claims.

### Gotcha #2: Stremio search only handles text, not IDs
**Problem**: Searching by IMDB ID (`tt0133093`) or TMDB ID (`tmdb:603`) returns 0 results from Gelato/Stremio. Only text queries work.

**Fix**: Fetch title from TMDB, search by "Title Year" text, then verify match by checking `ProviderIds.Tmdb` in results.

### Gotcha #3: Short titles need year, long titles don't
**Problem**: "FROM" returns wrong shows. "Tom Clancy's Jack Ryan: Ghost War" might not need the year.

**Fix**: Try multiple search terms in order: title-only first, then title+year. Stop at first term that finds a TMDB match.

### Gotcha #4: User-scoped endpoint required
**Problem**: `/Items?searchTerm=...` works but `/Items/{guid}` returns 404 for Gelato GUIDs.

**Fix**: Use `/Users/{userId}/Items?...` and `/Users/{userId}/Items/{guid}` for both search and click. This ensures Gelato resolves the correct user config.

### Gotcha #5: updateParentStatus must run before sendToGelato
**Problem**: If `sendToGelato` sets request status to `COMPLETED` before `updateParentStatus` runs, `updateParentStatus` sees `COMPLETED` instead of `APPROVED` and skips the `Media.status = PROCESSING` update. Media stays stuck at `PENDING` forever.

**Fix**: In `afterUpdate` and `afterInsert`, run `updateParentStatus` FIRST (while status is still `APPROVED`), then `sendToGelato`. Flow:
1. `updateParentStatus` → sets `Media.status = PROCESSING`
2. `sendToGelato` → triggers Gelato → sets request to `COMPLETED`
3. Jellyfin scanner detects new item → updates `Media.status` to `AVAILABLE`

### Gotcha #6: Docker permissions
The container runs as `node:node`. Bind-mounted `./config` directory must be writable by UID 1000. Use `user:` in compose or `chown 1000:1000 ./config` on host.

## Debugging Commands

### Test Gelato search directly
```bash
# Search by title (text that Stremio handles)
curl -s "http://JELLYFIN_IP:8096/Users/USER_ID/Items?searchTerm=The%20Matrix&IncludeItemTypes=Movie&Recursive=true&Limit=5" \
  -H 'Authorization: MediaBrowser Client="Seerr", Device="test", DeviceId="test", Version="1.0.0", Token="API_KEY"'

# Search by IMDB ID (does NOT work with Stremio)
curl -s "http://JELLYFIN_IP:8096/Users/USER_ID/Items?searchTerm=tt0133093&IncludeItemTypes=Movie&Recursive=true&Limit=5" \
  -H 'Authorization: ...'
```

### Test Gelato click (insertion)
```bash
# Replace GUID with one from search results
curl -sv "http://JELLYFIN_IP:8096/Users/USER_ID/Items/GUID_HERE" \
  -H 'Authorization: ...'
# 200 = success (InsertActionFilter intercepted)
# 404 = filter skipped or item not cached
```

### Check Jellyfin logs for Gelato
```bash
grep -i "gelato\|SearchAction\|InsertAction" /path/to/jellyfin/log.log
```

### Check Seerr logs
```bash
docker logs seerr-gelato 2>&1 | grep -i gelato
```

### Get Jellyfin session token
```bash
curl -X POST "http://JELLYFIN_IP:8096/Users/AuthenticateByName" \
  -H "Content-Type: application/json" \
  -d '{"Username":"admin","Pw":"password"}'
```

### Check what user an API key belongs to
```bash
curl -s "http://JELLYFIN_IP:8096/Auth/Keys" \
  -H 'Authorization: MediaBrowser Client="Seerr", Device="test", DeviceId="test", Version="1.0.0", Token="API_KEY"'
```

## Gelato Source Code Reference

Key files in the Gelato Jellyfin plugin:

| File | Purpose |
|---|---|
| `SearchActionFilter.cs` | Intercepts `/Items?searchTerm=` — searches Stremio, returns DTOs, caches StremioMeta |
| `InsertActionFilter.cs` | Intercepts `/Items/{guid}` — reads cached StremioMeta, calls InsertMeta() |
| `GelatoManager.cs` | Core logic: InsertMeta, IntoBaseItem, StremioMeta caching |
| `GelatoApiController.cs` | API endpoints: `/gelato/meta/{type}/{id}`, `/gelato/stream` |
| `Common.cs` | Extension methods: TryGetUserId, IsInsertableAction, etc. |
| `ProviderManagerDecorator.cs` | Decorates GetRemoteSearchResults |
| `MediaSourceManagerDecorator.cs` | Creates dynamic media sources for Gelato items |

### TryGetUserId (in Common.cs) — The Root Cause
```csharp
var userIdStr =
    ctx.User.Claims.FirstOrDefault(c => c.Type is "UserId" or "Jellyfin-UserId")?.Value
    ?? ctx.Request.Query["userId"].FirstOrDefault();
```
API keys have UserId claim = `000...000` (non-null), so `??` never reaches query string. Session tokens have proper userId.

## CI/CD

- **Trigger**: Push to `gelato-integration` branch
- **Builds**: Multi-arch (amd64, arm64) Docker images
- **Registry**: DockerHub `irunmole/seerr-gelato:latest` + GHCR
- **Secrets needed**: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `JELLYFIN_URL` | Yes | Jellyfin server URL |
| `JELLYFIN_API_KEY` | Yes | For library sync, user import, etc. |
| `JELLYFIN_USERNAME` | Yes | For Gelato session token (AuthenticateByName) |
| `JELLYFIN_PASSWORD` | Yes | For Gelato session token |
| `PUID` | No | Host user ID for volume permissions (default 1000) |
| `PGID` | No | Host group ID for volume permissions (default 1000) |
| `TZ` | No | Timezone (default UTC) |

## Current Limitations

1. **Content availability**: Only items available on configured Stremio addons can be added. 2026/new releases may not be indexed yet.
2. **Search accuracy**: Title-based search can return wrong matches if the exact title isn't found. The TMDB ID verification prevents wrong insertions, but means some items can't be matched.
3. **Series support**: The title search + TMDB matching works for series too, but season-level requests aren't handled (same limitation as upstream).
4. **No Sonarr/Radarr fallback**: The *arr dispatch methods are still in the code but not called. Could be re-enabled as fallback.
5. **Session token per request**: Currently authenticates on every Gelato trigger. Could be cached with TTL.

## Next Steps / TODO

- [ ] Cache Jellyfin session token (re-authenticate only on expiry)
- [ ] Add retry logic for failed Gelato insertions
- [ ] Consider IMDB ID search as fallback (some Stremio addons may support it)
- [ ] Handle 4K requests (currently both 4K and non-4K use same Gelato flow)
- [ ] Add Gelato configuration section in Seerr settings UI
- [ ] Monitoring/health check for Gelato connectivity

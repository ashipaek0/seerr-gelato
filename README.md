# Seerr Gelato Fork

> A Seerr fork that replaces Radarr/Sonarr with [Gelato](https://github.com/lostb1t/Gelato) — on-demand virtual media items in Jellyfin.

When a media request is approved, instead of dispatching to Radarr or Sonarr for downloading, this fork triggers Gelato (a Jellyfin plugin) to add the content directly as a virtual item in your Jellyfin library.

## How It Differs from Upstream Seerr

| Upstream Seerr | This Fork |
|---|---|
| Approving a request → sends to Radarr/Sonarr to download | Approving a request → triggers Gelato to add a virtual item in Jellyfin |
| Content stored on disk | Content streamed on-demand via Stremio |

Everything else — the request workflow, admin approval, permissions, notifications, Jellyfin integration — remains identical to upstream Seerr.

## Prerequisites

- [Jellyfin](https://jellyfin.org) media server
- [Gelato plugin](https://github.com/lostb1t/Gelato) installed in Jellyfin
- Gelato configured with at least one movie and series library folder
- Stremio addons configured in Gelato (for content sources)

No Radarr, Sonarr, or download clients required.

## Quick Start

### Docker

```bash
docker run -d \
  --name seerr-gelato \
  -p 5055:5055 \
  -v /path/to/config:/app/config \
  -e JELLYFIN_URL=http://jellyfin:8096 \
  -e JELLYFIN_API_KEY=your_api_key \
  -e JELLYFIN_USERNAME=admin \
  -e JELLYFIN_PASSWORD=your_password \
  irunmole/seerr-gelato:latest
```

### Docker Compose

```yaml
services:
  seerr-gelato:
    image: irunmole/seerr-gelato:latest
    container_name: seerr-gelato
    user: ${PUID:-1000}:${PGID:-1000}
    ports:
      - 5055:5055
    volumes:
      - ./config:/app/config
    environment:
      - TZ=${TZ:-UTC}
      - JELLYFIN_URL=${JELLYFIN_URL:-http://jellyfin:8096}
      - JELLYFIN_API_KEY=${JELLYFIN_API_KEY}
      - JELLYFIN_USERNAME=${JELLYFIN_USERNAME}
      - JELLYFIN_PASSWORD=${JELLYFIN_PASSWORD}
    restart: unless-stopped
```

### Setup

1. Open `http://localhost:5055`
2. Create an admin account
3. Go to Settings → Jellyfin → enter your Jellyfin URL and API key
4. Sync your Jellyfin libraries
5. You're ready — requests will now flow through Gelato

## Docker Images

Pre-built multi-arch images (amd64, arm64) published on Docker Hub:

```
docker pull irunmole/seerr-gelato:latest
```

Built and pushed automatically on every push to the `gelato-integration` branch.

## Upstream

This is a fork of [Seerr](https://github.com/seerr-team/seerr). See the upstream repo for full documentation and contribution guides.

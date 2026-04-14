# Copyright (c) 2026 eele14. All Rights Reserved.
#!/bin/sh
cloudflared tunnel --no-autoupdate run --token "$CLOUDFLARE_TUNNEL_TOKEN" &
bun run src/server.ts

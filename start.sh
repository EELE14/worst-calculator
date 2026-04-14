# Copyright (c) 2026 eele14. All Rights Reserved.
#!/bin/sh

ROW_COUNT=$(bun -e "
const { Client } = require('pg');
const c = new Client({ connectionString: \`postgresql://\${process.env.DB_USER}:\${process.env.DB_PASSWORD}@\${process.env.DB_HOST}:\${process.env.DB_PORT}/\${process.env.DB_NAME}\` });
c.connect().then(() => c.query('SELECT COUNT(*) FROM segments')).then(r => { process.stdout.write(r.rows[0].count); c.end(); }).catch(() => { process.stdout.write('0'); c.end(); });
" 2>/dev/null)

if [ "$ROW_COUNT" = "0" ] || [ -z "$ROW_COUNT" ]; then
  echo "[start] Segments table is empty — running seed..."
  bun run scripts/seed-database.ts
  echo "[start] Seed complete."
else
  echo "[start] Segments table has $ROW_COUNT rows — skipping seed."
fi

cloudflared tunnel --no-autoupdate run --token "$CLOUDFLARE_TUNNEL_TOKEN" &
bun run src/server.ts

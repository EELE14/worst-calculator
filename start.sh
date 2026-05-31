#!/bin/sh

DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

echo "[start] Running migration..."
bun -e "
const { Client } = require('pg');
const fs = require('fs');
const c = new Client({ connectionString: '$DB_URL' });
c.connect()
  .then(() => c.query(fs.readFileSync('database/migrations/001_create_tables.sql', 'utf8')))
  .then(() => { console.log('[start] Migration applied.'); c.end(); })
  .catch(err => { if (err.code === '42P07') { console.log('[start] Tables already exist, skipping.'); } else { console.error('[start] Migration error:', err.message); } c.end(); });
"

ROW_COUNT=$(bun -e "
const { Client } = require('pg');
const c = new Client({ connectionString: '$DB_URL' });
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

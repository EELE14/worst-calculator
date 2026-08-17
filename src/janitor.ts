// Connected Discord-GitHub
/* Copyright (c) 2026 eele14. All Rights Reserved. */
import { query } from "./db.ts";
import { CONFIG } from "./config.ts";
import { GROWING_TABLES, TABLES } from "./constants.ts";

function formatMB(bytes: number): string {
  return `${(bytes / 1_024 / 1_024).toFixed(1)} MB`;
}

async function sizeBytes(): Promise<number> {
  const rows = await query<{ total: string }>(`
    SELECT (
      pg_total_relation_size('${TABLES.HEARTBEAT_LOG}')   +
      pg_total_relation_size('${TABLES.STATE_HISTORY}')   +
      pg_total_relation_size('${TABLES.CALCULATION_LOG}')
    )::bigint AS total
  `);
  return Number((rows[0] as Record<string, string>).total);
}

// deletes the older half of a log table instead of rows past some age
// cutoff, ordering by id works fine since it climbs in insert order
// anyway, and trimming by proportion keeps it bounded no matter how
// fast the table actually fills up
async function deleteOldestHalf(table: string): Promise<void> {
  await query(`
    DELETE FROM ${table}
    WHERE id IN (
      SELECT id FROM ${table}
      ORDER BY id ASC
      LIMIT (SELECT COUNT(*) FROM ${table}) / 2
    )
  `);
}

async function trim(): Promise<void> {
  await deleteOldestHalf(TABLES.HEARTBEAT_LOG);
  await deleteOldestHalf(TABLES.CALCULATION_LOG);

  // state_history is the one table other code actually rebuilds state
  // from, so it gets a fixed row floor instead of a proportional trim,
  // cutting it down too far would lose state a client still needs
  await query(`
    DELETE FROM ${TABLES.STATE_HISTORY}
    WHERE id NOT IN (
      SELECT id FROM ${TABLES.STATE_HISTORY}
      ORDER BY id DESC
      LIMIT ${CONFIG.JANITOR.STATE_HISTORY_KEEP}
    )
  `);

  // postgres DELETE just marks rows dead, disk space isnt actually
  // reclaimed until VACUUM runs.
  for (const table of GROWING_TABLES) {
    await query(`VACUUM ${table}`);
  }
}

async function checkAndTrim(): Promise<void> {
  const before = await sizeBytes();

  if (before < CONFIG.JANITOR.TRIM_THRESHOLD_BYTES) return;

  console.log(`[janitor] ${formatMB(before)} over 900 MB threshold, trimming`);
  await trim();

  const after = await sizeBytes();
  console.log(`[janitor] trimmed: ${formatMB(before)} -> ${formatMB(after)}`);
}

export function startJanitor(): void {
  // runs once right on boot instead of waiting for the first interval
  // tick, otherwise a server that restarts a lot could sit way over
  // threshold for a whole CHECK_INTERVAL_MS before it even checks
  checkAndTrim().catch((err) =>
    console.error("[janitor] startup check failed:", err),
  );

  setInterval(() => {
    checkAndTrim().catch((err) =>
      console.error("[janitor] interval check failed:", err),
    );
  }, CONFIG.JANITOR.CHECK_INTERVAL_MS);

  const intervalSec = CONFIG.JANITOR.CHECK_INTERVAL_MS / 1_000;
  console.log(
    `[janitor] running checks every ${intervalSec}s, ` +
      `trim threshold 900 MB, ` +
      `state_history floor ${CONFIG.JANITOR.STATE_HISTORY_KEEP} rows`,
  );
}

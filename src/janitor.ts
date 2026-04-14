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

  await query(`
    DELETE FROM ${TABLES.STATE_HISTORY}
    WHERE id NOT IN (
      SELECT id FROM ${TABLES.STATE_HISTORY}
      ORDER BY id DESC
      LIMIT ${CONFIG.JANITOR.STATE_HISTORY_KEEP}
    )
  `);

  for (const table of GROWING_TABLES) {
    await query(`VACUUM ${table}`);
  }
}

async function checkAndTrim(): Promise<void> {
  const before = await sizeBytes();

  if (before < CONFIG.JANITOR.TRIM_THRESHOLD_BYTES) return;

  console.log(
    `[janitor] ${formatMB(before)} — over 900 MB threshold, trimming...`,
  );
  await trim();

  const after = await sizeBytes();
  console.log(`[janitor] trimmed: ${formatMB(before)} → ${formatMB(after)}`);
}

export function startJanitor(): void {
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
    `[janitor] running — checks every ${intervalSec}s, ` +
      `trim threshold 900 MB, ` +
      `state_history floor ${CONFIG.JANITOR.STATE_HISTORY_KEEP} rows`,
  );
}

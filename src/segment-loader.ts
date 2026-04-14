/* Copyright (c) 2026 eele14. All Rights Reserved. */
import { query } from "./db.ts";
import type { CalculatorContext, Emitter } from "./types.ts";
import { ALL_TABLES, EVENTS, PHASE, TABLES } from "./constants.ts";
import { CONFIG } from "./config.ts";

export type { CalculatorContext };

export function makeContext(
  partial: Partial<CalculatorContext> = {},
): CalculatorContext {
  return {
    display_buffer: null,
    operand_1: null,
    operand_2: null,
    operator: null,
    result: null,
    html: null,
    buttons_html: null,
    segment_chain: [],
    _start_time: Date.now(),
    ...partial,
  };
}

function findSegment(
  rows: Record<string, unknown>[],
  key: string,
): Record<string, unknown> {
  const row = rows.find((r) => r.segment_key === key);
  if (!row) throw new Error(`Segment chain broken: ${key} not found`);
  return row;
}

function parseQueryMetadata(sql: string): {
  op: "SELECT" | "INSERT";
  table: string;
} {
  const op = /^\s*SELECT/i.test(sql) ? "SELECT" : "INSERT";
  const table =
    op === "SELECT"
      ? (/\bFROM\s+(\w+)/i.exec(sql)?.[1] ?? "?")
      : (/\bINTO\s+(\w+)/i.exec(sql)?.[1] ?? "?");
  return { op, table };
}

export async function runChain(
  segmentKey: string,
  context: CalculatorContext,
  emit?: Emitter,
): Promise<CalculatorContext> {
  emit?.(EVENTS.TRIAD_START, { key: segmentKey });

  const preKey = `${PHASE.PRE_PREFIX}${segmentKey}`;
  emit?.(EVENTS.LOADER_SCAN, { table: TABLES.SEGMENTS, target: preKey });
  const preRow = findSegment(
    await query(`SELECT * FROM ${TABLES.SEGMENTS}`),
    preKey,
  );

  emit?.(EVENTS.PHASE_START, { key: segmentKey, phase: PHASE.PRE });
  await evalSegment(preRow.code as string, context, emit);
  emit?.(EVENTS.PHASE_DONE, { key: segmentKey, phase: PHASE.PRE });

  emit?.(EVENTS.LOADER_SNAPSHOT, { table: TABLES.SEGMENTS });
  await query(`SELECT * FROM ${TABLES.SEGMENTS}`);
  emit?.(EVENTS.LOADER_SNAPSHOT, { table: TABLES.STATE_HISTORY });
  await query(`SELECT * FROM ${TABLES.STATE_HISTORY}`);

  emit?.(EVENTS.LOADER_SCAN, { table: TABLES.SEGMENTS, target: segmentKey });
  const mainRow = findSegment(
    await query(`SELECT * FROM ${TABLES.SEGMENTS}`),
    segmentKey,
  );

  emit?.(EVENTS.PHASE_START, { key: segmentKey, phase: PHASE.MAIN });
  await evalSegment(mainRow.code as string, context, emit);
  emit?.(EVENTS.PHASE_DONE, { key: segmentKey, phase: PHASE.MAIN });

  const nextOverride = context._next_override;
  delete context._next_override;
  context.segment_chain.push(segmentKey);

  emit?.(EVENTS.LOADER_VERIFY, { table: TABLES.STATE_HISTORY });
  await query(`SELECT * FROM ${TABLES.STATE_HISTORY}`);
  emit?.(EVENTS.LOADER_VERIFY, { table: TABLES.HEARTBEAT_LOG });
  await query(`SELECT * FROM ${TABLES.HEARTBEAT_LOG}`);

  const postKey = `${PHASE.POST_PREFIX}${segmentKey}`;
  emit?.(EVENTS.LOADER_SCAN, { table: TABLES.SEGMENTS, target: postKey });
  const postRow = findSegment(
    await query(`SELECT * FROM ${TABLES.SEGMENTS}`),
    postKey,
  );

  emit?.(EVENTS.PHASE_START, { key: segmentKey, phase: PHASE.POST });
  await evalSegment(postRow.code as string, context, emit);
  emit?.(EVENTS.PHASE_DONE, { key: segmentKey, phase: PHASE.POST });

  for (const table of ALL_TABLES) {
    emit?.(EVENTS.LOADER_SWEEP, { table });
    await query(`SELECT * FROM ${table}`);
  }

  const nextKey =
    nextOverride != null
      ? nextOverride
      : ((mainRow.next_segment as string | null) ?? null);

  if (nextKey) {
    return runChain(nextKey, context, emit);
  }

  emit?.(EVENTS.CHAIN_DONE, {
    segments: context.segment_chain.length,
    duration_ms: Date.now() - (context._start_time ?? Date.now()),
  });
  return context;
}

async function ping(): Promise<void> {
  await fetch(CONFIG.PING_URL);
}

async function evalSegment(
  code: string,
  context: CalculatorContext,
  emit?: Emitter,
): Promise<void> {
  const wrappedQuery = async (
    sql: string,
    params?: unknown[],
  ): Promise<Record<string, unknown>[]> => {
    const { op, table } = parseQueryMetadata(sql);
    emit?.(EVENTS.SEG_QUERY, { op, table });
    return query(sql, params);
  };

  const wrappedPing = async (): Promise<void> => {
    emit?.(EVENTS.SEG_PING, {});
    return ping();
  };

  const fn = eval(`(async function(context, query, ping) {\n${code}\n})`) as (
    ctx: CalculatorContext,
    q: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>,
    p: () => Promise<void>,
  ) => Promise<void>;

  await fn(context, wrappedQuery, wrappedPing);
}

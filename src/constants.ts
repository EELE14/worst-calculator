/* Copyright (c) 2026 eele14. All Rights Reserved. */
export const TABLES = {
  SEGMENTS: "segments",
  STATE_HISTORY: "state_history",
  CALCULATION_LOG: "calculation_log",
  HEARTBEAT_LOG: "heartbeat_log",
  UI_LAYOUTS: "ui_layouts",
} as const;

export const ALL_TABLES = [
  TABLES.SEGMENTS,
  TABLES.STATE_HISTORY,
  TABLES.CALCULATION_LOG,
  TABLES.HEARTBEAT_LOG,
  TABLES.UI_LAYOUTS,
] as const;

export const GROWING_TABLES = [
  TABLES.HEARTBEAT_LOG,
  TABLES.STATE_HISTORY,
  TABLES.CALCULATION_LOG,
] as const;

export const EVENTS = {
  CONNECTED: "connected",
  REQUEST_START: "request_start",
  TRIAD_START: "triad_start",
  PHASE_START: "phase_start",
  PHASE_DONE: "phase_done",
  LOADER_SCAN: "loader_scan",
  LOADER_SNAPSHOT: "loader_snapshot",
  LOADER_VERIFY: "loader_verify",
  LOADER_SWEEP: "loader_sweep",
  SEG_QUERY: "seg_query",
  SEG_PING: "seg_ping",
  CHAIN_DONE: "chain_done",
} as const;

export const PHASE = {
  PRE: "pre",
  MAIN: "main",
  POST: "post",
  PRE_PREFIX: "pre_",
  POST_PREFIX: "post_",
} as const;

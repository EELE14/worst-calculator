/* Copyright (c) 2026 eele14. All Rights Reserved. */
const DB_USER = Bun.env.DB_USER ?? "calc";
const DB_PASSWORD = Bun.env.DB_PASSWORD ?? "calc";
const DB_HOST = Bun.env.DB_HOST ?? "localhost";
const DB_PORT = Bun.env.DB_PORT ?? "5432";
const DB_NAME = Bun.env.DB_NAME ?? "horrible";

const SERVER_PORT = Number(Bun.env.PORT ?? "3000");

export const CONFIG = {
  DB: {
    CONNECTION_STRING: `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`,
  },
  SERVER: {
    PORT: SERVER_PORT,
  },
  JANITOR: {
    TRIM_THRESHOLD_BYTES: 900 * 1_024 * 1_024,
    CHECK_INTERVAL_MS: 60_000,
    STATE_HISTORY_KEEP: 500,
  },

  PING_URL: `http://localhost:${SERVER_PORT}/ping`,
} as const;

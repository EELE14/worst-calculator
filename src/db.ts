/* Copyright (c) 2026 eele14. All Rights Reserved. */
import { Client } from "pg";
import { CONFIG } from "./config.ts";

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const probe = new Client({ connectionString: CONFIG.DB.CONNECTION_STRING });
  await probe.connect();
  await probe.query("SELECT 1");
  await probe.end();

  const client = new Client({ connectionString: CONFIG.DB.CONNECTION_STRING });
  await client.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    await client.end();
  }
}

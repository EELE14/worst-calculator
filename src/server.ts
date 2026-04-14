/* Copyright (c) 2026 eele14. All Rights Reserved. */
import { runChain, makeContext } from "./segment-loader.ts";
import type { CalculatorContext } from "./types.ts";
import { query } from "./db.ts";
import { registerEmitter, deregisterEmitter, getEmitter } from "./sse.ts";
import type { Emitter } from "./types.ts";
import { startJanitor } from "./janitor.ts";
import { CONFIG } from "./config.ts";
import { EVENTS, TABLES } from "./constants.ts";

const NO_CACHE: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...NO_CACHE, ...CORS },
  });
}

Bun.serve({
  port: CONFIG.SERVER.PORT,

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...NO_CACHE, ...CORS },
      });
    }

    try {
      if (req.method === "POST" && url.pathname === "/segment") {
        const body = (await req.json()) as {
          segment_key?: string;
          context?: Partial<CalculatorContext>;
          stream_id?: string;
        };

        const { segment_key, context: clientContext, stream_id } = body;

        if (!segment_key || typeof segment_key !== "string") {
          return json({ error: "segment_key is required" }, 400);
        }

        const emit = stream_id ? getEmitter(stream_id) : undefined;

        const ctx = makeContext(clientContext ?? {});
        ctx.segment_chain = [];
        ctx._start_time = Date.now();
        ctx.apply_done = undefined;
        ctx._next_override = undefined;

        emit?.(EVENTS.REQUEST_START, { segment_key });
        const finalCtx = await runChain(segment_key, ctx, emit);
        return json(finalCtx);
      }

      if (req.method === "GET" && url.pathname === "/stream") {
        const id = url.searchParams.get("id");
        if (!id)
          return new Response("id required", { status: 400, headers: CORS });

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          start(controller) {
            const emit: Emitter = (type, data) => {
              try {
                const payload = `data: ${JSON.stringify({ type, ...data })}\n\n`;
                controller.enqueue(encoder.encode(payload));
              } catch {
                deregisterEmitter(id);
              }
            };
            registerEmitter(id, emit);

            const hello = `data: ${JSON.stringify({ type: EVENTS.CONNECTED, id })}\n\n`;
            controller.enqueue(encoder.encode(hello));
          },
          cancel() {
            deregisterEmitter(id);
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            ...CORS,
          },
        });
      }

      if (req.method === "GET" && url.pathname === "/ping") {
        await query(`SELECT * FROM ${TABLES.SEGMENTS}`);
        await query(`SELECT * FROM ${TABLES.STATE_HISTORY}`);
        await query(`SELECT * FROM ${TABLES.HEARTBEAT_LOG}`);
        await query(`SELECT * FROM ${TABLES.UI_LAYOUTS}`);
        return json({ ok: true });
      }

      const layoutMatch = url.pathname.match(/^\/ui-layout\/([a-z_]+)$/);
      if (req.method === "GET" && layoutMatch) {
        const key = layoutMatch[1];

        const allLayouts = await query("SELECT * FROM ui_layouts");
        const layout = allLayouts.find(
          (r) => (r as Record<string, unknown>).layout_key === key,
        ) as Record<string, unknown> | undefined;

        if (!layout) {
          return new Response("Layout not found", {
            status: 404,
            headers: { ...NO_CACHE, ...CORS },
          });
        }

        return new Response(layout.html as string, {
          headers: { "Content-Type": "text/html", ...NO_CACHE, ...CORS },
        });
      }

      if (
        req.method === "GET" &&
        (url.pathname === "/" || url.pathname === "/index.html")
      ) {
        return new Response(Bun.file("public/index.html"), {
          headers: { "Content-Type": "text/html; charset=utf-8", ...NO_CACHE },
        });
      }

      return new Response("Not found", {
        status: 404,
        headers: { ...NO_CACHE, ...CORS },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[ERROR] ${req.method} ${url.pathname} —`, message);
      return json({ error: message }, 500);
    }
  },
});

console.log(
  `Horrible Calculator running on http://localhost:${CONFIG.SERVER.PORT}`,
);
console.log(
  `Pressing = will trigger 70+ sequential database calls. This is intentional.`,
);

startJanitor();

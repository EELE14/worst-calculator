# Horrible Calculator

A fully functional calculator that is deliberately, methodically, and exhaustingly slow and painful to use.

Every arithmetic operation is stored as a separate code segment in a PostgreSQL database. The calculator fetches each segment fresh on every interaction, never caching anything. Segments trigger further segment fetches recursively. The end result is a calculator that is as slow as the sheer volume of unnecessary database calls and computational waste can make it, is architecturally inexplicable to any engineer who encounters it, and is functionally correct just often enough to make users question their own sanity rather than the software.

This is not a joke project done badly. This is a joke project done with precision and craftsmanship. The awfulness is intentional and thorough.

---

## How to start it

```
docker-compose up -d
bun run scripts/seed-database.ts
bun run src/server.ts
```

Then open `http://localhost:3000` in your browser.

---

## Warnings

- Pressing `=` triggers **70+ sequential database calls** with no parallelism. There are no artificial delays. The wait time is determined entirely by PostgreSQL round-trip latency multiplied by the number of calls.
- The equals button lies **15% of the time**. It will silently reset your calculation to 0 with no error, no message, and no indication that anything went wrong. This is intentional.
- Button positions change randomly between keypresses. This is also intentional.
- Every keypress triggers approximately 30 database calls. Typing a five-digit number requires 150 database calls.
- There is no index on `segment_key`. Every segment lookup is a full table scan. This is intentional.
- The database grows indefinitely. State is never updated, only appended. There is no cleanup.

---

## Core design principles

1. **Nothing is local.** No arithmetic logic lives in the application code. Ever.
2. **Everything is fetched.** Every digit press, operator press, and display update triggers at least one database round-trip.
3. **Segments call segments.** Each fetched segment is responsible for requesting the next segment it needs. Minimum recursion depth for any operation: 12 database round-trips.
4. **eval() everywhere.** All fetched segments are strings. They are executed via `eval()` at runtime.
5. **No caching. Ever.** Every fetch is a fresh HTTP or DB round-trip. Cache headers are explicitly disabled.
6. **The UI reloads on every keypress.** Button layout is re-fetched from the database on every interaction.
7. **The equals button lies sometimes.** With a 15% probability, the equals button fetches a decoy segment that resets the calculation silently.
8. **All results are written back to the database before being displayed.** Every answer is persisted, then re-fetched for display.
9. **There is no index on `segment_key`.** Fetching a segment requires a full table scan every time. This is intentional.
10. **Every segment is wrapped in three.** No segment executes directly. Every segment_key resolves to a pre-segment (checks if execution is permitted), the actual segment, and a post-segment (verifies the result was stored correctly). This triples the segment chain length for every operation.
11. **Never use WHERE.** All segment fetches retrieve the entire `segments` table with `SELECT *` and filter the correct row in JavaScript. The database does no work it could do efficiently.
12. **State is never read directly.** Before reading any value from the state tables, the full history of all rows is fetched and replayed in JavaScript to reconstruct the current state from scratch.
13. **A heartbeat segment runs between every other segment.** It does nothing except write a timestamp to a `heartbeat_log` table.

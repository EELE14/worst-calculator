# How this works.

This is a fully functional calculator. It also is, by design,
catastrophically inefficient. Every number you see on screen was
fetched from a PostgreSQL database. No arithmetic happens in this page
or the server, only in database-stored code strings executed via
eval().

1. Nothing is local. All logic lives in the segments table as JavaScript strings. The server fetches them and eval()s them.

2. No WHERE clauses. Every lookup does SELECT * FROM segments, all 111 rows, then filters the right one in JavaScript.

3. Every segment is three. Before any segment runs, a pre segment fires to check permissions. After it runs, a post segment verifies the result. One logical action = three database lookups.

4. State is never read directly. To know the current display value, the server fetches the complete history of all state changes ever written, then replays them from scratch.

5. Every query opens a new TCP connection. There is no connection pool. Each query: new connection -> query -> close. And before each real query, a throwaway probe connection runs SELECT 1 and closes.

6. Every pre and post calls this server via HTTP. That loopback call triggers four more full-table queries, each over their own two TCP connections.

7. Segments chain recursively. Pressing = runs through 14 logical segments. Each has a pre, a main, and a post. Between and after each triad the loader runs additional integrity scans of all five tables.

The wait time you experience is determined entirely by PostgreSQL round-trip latency multiplied by the number of calls.

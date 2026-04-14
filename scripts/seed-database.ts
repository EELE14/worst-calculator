/* Copyright (c) 2026 eele14. All Rights Reserved. */
import { query } from "../src/db.ts";

function preCode(key: string): string {
  return (
    `const _pre_segs  = await query('SELECT * FROM segments');\n` +
    `const _pre_state = await query('SELECT * FROM state_history');\n` +
    `const _pre_calc  = await query('SELECT * FROM calculation_log');\n` +
    `const _pre_hb    = await query('SELECT * FROM heartbeat_log');\n` +
    `const _pre_ui    = await query('SELECT * FROM ui_layouts');\n` +
    `const _seg = _pre_segs.find(s => s.segment_key === '${key}');\n` +
    `if (!_seg || !_seg.permitted) throw new Error('Segment ${key} is not permitted');\n` +
    `await ping();\n` +
    `await query("INSERT INTO heartbeat_log (segment_key) VALUES ('pre_${key}:announce')");\n` +
    `await query("INSERT INTO heartbeat_log (segment_key) VALUES ('pre_${key}:confirm')");\n` +
    `await query("INSERT INTO heartbeat_log (segment_key) VALUES ('pre_${key}:witness')");`
  );
}

function postCode(key: string): string {
  return (
    `const _post_segs  = await query('SELECT * FROM segments');\n` +
    `const _post_state = await query('SELECT * FROM state_history');\n` +
    `const _post_calc  = await query('SELECT * FROM calculation_log');\n` +
    `const _post_hb    = await query('SELECT * FROM heartbeat_log');\n` +
    `const _post_ui    = await query('SELECT * FROM ui_layouts');\n` +
    `await ping();\n` +
    `await query("INSERT INTO heartbeat_log (segment_key) VALUES ('post_${key}:close')");\n` +
    `await query("INSERT INTO heartbeat_log (segment_key) VALUES ('post_${key}:verify')");\n` +
    `await query("INSERT INTO heartbeat_log (segment_key) VALUES ('post_${key}:archive')");`
  );
}

interface SegmentDef {
  key: string;
  code: string;
  next_segment: string | null;
  description: string;
}

const segments: SegmentDef[] = [
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(
    (d): SegmentDef => ({
      key: `digit_${d}`,
      code:
        `const _hist = await query('SELECT * FROM state_history');\n` +
        `const _dispRows = _hist.filter(r => r.key === 'display_buffer');\n` +
        `const _cur = _dispRows.length > 0 ? _dispRows[_dispRows.length - 1].value : '';\n` +
        `const _curClean = (_cur || '').replace(/,/g, '');\n` +
        `const _appended = (_curClean === '0' || _curClean === '') ? '${d}' : _curClean + '${d}';\n` +
        `await query("INSERT INTO state_history (key, value) VALUES ('display_buffer', $1)", [_appended]);\n` +
        `context.display_buffer = _appended;`,
      next_segment: "validate_display",
      description: `Appends digit ${d} to the display buffer`,
    }),
  ),

  {
    key: "validate_display",
    code:
      `const _hist = await query('SELECT * FROM state_history');\n` +
      `const _dispRows = _hist.filter(r => r.key === 'display_buffer');\n` +
      `const _cur = _dispRows.length > 0 ? _dispRows[_dispRows.length - 1].value : '0';\n` +
      `context.display_buffer = (_cur === null || _cur === '') ? '0' : _cur;`,
    next_segment: "format_display",
    description: "Checks display buffer is not null; defaults to '0'",
  },

  {
    key: "format_display",
    code:
      `const _raw = (context.display_buffer || '0').replace(/,/g, '');\n` +
      `const _num = parseFloat(_raw);\n` +
      `if (!isNaN(_num)) {\n` +
      `  context.display_buffer = _num.toLocaleString('en-US', { maximumFractionDigits: 10 });\n` +
      `}`,
    next_segment: "render_display",
    description: "Adds thousands separators to the display value",
  },

  {
    key: "render_display",

    code:
      `const _rdHist = await query('SELECT * FROM state_history');\n` +
      `const _rdOp1 = _rdHist.filter(r => r.key === 'operand_1');\n` +
      `const _rdOp  = _rdHist.filter(r => r.key === 'operator');\n` +
      `const _rdOperand1 = _rdOp1.length > 0 ? _rdOp1[_rdOp1.length - 1].value : null;\n` +
      `const _rdOperator = _rdOp.length  > 0 ? _rdOp[_rdOp.length   - 1].value : null;\n` +
      `const _rdDisp = context.display_buffer || '0';\n` +
      `if (_rdOperand1 !== null && _rdOperand1 !== undefined && _rdOperator !== null && _rdOperator !== undefined) {\n` +
      `  const _rdSecond = (_rdDisp !== '0' && _rdDisp !== '') ? ' ' + _rdDisp : '';\n` +
      `  context.html = '<div class="display-value">' + _rdOperand1 + ' ' + _rdOperator + _rdSecond + '</div>';\n` +
      `} else {\n` +
      `  context.html = '<div class="display-value">' + _rdDisp + '</div>';\n` +
      `}`,
    next_segment: "log_display_update",
    description:
      "Builds the display HTML. Shows full expression (17 + 3) when an operator is pending.",
  },

  {
    key: "log_display_update",
    code: `await query("INSERT INTO state_history (key, value) VALUES ('display_buffer', $1)", [context.display_buffer]);`,
    next_segment: "fetch_ui_layout",
    description: "Persists the current display value to state_history (again)",
  },

  {
    key: "fetch_ui_layout",
    code:
      `const _layouts = await query('SELECT * FROM ui_layouts');\n` +
      `const _layout = _layouts.find(l => l.layout_key === 'layout_standard');\n` +
      `context.buttons_html = _layout ? _layout.html : '';`,
    next_segment: "apply_ui_layout",
    description:
      "Re-fetches a random button layout from ui_layouts (full table scan)",
  },

  {
    key: "apply_ui_layout",
    code: `context.apply_done = true;`,
    next_segment: null,
    description:
      "Signals that context.buttons_html is ready for the client to render",
  },

  ...(
    [
      ["+", "add"],
      ["-", "subtract"],
      ["*", "multiply"],
      ["/", "divide"],
    ] as const
  ).map(
    ([op, name]): SegmentDef => ({
      key: `op_${name}`,
      code:
        `await query("INSERT INTO state_history (key, value) VALUES ('operator', '${op}')");\n` +
        `context.operator = '${op}';`,
      next_segment: "store_operand_1",
      description: `Stores '${op}' as the pending operator in state_history`,
    }),
  ),

  {
    key: "store_operand_1",
    code:
      `const _hist = await query('SELECT * FROM state_history');\n` +
      `const _dispRows = _hist.filter(r => r.key === 'display_buffer');\n` +
      `const _raw = _dispRows.length > 0 ? _dispRows[_dispRows.length - 1].value : '0';\n` +
      `const _numStr = (_raw || '0').replace(/,/g, '');\n` +
      `await query("INSERT INTO state_history (key, value) VALUES ('operand_1', $1)", [_numStr]);\n` +
      `context.operand_1 = _numStr;`,
    next_segment: "clear_display_buffer",
    description:
      "Saves the current display value as operand_1 in state_history",
  },

  {
    key: "clear_display_buffer",
    code:
      `await query("INSERT INTO state_history (key, value) VALUES ('display_buffer', '0')");\n` +
      `context.display_buffer = '0';`,
    next_segment: "render_display",
    description:
      "Resets display buffer to '0' via INSERT (never UPDATE), then re-renders expression",
  },

  {
    key: "equals_entry",

    code: `// no decoy`,
    next_segment: "retrieve_operand_1",
    description:
      "Entry point for = press. Routes directly to retrieve_operand_1.",
  },

  {
    key: "retrieve_operand_1",
    code:
      `const _hist = await query('SELECT * FROM state_history');\n` +
      `const _rows = _hist.filter(r => r.key === 'operand_1');\n` +
      `context.operand_1 = _rows.length > 0 ? _rows[_rows.length - 1].value : null;`,
    next_segment: "retrieve_operand_2",
    description: "Reconstructs operand_1 by replaying full state_history in JS",
  },

  {
    key: "retrieve_operand_2",
    code:
      `const _hist = await query('SELECT * FROM state_history');\n` +
      `const _dispRows = _hist.filter(r => r.key === 'display_buffer');\n` +
      `const _raw = _dispRows.length > 0 ? _dispRows[_dispRows.length - 1].value : '0';\n` +
      `context.operand_2 = (_raw || '0').replace(/,/g, '');\n` +
      `await query("INSERT INTO state_history (key, value) VALUES ('operand_2', $1)", [context.operand_2]);`,
    next_segment: "retrieve_operator",
    description: "Reads display as operand_2, persists it to state_history",
  },

  {
    key: "retrieve_operator",
    code:
      `const _hist = await query('SELECT * FROM state_history');\n` +
      `const _rows = _hist.filter(r => r.key === 'operator');\n` +
      `context.operator = _rows.length > 0 ? _rows[_rows.length - 1].value : '+';`,
    next_segment: "validate_operands",
    description:
      "Reconstructs the pending operator by replaying full state_history",
  },

  {
    key: "validate_operands",
    code:
      `const _a = parseFloat(context.operand_1 || '');\n` +
      `const _b = parseFloat(context.operand_2 || '');\n` +
      `if (isNaN(_a) || isNaN(_b)) { context._next_override = 'decoy_reset'; }`,
    next_segment: "select_operation_segment",
    description: "Validates both operands are numeric; routes to decoy if not",
  },

  {
    key: "select_operation_segment",
    code:
      `const _opMap = {'+': 'compute_add', '-': 'compute_subtract', '*': 'compute_multiply', '/': 'compute_divide'};\n` +
      `context._next_override = _opMap[context.operator] || 'compute_add';`,
    next_segment: null,
    description:
      "Reads operator from context, sets _next_override to the correct compute_* key",
  },

  {
    key: "compute_add",
    code:
      `const _a = parseFloat(context.operand_1 || '0');\n` +
      `const _b = parseFloat(context.operand_2 || '0');\n` +
      `context.result = String(_a + _b);`,
    next_segment: "format_result",
    description: "Performs a + b. Logic lives in DB. Not in application code.",
  },

  {
    key: "compute_subtract",
    code:
      `const _a = parseFloat(context.operand_1 || '0');\n` +
      `const _b = parseFloat(context.operand_2 || '0');\n` +
      `context.result = String(_a - _b);`,
    next_segment: "format_result",
    description: "Performs a - b. Logic lives in DB. Not in application code.",
  },

  {
    key: "compute_multiply",
    code:
      `const _a = parseFloat(context.operand_1 || '0');\n` +
      `const _b = parseFloat(context.operand_2 || '0');\n` +
      `context.result = String(_a * _b);`,
    next_segment: "format_result",
    description: "Performs a * b. Logic lives in DB. Not in application code.",
  },

  {
    key: "compute_divide",
    code:
      `const _a = parseFloat(context.operand_1 || '0');\n` +
      `const _b = parseFloat(context.operand_2 || '0');\n` +
      `context.result = _b === 0 ? 'Error' : String(_a / _b);`,
    next_segment: "format_result",
    description:
      "Performs a / b. Division by zero returns 'Error'. Logic lives in DB.",
  },

  {
    key: "format_result",
    code:
      `const _num = parseFloat((context.result || '').replace(/,/g, ''));\n` +
      `if (!isNaN(_num)) {\n` +
      `  context.result = _num.toLocaleString('en-US', { maximumFractionDigits: 10 });\n` +
      `}\n` +
      `context.display_buffer = context.result;`,
    next_segment: "write_result_to_db",
    description: "Applies locale-aware formatting to the result",
  },

  {
    key: "write_result_to_db",
    code:
      `const _expr = (context.operand_1 || '?') + ' ' + (context.operator || '?') + ' ' + (context.operand_2 || '?');\n` +
      `await query(\n` +
      `  "INSERT INTO calculation_log (input_expression, result, segment_chain, total_duration_ms) VALUES ($1, $2, $3, $4)",\n` +
      `  [_expr, context.result, context.segment_chain || [], Date.now() - (context._start_time || Date.now())]\n` +
      `);`,
    next_segment: "re_fetch_result_from_db",
    description:
      "Persists result to calculation_log before it can be displayed",
  },

  {
    key: "re_fetch_result_from_db",

    code:
      `const _logs = await query('SELECT * FROM calculation_log');\n` +
      `const _sorted = _logs.slice().sort((a, b) => {\n` +
      `  const tA = a.created_at ? new Date(a.created_at).getTime() : 0;\n` +
      `  const tB = b.created_at ? new Date(b.created_at).getTime() : 0;\n` +
      `  return tB - tA;\n` +
      `});\n` +
      `const _latest = _sorted[0];\n` +
      `if (_latest) { context.result = _latest.result; }`,
    next_segment: "render_result",
    description:
      "Re-fetches result from calculation_log (full table scan, filtered in JS)",
  },

  {
    key: "render_result",

    code:
      `context.html = '<div class="display-value result">' + (context.result || '0') + '</div>';\n` +
      `context.display_buffer = '0';\n` +
      `await query("INSERT INTO state_history (key, value) VALUES ('display_buffer', '0')");\n` +
      `await query("INSERT INTO state_history (key, value) VALUES ('operand_1', $1)", [null]);\n` +
      `await query("INSERT INTO state_history (key, value) VALUES ('operator', $1)", [null]);`,
    next_segment: "log_display_update",
    description:
      "Renders result as display HTML, persists display state, clears expression state",
  },

  {
    key: "decoy_reset",
    code:
      `await query("INSERT INTO state_history (key, value) VALUES ('display_buffer', '0')");\n` +
      `await query("INSERT INTO state_history (key, value) VALUES ('operand_1', $1)", [null]);\n` +
      `await query("INSERT INTO state_history (key, value) VALUES ('operand_2', $1)", [null]);\n` +
      `await query("INSERT INTO state_history (key, value) VALUES ('operator', $1)", [null]);\n` +
      `context.display_buffer = '0';\n` +
      `context.operand_1 = null;\n` +
      `context.operand_2 = null;\n` +
      `context.operator = null;\n` +
      `context.result = null;\n` +
      `context.html = '<div class="display-value">0</div>';`,
    next_segment: "fetch_ui_layout",
    description:
      "Silently wipes all state. No error message. The calculator lies.",
  },
];

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function btn(label: string, action: string, extraStyle = ""): string {
  const style = extraStyle ? ` style="${extraStyle}"` : "";
  return `<button class="btn" onclick="${action}"${style}>${label}</button>`;
}

//   row0: d[6] d[7] d[8] | ÷
//   row1: d[3] d[4] d[5] | ×
//   row2: d[0] d[1] d[2] | −
//   row3: d[9]  C   =   | +
function buildLayout(digitOrder: number[], buttonWidth = "60px"): string {
  const d = digitOrder;
  const rows = [
    [
      btn(String(d[6]), `pressDigit(${d[6]})`),
      btn(String(d[7]), `pressDigit(${d[7]})`),
      btn(String(d[8]), `pressDigit(${d[8]})`),
      btn("÷", `pressOperator('/')`),
    ],
    [
      btn(String(d[3]), `pressDigit(${d[3]})`),
      btn(String(d[4]), `pressDigit(${d[4]})`),
      btn(String(d[5]), `pressDigit(${d[5]})`),
      btn("×", `pressOperator('*')`),
    ],
    [
      btn(String(d[0]), `pressDigit(${d[0]})`),
      btn(String(d[1]), `pressDigit(${d[1]})`),
      btn(String(d[2]), `pressDigit(${d[2]})`),
      btn("−", `pressOperator('-')`),
    ],
    [
      btn(String(d[9]), `pressDigit(${d[9]})`),
      btn("C", "pressClear()"),
      btn("=", "pressEquals()"),
      btn("+", `pressOperator('+')`),
    ],
  ].map((row) => `<div class="btn-row">${row.join("")}</div>`);

  return `<div class="btn-grid" style="--btn-width:${buttonWidth}">${rows.join("")}</div>`;
}

const standardOrder = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
const shuffledOrder = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);

const uiLayouts = [
  { layout_key: "layout_standard", html: buildLayout(standardOrder, "60px") },
  { layout_key: "layout_shuffled", html: buildLayout(shuffledOrder, "60px") },
  { layout_key: "layout_wide", html: buildLayout(standardOrder, "72px") }, // 20% wider
];

async function seed(): Promise<void> {
  console.log("Truncating existing data…");
  await query(
    "TRUNCATE segments, ui_layouts, calculation_log, heartbeat_log, state_history RESTART IDENTITY",
  );

  const totalRows = segments.length * 3;
  console.log(
    `Seeding ${segments.length} logical segments → ${totalRows} total rows…`,
  );

  for (const seg of segments) {
    // 1. pre_X
    await query(
      "INSERT INTO segments (segment_key, code, next_segment, description) VALUES ($1, $2, $3, $4)",
      [
        `pre_${seg.key}`,
        preCode(seg.key),
        null,
        `Pre-check wrapper for ${seg.key}`,
      ],
    );

    // 2. X
    await query(
      "INSERT INTO segments (segment_key, code, next_segment, description) VALUES ($1, $2, $3, $4)",
      [seg.key, seg.code, seg.next_segment, seg.description],
    );

    // 3. post_X
    await query(
      "INSERT INTO segments (segment_key, code, next_segment, description) VALUES ($1, $2, $3, $4)",
      [
        `post_${seg.key}`,
        postCode(seg.key),
        null,
        `Post-verify wrapper for ${seg.key}`,
      ],
    );
  }

  console.log("Seeding UI layouts…");
  for (const layout of uiLayouts) {
    await query("INSERT INTO ui_layouts (layout_key, html) VALUES ($1, $2)", [
      layout.layout_key,
      layout.html,
    ]);
  }

  const [segCount] = await query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM segments",
  );
  const [layoutCount] = await query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM ui_layouts",
  );

  const allKeys = await query<{ segment_key: string }>(
    "SELECT segment_key FROM segments",
  );
  const keySet = new Set(allKeys.map((r) => r.segment_key));
  const missing: string[] = [];
  for (const seg of segments) {
    for (const variant of [`pre_${seg.key}`, seg.key, `post_${seg.key}`]) {
      if (!keySet.has(variant)) missing.push(variant);
    }
  }

  console.log("\nSeed complete:");
  console.log(`  segments:   ${segCount.count} rows (expected ${totalRows})`);
  console.log(`  ui_layouts: ${layoutCount.count} rows (expected 3)`);
  console.log(`  Shuffled digit order: [${shuffledOrder.join(", ")}]`);

  if (missing.length > 0) {
    console.error("\nMISSING SEGMENT KEYS:", missing);
    process.exit(1);
  } else {
    console.log("  All segment triads verified. ✓");
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

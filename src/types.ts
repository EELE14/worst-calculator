/* Copyright (c) 2026 eele14. All Rights Reserved. */
export interface CalculatorContext {
  display_buffer: string | null;
  operand_1: string | null;
  operand_2: string | null;
  operator: string | null;
  result: string | null;
  html: string | null;
  buttons_html: string | null;
  segment_chain: string[];
  apply_done?: boolean;
  _next_override?: string;
  _start_time?: number;
}

export type Emitter = (type: string, data: Record<string, unknown>) => void;

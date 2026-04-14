/* Copyright (c) 2026 eele14. All Rights Reserved. */
import type { Emitter } from "./types.ts";

export type { Emitter };

const registry = new Map<string, Emitter>();

export function registerEmitter(id: string, emitter: Emitter): void {
  registry.set(id, emitter);
}

export function deregisterEmitter(id: string): void {
  registry.delete(id);
}

export function getEmitter(id: string): Emitter | undefined {
  return registry.get(id);
}

import { NgZone } from '@angular/core';

type DiagEvent = {
  ts: string;
  name: string;
  inZone: boolean;
  data?: unknown;
};

type DiagState = {
  createdAt: string;
  counters: Record<string, number>;
  events: DiagEvent[];
  flags: Record<string, boolean>;
  lastHttp?: {
    kind: string;
    method?: string;
    url?: string;
    inZone: boolean;
    ts: string;
  };
  print: () => unknown;
  clear: () => void;
};

const MAX_EVENTS = 200;

function newDiagState(): DiagState {
  const state: DiagState = {
    createdAt: new Date().toISOString(),
    counters: {},
    events: [],
    flags: {},
    print: () => ({
      createdAt: state.createdAt,
      counters: { ...state.counters },
      lastHttp: state.lastHttp,
      recentEvents: state.events.slice(-20)
    }),
    clear: () => {
      state.counters = {};
      state.events = [];
      state.lastHttp = undefined;
    }
  };

  return state;
}

export function getYdmDiag(): DiagState {
  const g = globalThis as any;
  if (!g.__ydmDiag) {
    g.__ydmDiag = newDiagState();
  }
  return g.__ydmDiag as DiagState;
}

export function diagCount(name: string, amount = 1): number {
  const diag = getYdmDiag();
  diag.counters[name] = (diag.counters[name] ?? 0) + amount;
  return diag.counters[name];
}

export function diagEvent(name: string, data?: unknown, printToConsole = false): void {
  const diag = getYdmDiag();
  const entry: DiagEvent = {
    ts: new Date().toISOString(),
    name,
    inZone: NgZone.isInAngularZone(),
    data
  };
  diag.events.push(entry);
  if (diag.events.length > MAX_EVENTS) {
    diag.events.splice(0, diag.events.length - MAX_EVENTS);
  }

  if (printToConsole) {
    console.log('[YDM-DIAG]', entry.name, entry);
  }
}

export function diagHttpCallback(kind: 'next' | 'error' | 'complete', method?: string, url?: string): void {
  const inZone = NgZone.isInAngularZone();
  diagCount(`http.${kind}`);
  diagCount(`http.inZone.${inZone ? 'true' : 'false'}`);

  const diag = getYdmDiag();
  diag.lastHttp = {
    kind,
    method,
    url,
    inZone,
    ts: new Date().toISOString()
  };
}


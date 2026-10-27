/**
 * A host for tests: everything in memory (an in-memory sqlite, a map for the store), and every
 * call a connector makes on it kept where the test can look.
 */
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Host, Logger, OAuthFinish, Problem } from "./index.ts";

export interface TestHost extends Host {
  readonly emitted: { kind: string; payload: Record<string, unknown> }[];
  readonly recorded: Parameters<Host["record"]>[0][];
  readonly archived: Parameters<Host["archive"]>[0][];
  /** Every problem ever raised, open or closed, by title. */
  readonly raised: Map<string, Problem & { id: string; open: boolean }>;
  readonly callbacks: Map<string, OAuthFinish>;
  readonly settings: Record<string, string | undefined>;
}

export interface TestHostOptions {
  readonly name?: string;
  readonly settings?: Record<string, string | undefined>;
  readonly apis?: Record<string, unknown>;
  readonly google?: { readonly id: string; readonly secret: string; readonly callback?: string };
  readonly origin?: string;
  readonly db?: Database;
}

const quiet: Logger = { debug() {}, info() {}, warn() {}, error() {} };

export function testHost(opts: TestHostOptions = {}): TestHost {
  const name = opts.name ?? "test";
  const values = new Map<string, string>();
  const raised = new Map<string, Problem & { id: string; open: boolean }>();
  const origin = opts.origin ?? "http://host.test";
  const dataDir = mkdtempSync(join(tmpdir(), `connector-${name}-`));
  let ids = 0;
  const host: TestHost = {
    name,
    log: quiet,
    dataDir,
    inbox: join(dataDir, "inbox"),
    settings: { ...opts.settings },
    setting: (key) => host.settings[key],
    store: { get: (k) => values.get(k), set: (k, v) => (v === undefined ? values.delete(k) : values.set(k, v)) },
    db: opts.db ?? new Database(":memory:"),
    emitted: [],
    emit: (kind, payload) => void host.emitted.push({ kind, payload }),
    use: <T>(other: string) => {
      if (!opts.apis || !(other in opts.apis)) throw new Error(`${name}: connector ${other} is not loaded`);
      return opts.apis[other] as T;
    },
    http: { base: `/m/${name}`, url: (path) => `${origin}${path}`, origin: () => origin },
    callbacks: new Map(),
    oauth: {
      client: () => (opts.google ? { callback: "/auth/callback", ...opts.google } : undefined),
      state: (payload) => {
        const state = Buffer.from(JSON.stringify(payload)).toString("base64url");
        return { state, cookie: `oauth=${state}; Path=/auth; HttpOnly` };
      },
      onCallback: (claim, finish) => void host.callbacks.set(claim, finish),
    },
    raised,
    problems: {
      raise: (p) => {
        const open = raised.get(p.title);
        if (open?.open) {
          raised.set(p.title, { ...open, ...p });
          return { id: open.id, created: false };
        }
        const id = String(++ids);
        raised.set(p.title, { ...p, id, open: true });
        return { id, created: true };
      },
      resolve: (title) => {
        const open = raised.get(title);
        if (open) raised.set(title, { ...open, open: false });
      },
      open: (title) => {
        const p = raised.get(title);
        return p?.open ? p : undefined;
      },
    },
    recorded: [],
    record: (entry) => void host.recorded.push(entry),
    archived: [],
    archive: (item) => void host.archived.push(item),
  };
  return host;
}

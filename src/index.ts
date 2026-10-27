/**
 * The connector protocol: what a connector (a signed-in outside channel — email, Telegram,
 * LinkedIn, WhatsApp — or a capability other connectors build on, like a browser) exposes, and
 * what the host that runs it hands it. A connector is its own repository whose `index.ts`
 * default-exports a `Connector`; it imports nothing from its host, only this package.
 *
 * The host (pai today) installs connectors by git URL, imports them at runtime, gives each one a
 * `Host`, turns its `tools` into an MCP server for the AI, shows its `status` with the link that
 * fixes it, and calls `send`, which answers whether the message is really there.
 */
import type { Database } from "bun:sqlite";
import { z } from "zod";

export { z };
export type { Database };

// --- status and sends --------------------------------------------------------------------------

/**
 * Whether a connector can act right now: `signed_in`, `signed_out` (never connected, or the login
 * was dropped — `fix` is where to sign in) or `broken` (connected but failing — `detail` says how,
 * `fix` how to repair it).
 */
export type State = "signed_in" | "signed_out" | "broken";

export interface Fix {
  readonly label: string;
  readonly url: string;
}

export interface Status {
  readonly state: State;
  /** Who it is signed in as (`+420…`, `@handle`, an address), or what is wrong. */
  readonly detail?: string;
  readonly fix?: Fix;
}

/** What a send came back as, read back out of the channel itself: there, there unconfirmed, or not there. */
export type SendOutcome = "verified" | "unverified" | "not_sent";

export interface SendRequest {
  /** A chat, a handle, an address — whatever the channel names a recipient by. */
  readonly to: string;
  readonly text: string;
  readonly subject?: string;
}

export interface SendResult {
  readonly outcome: SendOutcome;
  readonly detail?: string;
}

export interface Health {
  readonly ok: boolean;
  readonly detail?: string;
}

// --- tools -------------------------------------------------------------------------------------

/** An MCP tool result: text (usually JSON) or an image, and whether it is an error. */
export interface ToolResult {
  readonly content: readonly ({ readonly type: "text"; readonly text: string } | { readonly type: "image"; readonly data: string; readonly mimeType: string })[];
  readonly isError?: boolean;
}

/** Who is calling a tool: the host's name for the agent or session (an outbound action is logged against it). */
export interface ToolCall {
  readonly agent?: string;
}

/** An MCP tool definition: name, description, a zod shape for its input, and what it does. */
export interface Tool<S extends z.ZodRawShape = z.ZodRawShape> {
  readonly name: string;
  readonly description: string;
  readonly input: S;
  readonly run: (args: z.infer<z.ZodObject<S>>, call: ToolCall) => Promise<ToolResult> | ToolResult;
}

/** A tool, with its handler's arguments typed from the shape. */
export const tool = <S extends z.ZodRawShape>(name: string, description: string, input: S, run: Tool<S>["run"]): Tool<any> => ({ name, description, input, run: run as unknown as Tool<any>["run"] });

/** What a tool answers with: its data as JSON text, the one shape most tools return. */
export const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });

/** A tool answer that is an error the model should read. */
export const failed = (message: string): ToolResult => ({ content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true });

// --- what the host hands a connector -----------------------------------------------------------

export interface Logger {
  debug(msg: string, ...rest: unknown[]): void;
  info(msg: string, ...rest: unknown[]): void;
  warn(msg: string, ...rest: unknown[]): void;
  error(msg: string, ...rest: unknown[]): void;
}

/** Strings kept for the connector across restarts; `undefined` deletes. */
export interface KeyValue {
  get(key: string): string | undefined;
  set(key: string, value: string | undefined): void;
}

/** Something only the user can fix (reconnect a mailbox, restart a watcher), kept as one item per title. */
export interface Problem {
  readonly title: string;
  /** What is wrong, kept current. */
  readonly detail: string;
  /** What to do about it, markdown (a link). */
  readonly action?: string;
  /** Waits on the user rather than on the host's own staff. */
  readonly waitsOnUser?: boolean;
}

export interface Problems {
  /** Raises the problem with this title, or brings its detail and action up to date: never two of one title. */
  raise(problem: Problem): { readonly id: string; readonly created: boolean };
  /** The thing answers again: the open problem with this title closes. */
  resolve(title: string): void;
  /** The open problem with this title, if any. */
  open(title: string): Problem | undefined;
}

/** The second half of an OAuth consent: the callback's request and the verified state's claims. */
export type OAuthFinish = (req: Request, url: URL, claims: Readonly<Record<string, unknown>>) => Promise<Response> | Response;

export interface OAuth {
  /** The host's OAuth client for a provider and the one callback path it is registered with; undefined when it has none. */
  client(provider: "google"): { readonly id: string; readonly secret: string; readonly callback: string } | undefined;
  /**
   * An OAuth `state` for `payload`, signed with the host's key so it comes back verified, and the
   * `Set-Cookie` header the redirect to the provider must carry (the callback checks the two match).
   */
  state(payload: object, req: Request): { readonly state: string; readonly cookie: string };
  /** The callback hands a verified state carrying `claim` to `finish`: one redirect URI, several consents. */
  onCallback(claim: string, finish: OAuthFinish): void;
}

export interface Http {
  /** Where the connector's `routes` are served on the host (`/m/<name>`). */
  readonly base: string;
  /** A host path as an absolute URL the user can open. */
  url(path: string): string;
  /** The host's origin as the browser sees it (through a proxy when there is one). */
  origin(req: Request, url: URL): string;
}

/** What a connector is handed at runtime: everything it needs from the host, and nothing else. */
export interface Host {
  /** The connector's name as the host lists it. */
  readonly name: string;
  readonly log: Logger;
  /** A directory of its own for state (sessions, caches), created for it. */
  readonly dataDir: string;
  /** Where files meant for the AI go (downloads, attachments). */
  readonly inbox: string;
  /** One of the host's settings or secrets (`TELEGRAM_API_ID`, …): configuration the user gave the host. */
  setting(key: string): string | undefined;
  /** Key-value storage of its own; also what its `settings` are edited into. */
  readonly store: KeyValue;
  /** The host's sqlite database, for tables of its own (name them after the connector). */
  readonly db: Database;
  /** Puts an event on the host's bus; `events` describes the kinds. */
  emit(kind: string, payload: Record<string, unknown>): void;
  /** Another connector's `api` (one this connector `requires`), typed by the caller. */
  use<T>(connector: string): T;
  readonly http: Http;
  readonly oauth: OAuth;
  readonly problems: Problems;
  /** Something it did in the world, for the log the user reads (`sent`: a message went out). */
  record(entry: { readonly action: "sent"; readonly text: string; readonly by?: string; readonly link?: string }): void;
  /** Text the host's search should find later (a mail sent or received). */
  archive(item: { readonly source: string; readonly id: string; readonly title: string; readonly body: string; readonly at?: number }): void;
}

/** What `<host> <connector> …` is handed: the host's API (where the connector runs) and the terminal. */
export interface Cli {
  readonly name: string;
  readonly args: readonly string[];
  readonly json: boolean;
  readonly dataDir: string;
  readonly api: (path: string, init?: RequestInit) => Promise<any>;
  readonly post: (path: string, data: unknown) => Promise<any>;
  /** The host's API as a raw response (a stream), with the same address and credentials. */
  readonly fetch: (path: string, init?: RequestInit) => Promise<Response>;
  readonly out: (data: unknown, pretty?: () => string) => void;
  /** A spinner on stderr; `update` changes its label, `stop` ends it. */
  readonly spin: (label: string) => { update(label: string): void; stop(note?: string): void };
  /** Another connector's command line, run right here. */
  readonly run: (connector: string, args: readonly string[]) => Promise<number>;
  /** How to reach the machine the host runs on over ssh (`args` without the target), when this is not it. */
  readonly ssh: () => { readonly args: readonly string[]; readonly target: string } | undefined;
}

// --- the connector -----------------------------------------------------------------------------

export interface EventDef {
  readonly kind: string;
  readonly description: string;
}

export interface SettingDef {
  readonly key: string;
  readonly label: string;
  readonly hint?: string;
  readonly secret?: boolean;
  /** `toggle` settings are "1" or ""; the rest free text. */
  readonly type?: "text" | "toggle" | "number";
}

export type Route = (req: Request, path: string, url: URL, host: Host) => Promise<Response | undefined> | Response | undefined;
export type Mount = (req: Request, url: URL, host: Host) => Promise<Response | undefined> | Response | undefined;

/**
 * `connector`: a signed-in outside channel (events in, tools out, sends verified by read-back), which must say its
 * `status`. `capability`: something other connectors build on (a browser), reached through its `api`.
 */
export type Kind = "connector" | "capability";

export interface Connector {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** Default `connector`. */
  readonly kind?: Kind;
  /** Connectors this one builds on: they start first, and `host.use(name)` gives their `api`. */
  readonly requires?: readonly string[];
  /** What other connectors get from `host.use(this.name)`. */
  readonly api?: object;
  /** Off means nothing of it reaches the AI and it is not started; default on. */
  readonly enabled?: (host: Host) => boolean;
  /** Asked whether or not it is enabled or started, so a connector that never started still says why. Required for `kind: "connector"`. */
  readonly status?: (host: Host) => Promise<Status> | Status;
  /** A message out, read back before it answers. */
  readonly send?: (message: SendRequest, host: Host) => Promise<SendResult>;
  readonly events?: readonly EventDef[];
  readonly tools?: readonly Tool<any>[];
  /** The MCP server name its tools are served under; default its name. */
  readonly server?: string;
  /** A paragraph for the AI: what the tools are and the rules for using them. */
  readonly instructions?: string;
  /** What the user can set, edited into `host.store`. */
  readonly settings?: readonly SettingDef[];
  /** Things connected one at a time with their own consent (mailboxes): what is connected, where to add or forget one (`{label}` is the name asked for). */
  readonly accounts?: {
    readonly list: (host: Host) => readonly { readonly label: string; readonly detail: string }[];
    readonly connectPath: string;
    readonly removePath: string;
    readonly hint: string;
  };
  /** http under `host.http.base`; `path` is what follows it. `undefined` is a 404. */
  readonly routes?: Route;
  /** Path prefixes it answers outside its base (`/gmail/`), behind the host's auth: links already out in the world. */
  readonly mounts?: Readonly<Record<string, Mount>>;
  /** A directory (relative to the connector's root) served as static files under `<base>/ui/`. */
  readonly ui?: string;
  /** `<host> <name> …`. */
  readonly cli?: (cli: Cli) => Promise<number | void>;
  readonly commands?: readonly { readonly name: string; readonly description: string }[];
  /** Subcommands that run where the user is (they need its browser, its files) rather than next to the host; `""` is the bare command. */
  readonly cliHere?: readonly string[];
  readonly start?: (host: Host) => Promise<void> | void;
  readonly stop?: () => Promise<void> | void;
  readonly health?: () => Promise<Health> | Health;
}

/** Typed identity: `export default defineConnector({ … })`. */
export const defineConnector = <C extends Connector>(c: C): C => c;

/** What is wrong with a default export that claims to be a connector; empty when it is one. */
export function problemsOf(c: unknown): string[] {
  if (!c || typeof c !== "object") return ["the default export is not an object"];
  const x = c as Partial<Connector>;
  const out: string[] = [];
  for (const key of ["name", "title", "description"] as const) if (typeof x[key] !== "string" || !x[key]) out.push(`${key} is missing`);
  if (x.name && !/^[a-z][a-z0-9-]*$/.test(x.name)) out.push(`name "${x.name}" is not lowercase letters, digits and dashes`);
  if ((x.kind ?? "connector") === "connector" && typeof x.status !== "function") out.push("a connector needs status");
  const names = new Set<string>();
  for (const t of x.tools ?? []) {
    if (!t?.name || typeof t.run !== "function") out.push("a tool needs a name and run");
    else if (names.has(t.name)) out.push(`tool ${t.name} is defined twice`);
    else names.add(t.name);
  }
  return out;
}

/** The status every host shows for a connector that failed to load or to answer. */
export const broken = (detail: string): Status => ({ state: "broken", detail });

/** Connectors ordered so that what one requires comes before it; a loop is an error. */
export function startOrder(names: readonly string[], requiresOf: (name: string) => readonly string[]): string[] {
  const out: string[] = [];
  const visit = (name: string, trail: string[]) => {
    if (out.includes(name)) return;
    if (trail.includes(name)) throw new Error(`connectors require each other in a loop: ${[...trail, name].join(" → ")}`);
    for (const dep of requiresOf(name)) if (names.includes(dep)) visit(dep, [...trail, name]);
    out.push(name);
  };
  for (const name of names) visit(name, []);
  return out;
}

# @desk/connector

The protocol desk connectors are written against. A connector is a repository (desk-email,
desk-telegram, desk-linkedin, desk-whatsapp, desk-browser) whose `index.ts` default-exports a
`Connector`. It imports nothing from the host that runs it, only this package. pai is the host
today: it clones connectors by git URL, imports them at runtime and hands each one a `Host`.

```sh
bun add github:elumixor/desk-connector#v0.1.0
```

## A connector

```ts
import { defineConnector, ok, tool, z } from "@desk/connector";

export default defineConnector({
  name: "mail",
  title: "Mail",
  description: "reads and sends mail",
  status: (host) => (host.store.get("token") ? { state: "signed_in", detail: "me@example.com" } : { state: "signed_out", fix: { label: "Connect", url: host.http.url(`${host.http.base}/connect`) } }),
  send: async ({ to, text }, host) => ({ outcome: "unverified" }),
  events: [{ kind: "mail.new", description: "a new message (from, subject)" }],
  tools: [tool("mail_search", "Search the mailbox.", { query: z.string() }, async ({ query }, call) => ok({ query, by: call.agent }))],
  instructions: "Mail: mail_search finds messages…",
  start: (host) => host.log.info("started"),
});
```

| field | what |
|---|---|
| `name`, `title`, `description` | how the host lists it; `name` is lowercase |
| `kind` | `connector` (default): a signed-in channel, must have `status`. `capability`: something other connectors use through `api` (the browser) |
| `status(host)` | `signed_in` / `signed_out` / `broken`, a `detail` (who it is signed in as, or what is wrong) and a `fix` link. Asked even when the connector never started |
| `send(message, host)` | a message out, read back out of the channel before answering: `verified` (it is there), `unverified` (it may be there: never send again), `not_sent` (nothing left: safe to retry) |
| `events` | the kinds it emits with `host.emit` |
| `tools`, `server` | MCP tool definitions (name, description, zod input shape, `run(args, call)`); the host serves them as one MCP server named `server` (default `name`). `call.agent` is who called |
| `instructions` | a paragraph for the AI about the tools |
| `requires`, `api` | other connectors started first; `host.use(name)` returns their `api` |
| `settings`, `accounts` | what the user can set (kept in `host.store`), and multi-account consent links (mailboxes) |
| `routes`, `mounts`, `ui` | http under `host.http.base` (`/m/<name>` on pai), extra path prefixes, a static directory under `<base>/ui/` |
| `cli`, `commands`, `cliHere` | `<host> <name> …` and its help; `cliHere` lists subcommands run where the user is, not next to the host |
| `enabled`, `start`, `stop`, `health` | lifecycle |

## The host

What a connector gets at runtime, and all it gets:

| member | what |
|---|---|
| `name`, `log`, `dataDir`, `inbox` | its name, a logger, a directory of its own, where files for the AI go |
| `setting(key)` | the host's settings and secrets (`TELEGRAM_API_ID`) |
| `store` | key-value storage of its own |
| `db` | the host's sqlite database (bun:sqlite), for tables named after the connector |
| `emit(kind, payload)` | an event on the host's bus |
| `use(name)` | another connector's `api` |
| `http` | `base` of its routes, `url(path)` (absolute, for links), `origin(req, url)` |
| `oauth` | the host's OAuth `client("google")` with its callback path, `state(payload, req)` for a signed state and its cookie, `onCallback(claim, finish)` |
| `problems` | `raise` / `resolve` / `open` one item per title for what only the user can fix (a reconnect link) |
| `record`, `archive` | an action for the user's log (`sent`), text for the host's search |

A connector's command line gets a `Cli`: its args, the host's API (`api`, `post`, `fetch`), output
(`out`, `spin`), `run` for another connector's command line and `ssh()` for the host machine.

## Helpers

- `tool(name, description, shape, run)`: a tool with typed arguments; `ok(data)` / `failed(message)` results.
- `problemsOf(x)`: what is wrong with a default export that claims to be a connector (the host refuses one with problems).
- `startOrder(names, requiresOf)`: the order to start them in.
- `@desk/connector/testing`: `testHost()`, an in-memory host that keeps what a connector emitted, recorded, archived and raised.

Connectors extend `@desk/connector/tsconfig.json` and `@desk/connector/biome.json`.

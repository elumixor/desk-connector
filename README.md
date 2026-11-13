# @desk/connector

The protocol and base class desk connectors are written against. The connectors live in
[`elumixor/desk-connectors`](https://github.com/elumixor/desk-connectors), each a directory whose
`index.ts` default-exports an instance of a class extending `BaseConnector`. A connector imports nothing
from the host that runs it, only this package. pai is the host today: it clones that repository, imports
the connectors its config names and hands each one a `Host`.

```sh
bun add github:elumixor/desk-connector#v0.5.0
```

## A connector

```ts
import { BaseConnector, ok, tool, z } from "@desk/connector";

class MailConnector extends BaseConnector {
  readonly name = "mail";
  readonly title = "Mail";
  readonly description = "reads and sends mail";
  readonly icon = "icon.svg";
  readonly events = [{ kind: "mail.new", title: "New mail", description: "a new message (from, subject)" }];
  readonly instructions = "Mail: mail_search finds messages…";
  readonly tools = [tool("mail_search", "Search the mailbox.", { query: z.string() }, async ({ query }, call) => ok({ query, by: call.agent }))];

  protected check() {
    return this.host.store.get("token")
      ? { state: "signed_in" as const, detail: "me@example.com" }
      : { state: "signed_out" as const, fix: { label: "Connect", url: this.host.http.url(`${this.host.http.base}/connect`) } };
  }

  override start() {
    this.host.log.info("started");
  }
}

export default new MailConnector();
```

| member | what |
|---|---|
| `name`, `title`, `description`, `icon` | how the host lists it; `name` is lowercase, `icon` a square image file next to `index.ts` |
| `kind` | `connector` (default): a signed-in channel. `capability`: something other connectors use through `api` (the browser) |
| `check()` | `signed_in` / `signed_out` / `broken`, a `detail` (who it is signed in as, or what is wrong) and a `fix` link. Asked even when the connector never started. `status()` answers it unless the user turned the connector off |
| `options` | what the user can set (kept in `host.store`), shown after the off switch every connector has; `settings` is the whole list |
| `actions()` | what the user can do right now: open a page (`url`), run something (`run`, answering a line or `{ message, thread }`), `danger` asks first |
| `press(press)` | a press on a button of a card it posted (`host.cards`): `{ card, button, row, agent }`; it acts and redraws the card, a throw is shown on the card |
| `send(message)` | a message out, read back out of the channel before answering: `verified` (it is there), `unverified` (it may be there: never send again), `not_sent` (nothing left: safe to retry) |
| `events` | the kinds it emits with `host.emit`: `kind`, a `title` a person reads, a `description` |
| `tools`, `server` | MCP tool definitions (name, description, zod input shape, `run(args, call)`); the host serves them as one MCP server named `server` (default `name`). `call.agent` is who called |
| `instructions` | a paragraph for the AI about the tools |
| `requires`, `api` | other connectors started first; `host.use(name)` returns their `api` |
| `accounts` | multi-account consent links (mailboxes) |
| `routes`, `mounts`, `ui` | http under `host.http.base` (`/m/<name>` on pai), extra path prefixes, a static directory under `<base>/ui/` |
| `cli`, `commands`, `cliHere` | `<host> <name> …` and its help; `cliHere` lists subcommands run where the user is, not next to the host. A command line runs with no host attached |
| `enabled()`, `start()`, `stop()`, `health()` | lifecycle, overridden as needed: `enabled` follows the off switch, `health` follows `status` |

## The host

What a connector gets at runtime, and all it gets, as `this.host` once it is attached:

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
| `startThread(request)` | a conversation with the host's AI that the user can open: an action hands it work it cannot do alone |
| `cards` | `post({ agent, view, text? })` a card into an agent's chat (answers its id), `update(id, view, text?)` redraws it in place, `get(id)` |
| `tell(agent, text, { quiet })` | a turn for an agent now, or with `quiet` context for its next turn without waking it |

A connector's command line gets a `Cli`: its args, the host's API (`api`, `post`, `fetch`), output
(`out`, `spin`), `run` for another connector's command line and `ssh()` for the host machine.

## Cards

A card is a declarative `CardView` the host draws in the agent's chat: `title`, `subtitle`, `icon`, `rows` and
`buttons`. A row has a `title`, a `state` (`idle`, `pending` (waiting on something outside, it starts by itself), `running`, `succeeded`, `failed`, `interrupted`, `cancelled`), a
`message`, a `url`, a rail of `steps` with the current `step`, `startedAt`/`updatedAt` (the time it took), a `log`
tail and its own `buttons`. A button is `{ id, label, icon?, primary?, url? }`: with `url` it is a link, otherwise a
press comes back to the connector's `press`. Icons are lucide's kebab-case names. The card lives on the host, so it
survives a reload with whatever the connector last drew; the connector keeps its own state keyed by the card's id.
`cardText(view)` is the plain form for a client that cannot draw it; `hasButton(view, button, row)` what a press may name.

## Helpers

- `tool(name, description, shape, run)`: a tool with typed arguments; `ok(data)` / `failed(message)` results.
- `json(data, status)`, `fail(error, status)`, `page(html, status)`: what routes answer with.
- `problemsOf(x)`: what is wrong with a default export that claims to be a connector (the host refuses one with problems).
- `startOrder(names, requiresOf)`: the order to start them in.
- `@desk/connector/testing`: `testHost()`, an in-memory host that keeps what a connector emitted, recorded, archived and raised.

Connectors extend `@desk/connector/tsconfig.json` and `@desk/connector/biome.json`.

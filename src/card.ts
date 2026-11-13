/**
 * A card a connector posts into an agent's chat and redraws in place: a declarative view the host draws (title,
 * subtitle, rows with a state, a status line, a link, a rail of steps, a log tail, buttons), never markup. A press on
 * one of its buttons comes back to the connector's `press`, which does what it means and updates the card. A client
 * that cannot draw cards shows `cardText(view)`.
 */

/** Where a row's work stands; `idle` is nothing started yet, `pending` is started and waiting for something to go on (a machine to connect). */
export type CardState = "idle" | "pending" | "running" | "succeeded" | "failed" | "interrupted" | "cancelled";

/** A button on a card or on one of its rows. `url` opens a link instead of coming back as a press. */
export interface CardButton {
  readonly id: string;
  readonly label: string;
  /** An icon name the host knows (lucide's kebab-case names: `smartphone`, `rotate-ccw`, `x`); unknown ones are left out. */
  readonly icon?: string;
  readonly primary?: boolean;
  readonly url?: string;
}

/** One step of a row's rail. */
export interface CardStep {
  readonly key: string;
  readonly label: string;
  readonly icon?: string;
}

export interface CardRow {
  readonly id: string;
  readonly title: string;
  readonly state?: CardState;
  /** The line under it: what is happening now, or what it will do. */
  readonly message?: string;
  /** A link beside its title (a run on GitHub). */
  readonly url?: string;
  /** The rail of steps and the one it is at (`step`, a step's key). */
  readonly steps?: readonly CardStep[];
  readonly step?: string;
  /** When its work began and last changed (ISO time or epoch ms): the time it took is shown, ticking while pending or running. */
  readonly startedAt?: string | number;
  readonly updatedAt?: string | number;
  /** The last lines of its log, folded behind a toggle. */
  readonly log?: readonly string[];
  readonly buttons?: readonly CardButton[];
}

export interface CardView {
  readonly title: string;
  readonly subtitle?: string;
  /** An icon name for the head, as for buttons. */
  readonly icon?: string;
  readonly rows?: readonly CardRow[];
  readonly buttons?: readonly CardButton[];
}

/** A press on a card's button, as the host hands it to the connector that posted the card. */
export interface CardPress {
  readonly card: string;
  readonly button: string;
  /** The row the button sits on; absent for a button of the card itself. */
  readonly row?: string;
  /** The agent whose chat the card is in. */
  readonly agent: string;
}

/** What the host offers for cards: post one into an agent's chat, redraw it, read back what it shows. */
export interface Cards {
  /** Posts a card into `agent`'s chat; answers its id. `text` is the plain form, `cardText(view)` by default. */
  post(card: { readonly agent: string; readonly view: CardView; readonly text?: string }): string;
  /** Redraws a card this connector posted, in place on every client. */
  update(id: string, view: CardView, text?: string): void;
  /** A card this connector posted: its agent and view; undefined when there is none. */
  get(id: string): { readonly agent: string; readonly view: CardView } | undefined;
}

const STATE: Record<CardState, string> = { idle: "not started", pending: "pending", running: "running", succeeded: "done", failed: "failed", interrupted: "interrupted", cancelled: "cancelled" };

/** The plain-text form of a card, for a client that cannot draw it. */
export function cardText(view: CardView): string {
  const head = view.subtitle ? `${view.title}: ${view.subtitle}` : view.title;
  const rows = (view.rows ?? []).map((r) => `${r.title}: ${r.message ?? STATE[r.state ?? "idle"]}${r.url ? ` (${r.url})` : ""}`);
  return [head, ...rows].join("\n");
}

/** Whether the card has a button `button` (on row `row`, or on the card itself), the one a press may name. */
export function hasButton(view: CardView, button: string, row?: string): boolean {
  const buttons = row === undefined ? view.buttons : view.rows?.find((r) => r.id === row)?.buttons;
  return Boolean(buttons?.some((b) => b.id === button && !b.url));
}

import type { Connector, ConnectorAction, Health, Host, Kind, SettingDef, Status } from "./index.ts";

/** A connector asked for its host before the host handed it over, or from a command line, which has none. */
export class NotAttachedError extends Error {
  constructor(connector: string) {
    super(`${connector}: no host yet`);
    this.name = "NotAttachedError";
  }
}

const OFF_KEY = "off";
const OFF: SettingDef = { key: OFF_KEY, label: "Turned off", type: "toggle" };

/**
 * What every connector shares. A subclass says what it is (`name`, `title`, `description`, `icon`) and how it is
 * doing (`check`), keeps its state on the instance, and overrides what it needs of the rest.
 *
 *     export default new MailConnector();
 */
export abstract class BaseConnector implements Connector {
  abstract readonly name: string;
  abstract readonly title: string;
  abstract readonly description: string;
  abstract readonly icon: string;
  readonly kind: Kind = "connector";
  /** Its own settings; the off switch every connector has comes first in `settings`. */
  protected readonly options: readonly SettingDef[] = [];
  #host?: Host;

  protected get host(): Host {
    if (!this.#host) throw new NotAttachedError(this.name);
    return this.#host;
  }

  /** Whether the user turned it off. */
  protected get off(): boolean {
    return this.host.store.get(OFF_KEY) === "1";
  }

  get settings(): readonly SettingDef[] {
    return [OFF, ...this.options];
  }

  attach(host: Host): void {
    this.#host = host;
  }

  /** How it is doing when it is not turned off; a thrown error reads as broken to the host. */
  protected abstract check(): Promise<Status> | Status;

  async status(): Promise<Status> {
    return this.off ? { state: "signed_out", detail: "Turned off" } : this.check();
  }

  enabled(): boolean {
    return !this.off;
  }

  async health(): Promise<Health> {
    const { state, detail } = await this.status();
    return { ok: state === "signed_in", detail };
  }

  start(): Promise<void> | void {}

  stop(): Promise<void> | void {}

  actions(): readonly ConnectorAction[] {
    return [];
  }
}

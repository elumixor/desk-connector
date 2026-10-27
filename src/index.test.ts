import { describe, expect, test } from "bun:test";
import { broken, defineConnector, failed, ok, problemsOf, startOrder, tool, z } from "./index.ts";
import { testHost } from "./testing.ts";

describe("tool", () => {
  test("keeps the definition and runs with the caller", async () => {
    const t = tool("echo", "says it back", { text: z.string() }, ({ text }, call) => ok({ text, by: call.agent }));
    expect(t.name).toBe("echo");
    expect(Object.keys(t.input)).toEqual(["text"]);
    const result = await t.run({ text: "hi" }, { agent: "pai" });
    expect(JSON.parse(result.content[0]!.type === "text" ? result.content[0]!.text : "")).toEqual({ text: "hi", by: "pai" });
  });

  test("failed is an error result", () => {
    expect(failed("nope")).toEqual({ content: [{ type: "text", text: '{"error":"nope"}' }], isError: true });
  });
});

describe("problemsOf", () => {
  const good = defineConnector({ name: "mail", title: "Mail", description: "mail", status: () => ({ state: "signed_out" }) });

  test("a complete connector has none", () => {
    expect(problemsOf(good)).toEqual([]);
  });

  test("a connector without status, a bad name, a duplicate tool", () => {
    const t = tool("a", "a", {}, () => ok(1));
    expect(problemsOf({ ...good, name: "Mail", status: undefined, tools: [t, t] })).toEqual([
      'name "Mail" is not lowercase letters, digits and dashes',
      "a connector needs status",
      "tool a is defined twice",
    ]);
  });

  test("a capability needs no status", () => {
    expect(problemsOf({ name: "browser", title: "Browser", description: "pages", kind: "capability" })).toEqual([]);
  });

  test("not an object", () => {
    expect(problemsOf(undefined)).toEqual(["the default export is not an object"]);
  });
});

describe("startOrder", () => {
  test("what is required comes first; unknown requirements are skipped", () => {
    const requires: Record<string, string[]> = { linkedin: ["browser", "missing"], browser: [] };
    expect(startOrder(["telegram", "linkedin", "browser"], (n) => requires[n] ?? [])).toEqual(["telegram", "browser", "linkedin"]);
  });

  test("a loop throws", () => {
    expect(() => startOrder(["a", "b"], (n) => (n === "a" ? ["b"] : ["a"]))).toThrow("a → b → a");
  });
});

describe("testHost", () => {
  test("store, problems, uses and records", () => {
    const host = testHost({ name: "mail", apis: { browser: { ok: true } }, settings: { KEY: "v" } });
    host.store.set("a", "1");
    expect(host.store.get("a")).toBe("1");
    host.store.set("a", undefined);
    expect(host.store.get("a")).toBeUndefined();
    expect(host.setting("KEY")).toBe("v");
    expect(host.use<{ ok: boolean }>("browser").ok).toBe(true);
    expect(() => host.use("nothing")).toThrow();

    const first = host.problems.raise({ title: "Reconnect", detail: "expired" });
    expect(first.created).toBe(true);
    expect(host.problems.raise({ title: "Reconnect", detail: "revoked" })).toEqual({ id: first.id, created: false });
    expect(host.problems.open("Reconnect")?.detail).toBe("revoked");
    host.problems.resolve("Reconnect");
    expect(host.problems.open("Reconnect")).toBeUndefined();

    host.emit("mail.new", { id: 1 });
    expect(host.emitted).toEqual([{ kind: "mail.new", payload: { id: 1 } }]);
    expect(host.http.url(`${host.http.base}/qr`)).toBe("http://host.test/m/mail/qr");
    host.db.exec("CREATE TABLE t (x)");
  });

  test("broken", () => {
    expect(broken("no")).toEqual({ state: "broken", detail: "no" });
  });
});

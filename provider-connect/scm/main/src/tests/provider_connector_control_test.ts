import { describe, it, expect, beforeAll } from "bun:test";
import { Window } from "happy-dom";

const win = new Window();
for (const key of ["customElements", "HTMLElement", "document", "ShadowRoot", "Node"] as const) {
  if (!(key in globalThis)) {
    (globalThis as Record<string, unknown>)[key] = (win as unknown as Record<string, unknown>)[key];
  }
}

let ProviderConnectorControl: typeof import("../core/provider_connector_control.js").ProviderConnectorControl;

beforeAll(async () => {
  ({ ProviderConnectorControl } = await import("../core/provider_connector_control.js"));
});

const PROVIDERS = [
  {
    id: "mastodon",
    name: "Mastodon",
    icon: "🐘",
    color: "#6364FF",
    fields: [{ id: "token", type: "password" as const, placeholder: "Paste your Mastodon token" }],
  },
  {
    id: "bluesky",
    name: "Bluesky",
    icon: "🦋",
    color: "#0085FF",
    fields: [
      { id: "identifier", type: "text" as const, placeholder: "Bluesky handle or email" },
      { id: "appPassword", type: "password" as const, placeholder: "App Password" },
    ],
  },
];

function mount(): InstanceType<typeof ProviderConnectorControl> {
  const el = document.createElement("control-provider-connector") as InstanceType<typeof ProviderConnectorControl>;
  document.body.appendChild(el);
  return el;
}

describe("ProviderConnectorControl", () => {
  it("registers as control-provider-connector", () => {
    expect(customElements.get("control-provider-connector")).toBe(ProviderConnectorControl);
  });

  it("renders the grid step first, composing view-grid with the provider catalog", () => {
    const el = mount();
    el.providers = PROVIDERS;
    const grid = el.shadowRoot?.querySelector("view-grid") as { items?: readonly { id: string }[] } | null;
    expect(grid).not.toBeNull();
    expect(grid?.items?.map((i) => i.id)).toEqual(["mastodon", "bluesky"]);
    expect(el.shadowRoot?.querySelector("view-form")).toBeNull();
  });

  it("switches to the form step when a grid tile is selected", () => {
    const el = mount();
    el.providers = PROVIDERS;
    const grid = el.shadowRoot!.querySelector("view-grid")!;
    grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "bluesky" } }));
    const form = el.shadowRoot?.querySelector("view-form") as { fields?: readonly { id: string }[] } | null;
    expect(form).not.toBeNull();
    expect(form?.fields?.map((f) => f.id)).toEqual(["identifier", "appPassword"]);
    expect(el.shadowRoot?.querySelector("view-grid")).toBeNull();
  });

  it("dispatches connected and populates the list step on a successful connect", async () => {
    const el = mount();
    el.providers = PROVIDERS;
    el.connect = async (providerId, values) => {
      expect(providerId).toBe("mastodon");
      expect(values["token"]).toBe("real-token");
      return { session: "abc" };
    };
    el.list = async (providerId, session) => {
      expect(providerId).toBe("mastodon");
      expect((session as { session: string }).session).toBe("abc");
      return [{ id: "list-1", name: "Home timeline", status: "Active" }];
    };
    let connectedDetail: { providerId: string } | undefined;
    el.addEventListener("connected", (e) => {
      connectedDetail = (e as CustomEvent).detail;
    });

    const grid = el.shadowRoot!.querySelector("view-grid")!;
    grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "mastodon" } }));
    const formEl = el.shadowRoot!.querySelector("view-form")!;
    formEl.dispatchEvent(new CustomEvent("submit", { detail: { values: { token: "real-token" } } }));

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(connectedDetail).toEqual({ providerId: "mastodon" });
    const list = el.shadowRoot?.querySelector("view-list") as { items?: readonly { name: string }[] } | null;
    expect(list).not.toBeNull();
    expect(list?.items?.[0]?.name).toBe("Home timeline");
  });

  it("shows the error via the status line and dispatches error on a failed connect", async () => {
    const el = mount();
    el.providers = PROVIDERS;
    el.connect = async () => {
      throw new Error("Paste a token first.");
    };
    let errorDetail: { providerId: string; message: string } | undefined;
    el.addEventListener("error", (e) => {
      errorDetail = (e as CustomEvent).detail;
    });

    const grid = el.shadowRoot!.querySelector("view-grid")!;
    grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "mastodon" } }));
    const formEl = el.shadowRoot!.querySelector("view-form")!;
    formEl.dispatchEvent(new CustomEvent("submit", { detail: { values: { token: "" } } }));

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(errorDetail).toEqual({ providerId: "mastodon", message: "Paste a token first." });
    const status = el.shadowRoot?.querySelector("view-status-line") as { text?: string } | null;
    expect(status?.text).toBe("⚠️ Paste a token first.");
    expect(el.shadowRoot?.querySelector("view-list")).toBeNull();
  });

  it("returns to the grid step when the detail header's back button is clicked", () => {
    const el = mount();
    el.catalogLabel = "Socials";
    el.providers = PROVIDERS;
    const grid = el.shadowRoot!.querySelector("view-grid")!;
    grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "mastodon" } }));
    expect(el.shadowRoot?.querySelector("view-form")).not.toBeNull();

    const header = el.shadowRoot?.querySelector("view-nav-header") as { backLabel?: string } | null;
    expect(header?.backLabel).toBe("Socials");
    el.shadowRoot?.querySelector("view-nav-header")?.shadowRoot?.querySelector<HTMLButtonElement>(".back-btn")?.click();

    expect(el.shadowRoot?.querySelector("view-grid")).not.toBeNull();
    expect(el.shadowRoot?.querySelector("view-form")).toBeNull();
  });

  it("composes the detail header with the provider's own badge and name", () => {
    const el = mount();
    el.providers = PROVIDERS;
    const grid = el.shadowRoot!.querySelector("view-grid")!;
    grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "bluesky" } }));
    const header = el.shadowRoot?.querySelector("view-nav-header");
    expect(header?.textContent).toContain("Bluesky");
    const badge = header?.querySelector("view-badge") as { color?: string; icon?: string } | null;
    expect(badge?.color).toBe("#0085FF");
    expect(badge?.icon).toBe("🦋");
  });

  it("renders the disclosure text above the form when set", () => {
    const el = mount();
    el.providers = [{ ...PROVIDERS[0]!, disclosure: "Stored only on this device." }];
    const grid = el.shadowRoot!.querySelector("view-grid")!;
    grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "mastodon" } }));
    expect(el.shadowRoot?.querySelector(".settings-disclosure")?.textContent).toBe("Stored only on this device.");
  });

  it("renders the resourceListLabel heading once resources are fetched", async () => {
    const el = mount();
    el.providers = [{ ...PROVIDERS[0]!, resourceListLabel: "Follows" }];
    el.connect = async () => "session";
    el.list = async () => [{ id: "a", name: "A", status: "Active" }];
    const grid = el.shadowRoot!.querySelector("view-grid")!;
    grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "mastodon" } }));
    const formEl = el.shadowRoot!.querySelector("view-form")!;
    formEl.dispatchEvent(new CustomEvent("submit", { detail: { values: { token: "x" } } }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(el.shadowRoot?.querySelector(".resource-list-label")?.textContent).toBe("Follows");
  });

  it("calls oauthBegin instead of connect when a provider is oauthRedirect", () => {
    const el = mount();
    let oauthBeginCalled: { providerId: string; values: Record<string, string> } | undefined;
    let connectCalled = false;
    el.oauthBegin = (providerId, values) => {
      oauthBeginCalled = { providerId, values: { ...values } };
    };
    el.connect = async () => {
      connectCalled = true;
      return undefined;
    };
    el.providers = [
      {
        id: "jira",
        name: "Jira",
        color: "#0052CC",
        oauthRedirect: true,
        fields: [
          { id: "clientId", type: "text", placeholder: "Client ID" },
          { id: "clientSecret", type: "password", placeholder: "Client Secret" },
        ],
      },
    ];
    const grid = el.shadowRoot!.querySelector("view-grid")!;
    grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "jira" } }));
    const formEl = el.shadowRoot!.querySelector("view-form")!;
    formEl.dispatchEvent(
      new CustomEvent("submit", { detail: { values: { clientId: "cid", clientSecret: "csecret" } } })
    );

    expect(oauthBeginCalled).toEqual({ providerId: "jira", values: { clientId: "cid", clientSecret: "csecret" } });
    expect(connectCalled).toBe(false);
  });

  it("does not re-render the form after a successful oauthBegin, so the just-typed values survive", () => {
    // Real bug caught migrating Jira (justjs#125): re-rendering here
    // rebuilds <view-form> from this render pass's own `providers` -
    // still the pre-oauthBegin snapshot, since the control has no way
    // to know the host's catalog changed mid-call. A stale defaultValue
    // would silently wipe whatever the user just typed and submitted.
    const el = mount();
    el.oauthBegin = () => {};
    el.providers = [
      {
        id: "jira",
        name: "Jira",
        color: "#0052CC",
        oauthRedirect: true,
        fields: [{ id: "clientId", type: "text", placeholder: "Client ID" }],
      },
    ];
    const grid = el.shadowRoot!.querySelector("view-grid")!;
    grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "jira" } }));
    const input = el.shadowRoot!.querySelector("view-form")!.shadowRoot!.querySelector<HTMLInputElement>('[data-field-id="clientId"]')!;
    input.value = "typed-client-id";
    const formEl = el.shadowRoot!.querySelector("view-form")!;
    formEl.dispatchEvent(new CustomEvent("submit", { detail: { values: { clientId: "typed-client-id" } } }));

    const inputAfter = el.shadowRoot?.querySelector("view-form")?.shadowRoot?.querySelector<HTMLInputElement>('[data-field-id="clientId"]');
    expect(inputAfter?.value).toBe("typed-client-id");
  });

  it("shows a thrown oauthBegin validation error via the status line, same as a failed connect", () => {
    const el = mount();
    el.oauthBegin = () => {
      throw new Error("Enter both the Client ID and Client Secret first.");
    };
    let errorDetail: { providerId: string; message: string } | undefined;
    el.addEventListener("error", (e) => {
      errorDetail = (e as CustomEvent).detail;
    });
    el.providers = [
      { id: "jira", name: "Jira", color: "#0052CC", oauthRedirect: true, fields: [{ id: "clientId", type: "text", placeholder: "Client ID" }] },
    ];
    const grid = el.shadowRoot!.querySelector("view-grid")!;
    grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "jira" } }));
    const formEl = el.shadowRoot!.querySelector("view-form")!;
    formEl.dispatchEvent(new CustomEvent("submit", { detail: { values: { clientId: "" } } }));

    expect(errorDetail).toEqual({ providerId: "jira", message: "Enter both the Client ID and Client Secret first." });
    const status = el.shadowRoot?.querySelector("view-status-line") as { text?: string } | null;
    expect(status?.text).toBe("⚠️ Enter both the Client ID and Client Secret first.");
  });

  it("re-verifies an already-connected oauthRedirect provider via list(id, undefined), never calling connect", async () => {
    const el = mount();
    let connectCalled = false;
    let listCall: { providerId: string; session: unknown } | undefined;
    el.connect = async () => {
      connectCalled = true;
      return undefined;
    };
    el.list = async (providerId, session) => {
      listCall = { providerId, session };
      return [{ id: "issue-1", name: "JIRA-1", status: "Open" }];
    };
    el.providers = [
      { id: "jira", name: "Jira", color: "#0052CC", oauthRedirect: true, connected: true, fields: [] },
    ];
    const grid = el.shadowRoot!.querySelector("view-grid")!;
    grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "jira" } }));

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(connectCalled).toBe(false);
    expect(listCall).toEqual({ providerId: "jira", session: undefined });
    const list = el.shadowRoot?.querySelector("view-list") as { items?: readonly { name: string }[] } | null;
    expect(list?.items?.[0]?.name).toBe("JIRA-1");
  });

  it("shows unsupportedMessage instead of a form, and never calls connect for that provider", () => {
    const el = mount();
    let connectCalled = false;
    el.connect = async () => {
      connectCalled = true;
      return undefined;
    };
    el.providers = [
      {
        id: "x",
        name: "X (Twitter)",
        color: "#000000",
        fields: [],
        unsupportedMessage: "X's API did not return CORS headers when checked directly from a browser.",
      },
    ];
    const grid = el.shadowRoot!.querySelector("view-grid")!;
    grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "x" } }));

    expect(el.shadowRoot?.querySelector(".connect-hint")?.textContent).toBe(
      "X's API did not return CORS headers when checked directly from a browser."
    );
    expect(el.shadowRoot?.querySelector("view-form")).toBeNull();
    expect(el.shadowRoot?.querySelector("view-status-line")).toBeNull();
    expect(connectCalled).toBe(false);
  });

  // justjs#135 - GitHub OAuth Device Flow's own third mode, distinct
  // from both plain bearer-token connect and oauthRedirect's fire-and-
  // forget navigation.
  describe("device flow (justjs#135)", () => {
    function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (e: unknown) => void } {
      let resolve!: (value: T) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    const GITHUB_PROVIDER = {
      id: "github",
      name: "GitHub",
      color: "#181717",
      deviceFlow: true as const,
      fields: [],
    };

    it("calls deviceFlowBegin instead of connect, and renders the real user code/verification URL once it resolves", async () => {
      const el = mount();
      let connectCalled = false;
      const tokenDeferred = deferred<string>();
      el.deviceFlowBegin = async () => ({
        userCode: "ABCD-1234",
        verificationUri: "https://github.com/login/device",
        token: tokenDeferred.promise,
      });
      el.connect = async () => {
        connectCalled = true;
        return undefined;
      };
      el.providers = [GITHUB_PROVIDER];

      const grid = el.shadowRoot!.querySelector("view-grid")!;
      grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "github" } }));
      const formEl = el.shadowRoot!.querySelector("view-form")!;
      formEl.dispatchEvent(new CustomEvent("submit", { detail: { values: {} } }));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(connectCalled).toBe(false); // not yet - token hasn't resolved
      const link = el.shadowRoot?.querySelector<HTMLAnchorElement>(".device-flow-link");
      expect(link?.href).toBe("https://github.com/login/device");
      expect(el.shadowRoot?.querySelector(".device-flow-user-code")?.textContent).toBe("ABCD-1234");
      const status = el.shadowRoot?.querySelector("view-status-line") as { text?: string } | null;
      expect(status?.text).toBe("Waiting for you to finish on GitHub…");
    });

    it("connects and populates the resource list once the device-flow token resolves", async () => {
      const el = mount();
      let connectValues: Record<string, string> | undefined;
      const tokenDeferred = deferred<string>();
      el.deviceFlowBegin = async () => ({
        userCode: "ABCD-1234",
        verificationUri: "https://github.com/login/device",
        token: tokenDeferred.promise,
      });
      el.connect = async (providerId, values) => {
        connectValues = { ...values };
        expect(providerId).toBe("github");
        return { session: "real" };
      };
      el.list = async (_id, session) => [{ id: "1", name: "sweengineeringlabs/justjs", status: "public" }];
      let connectedDetail: { providerId: string } | undefined;
      el.addEventListener("connected", (e) => {
        connectedDetail = (e as CustomEvent).detail;
      });
      el.providers = [GITHUB_PROVIDER];

      const grid = el.shadowRoot!.querySelector("view-grid")!;
      grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "github" } }));
      el.shadowRoot!.querySelector("view-form")!.dispatchEvent(new CustomEvent("submit", { detail: { values: {} } }));
      await new Promise((resolve) => setTimeout(resolve, 10));

      tokenDeferred.resolve("gho_real_token");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(connectValues).toEqual({ token: "gho_real_token" });
      expect(connectedDetail).toEqual({ providerId: "github" });
      const list = el.shadowRoot?.querySelector("view-list") as { items?: readonly { name: string }[] } | null;
      expect(list?.items?.[0]?.name).toBe("sweengineeringlabs/justjs");
    });

    it("surfaces a device-flow rejection (e.g. expired code) via the status line, same as a failed connect", async () => {
      const el = mount();
      const tokenDeferred = deferred<string>();
      el.deviceFlowBegin = async () => ({
        userCode: "ABCD-1234",
        verificationUri: "https://github.com/login/device",
        token: tokenDeferred.promise,
      });
      let errorDetail: { providerId: string; message: string } | undefined;
      el.addEventListener("error", (e) => {
        errorDetail = (e as CustomEvent).detail;
      });
      el.providers = [GITHUB_PROVIDER];

      const grid = el.shadowRoot!.querySelector("view-grid")!;
      grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "github" } }));
      el.shadowRoot!.querySelector("view-form")!.dispatchEvent(new CustomEvent("submit", { detail: { values: {} } }));
      await new Promise((resolve) => setTimeout(resolve, 10));

      tokenDeferred.reject(new Error("GitHub: the device code expired before you finished signing in - try connecting again."));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(errorDetail?.providerId).toBe("github");
      expect(errorDetail?.message).toContain("expired");
      const status = el.shadowRoot?.querySelector("view-status-line") as { text?: string } | null;
      expect(status?.text).toContain("⚠️");
    });

    it("abandons a device-flow attempt on reselect - a late-resolving token never flips connected or dispatches a stale event", async () => {
      const el = mount();
      const tokenDeferred = deferred<string>();
      let connectCalled = false;
      el.deviceFlowBegin = async () => ({
        userCode: "ABCD-1234",
        verificationUri: "https://github.com/login/device",
        token: tokenDeferred.promise,
      });
      el.connect = async () => {
        connectCalled = true;
        return undefined;
      };
      let connectedFired = false;
      el.addEventListener("connected", () => {
        connectedFired = true;
      });
      el.providers = [
        GITHUB_PROVIDER,
        { id: "mastodon", name: "Mastodon", color: "#6364FF", fields: [{ id: "token", type: "password" as const, placeholder: "" }] },
      ];

      const grid = el.shadowRoot!.querySelector("view-grid")!;
      grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "github" } }));
      el.shadowRoot!.querySelector("view-form")!.dispatchEvent(new CustomEvent("submit", { detail: { values: {} } }));
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Abandon by going back to the grid and reselecting a different
      // provider before the token ever resolves.
      el.shadowRoot?.querySelector("view-nav-header")?.shadowRoot?.querySelector<HTMLButtonElement>(".back-btn")?.click();
      el.shadowRoot!.querySelector("view-grid")!.dispatchEvent(new CustomEvent("item-select", { detail: { id: "mastodon" } }));

      // The abandoned poll resolves late - must be a silent no-op.
      tokenDeferred.resolve("gho_too_late");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(connectCalled).toBe(false);
      expect(connectedFired).toBe(false);
      // Still on the (correct) mastodon form, not silently bounced anywhere.
      const form = el.shadowRoot?.querySelector("view-form") as { fields?: readonly { id: string }[] } | null;
      expect(form?.fields?.map((f) => f.id)).toEqual(["token"]);
    });
  });

  describe("resetView() (justjs#138)", () => {
    it("returns to the grid from a provider's detail view", () => {
      const el = mount();
      el.providers = PROVIDERS;
      const grid = el.shadowRoot!.querySelector("view-grid")!;
      grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "bluesky" } }));
      expect(el.shadowRoot?.querySelector("view-form")).not.toBeNull();

      el.resetView();

      expect(el.shadowRoot?.querySelector("view-form")).toBeNull();
      const gridAfter = el.shadowRoot?.querySelector("view-grid") as { items?: readonly { id: string }[] } | null;
      expect(gridAfter?.items?.map((i) => i.id)).toEqual(["mastodon", "bluesky"]);
    });

    it("is a safe no-op when already on the grid", () => {
      const el = mount();
      el.providers = PROVIDERS;
      expect(() => el.resetView()).not.toThrow();
      const grid = el.shadowRoot?.querySelector("view-grid") as { items?: readonly { id: string }[] } | null;
      expect(grid?.items?.map((i) => i.id)).toEqual(["mastodon", "bluesky"]);
    });

    it("clears fetched resources so re-selecting an already-connected provider re-fetches fresh instead of showing stale data", async () => {
      const el = mount();
      let listCallCount = 0;
      el.connect = async () => ({ session: "real" });
      el.list = async () => {
        listCallCount++;
        return [{ id: "1", name: "Friends", status: "followed" }];
      };
      el.providers = PROVIDERS;

      const grid = el.shadowRoot!.querySelector("view-grid")!;
      grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "mastodon" } }));
      el.shadowRoot!.querySelector("view-form")!.dispatchEvent(new CustomEvent("submit", { detail: { values: { token: "tok" } } }));
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(listCallCount).toBe(1);

      el.resetView();

      // Re-selecting the same, now-connected provider must auto-fetch
      // again (maybeAutoConnect only does this when #resources is null)
      // rather than showing whatever was fetched before the reset.
      el.shadowRoot!.querySelector("view-grid")!.dispatchEvent(new CustomEvent("item-select", { detail: { id: "mastodon" } }));
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(listCallCount).toBe(2);
    });

    it("aborts an in-progress device-flow poll - a late-resolving token never flips connected after resetView()", async () => {
      const el = mount();
      const tokenDeferred = (() => {
        let resolve!: (value: string) => void;
        const promise = new Promise<string>((res) => {
          resolve = res;
        });
        return { promise, resolve };
      })();
      let connectCalled = false;
      el.deviceFlowBegin = async () => ({
        userCode: "ABCD-1234",
        verificationUri: "https://github.com/login/device",
        token: tokenDeferred.promise,
      });
      el.connect = async () => {
        connectCalled = true;
        return undefined;
      };
      let connectedFired = false;
      el.addEventListener("connected", () => {
        connectedFired = true;
      });
      el.providers = [{ id: "github", name: "GitHub", color: "#181717", deviceFlow: true as const, fields: [] }];

      const grid = el.shadowRoot!.querySelector("view-grid")!;
      grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "github" } }));
      el.shadowRoot!.querySelector("view-form")!.dispatchEvent(new CustomEvent("submit", { detail: { values: {} } }));
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(el.shadowRoot?.querySelector(".device-flow-user-code")?.textContent).toBe("ABCD-1234");

      el.resetView();
      tokenDeferred.resolve("gho_too_late");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(connectCalled).toBe(false);
      expect(connectedFired).toBe(false);
      expect(el.shadowRoot?.querySelector("view-grid")).not.toBeNull();
    });
  });
});

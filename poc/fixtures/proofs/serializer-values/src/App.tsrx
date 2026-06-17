type ContactRecord = {
  id: string;
  label: string;
  tags: string[];
};

type CycleNode = {
  id: string;
  label: string;
  next?: CycleNode;
  parent?: CycleNode;
};

type SerializerBehaviorInput = {
  tier: string;
  selectedId: string;
  byteLength: number;
};

export class MoneyValue {
  amountCents: bigint;
  currency: string;

  constructor(amountCents: bigint, currency: string) {
    this.amountCents = amountCents;
    this.currency = currency;
  }

  format() {
    return `${this.currency}:${this.amountCents.toString()}`;
  }
}

export class CustomerSnapshot {
  id: string;
  name: string;
  credit: MoneyValue;

  constructor(id: string, name: string, credit: MoneyValue) {
    this.id = id;
    this.name = name;
    this.credit = credit;
  }

  displayName() {
    return `${this.name} (${this.credit.currency})`;
  }
}

class RuntimeBox {
  #cleanup: (() => void) | null = null;
  label: string;

  constructor(label: string, cleanup: () => void) {
    this.label = label;
    this.#cleanup = cleanup;
  }
}

declare const liveElement: HTMLElement;
declare const liveRequest: Request;
declare const liveStream: ReadableStream<Uint8Array>;
declare const liveSocket: WebSocket;
declare const weakState: WeakMap<object, string>;
declare const fixtureSecretToken: string;

function serializerBehavior(input: SerializerBehaviorInput) {
  return (element: HTMLElement) => {
    const controller = new AbortController();

    element.dataset.serializerTier = input.tier;
    element.dataset.selectedId = input.selectedId;
    element.dataset.byteLength = String(input.byteLength);

    return () => {
      controller.abort();
      delete element.dataset.serializerTier;
      delete element.dataset.selectedId;
      delete element.dataset.byteLength;
    };
  };
}

export function App() @{
  const sharedContact: ContactRecord = {
    id: "shared-contact",
    label: "Shared Contact",
    tags: ["identity", "backref"],
  };
  const cycleA: CycleNode = {
    id: "cycle-a",
    label: "Cycle A",
  };
  const cycleB: CycleNode = {
    id: "cycle-b",
    label: "Cycle B",
    parent: cycleA,
  };

  cycleA.next = cycleB;
  cycleB.next = cycleA;

  const stateArena = state({
    primitives: {
      name: "serializer-values",
      enabled: true,
      count: 3,
      empty: null,
    },
    plainArray: ["alpha", "beta", "gamma"],
    identity: {
      primary: sharedContact,
      secondary: sharedContact,
      nested: {
        repeated: sharedContact,
      },
    },
    cycles: {
      cycleA,
      cycleB,
    },
    builtins: {
      createdAt: new Date("2026-06-14T12:00:00.000Z"),
      matcher: /serializer-(values|tiers)/gi,
      endpoint: new URL("https://example.test/serializer-values?proof=1"),
      amount: 9007199254740993n,
      bytes: new Uint8Array([1, 2, 3, 4]),
      buffer: new Uint8Array([8, 6, 7, 5]).buffer,
    },
    collections: {
      contactMap: new Map([
        ["primary", sharedContact],
        ["secondary", sharedContact],
      ]),
      tagSet: new Set(["built-in", "identity", "cycle"]),
    },
    valueClass: {
      customer: new CustomerSnapshot(
        "customer-1",
        "Ada Lovelace",
        new MoneyValue(424242n, "USD"),
      ),
    },
    secretWarning: {
      tokenName: "fixture_secret_token",
      tokenPreview: "fixture_secret_do_not_ship",
    },
  });
  let panel = element<HTMLElement>();

  const derivedSummary = computed(() => {
    return {
      label: stateArena.valueClass.customer.displayName(),
      byteLength: stateArena.builtins.bytes.byteLength,
      firstCycle: stateArena.cycles.cycleA.next?.id ?? "none",
      sharedIdentity:
        stateArena.identity.primary === stateArena.identity.secondary
          ? "preserved"
          : "lost",
    };
  });

  <main
    el={panel}
    attach={serializerBehavior({
      tier: "dom-resource-behavior",
      selectedId: stateArena.identity.primary.id,
      byteLength: derivedSummary.byteLength,
    })}
  >
    <h1>{stateArena.primitives.name}</h1>
    <p>Created {stateArena.builtins.createdAt.toISOString()}</p>
    <p>Matcher {stateArena.builtins.matcher.source}</p>
    <p>URL {stateArena.builtins.endpoint.pathname}</p>
    <p>BigInt {stateArena.builtins.amount.toString()}</p>
    <p>Bytes {stateArena.builtins.bytes.byteLength}</p>
    <p>Buffer {stateArena.builtins.buffer.byteLength}</p>
    <p>Map {stateArena.collections.contactMap.get("primary")?.label}</p>
    <p>Set {stateArena.collections.tagSet.has("cycle") ? "cycle" : "missing"}</p>
    <p>Class {stateArena.valueClass.customer.displayName()}</p>
    <p>Computed {derivedSummary.label}{" / "}{derivedSummary.sharedIdentity}</p>
    <p>Cycle {stateArena.cycles.cycleA.next?.parent?.id}</p>
    <output>{stateArena.secretWarning.tokenName}</output>
  </main>
}

export function Diagnostics() @{
  let diagnosticHost = element<HTMLElement>();
  const runtimeBox = new RuntimeBox("runtime-cleanup", () => {
    liveSocket.close();
  });
  const unsupported = state({
    // expected diagnostic: live DOM nodes are host resources, not durable state.
    domNode: liveElement,

    // expected diagnostic: element() handles serialize as locators, not state values.
    elementHandleInState: diagnosticHost,

    // expected diagnostic: Request objects are runtime values.
    request: liveRequest,

    // expected diagnostic: streams cannot be restored from durable data.
    stream: liveStream,

    // expected diagnostic: sockets and native handles belong in attach={...}.
    socket: liveSocket,

    // expected diagnostic: WeakMap-only state has hidden identity and entries.
    weakState,

    // expected diagnostic: private fields and cleanup closures make this a runtime resource.
    runtimeBox,

    // expected warning: suspicious secret-looking path and value should not enter arcade/state.
    secretToken: fixtureSecretToken,
  });

  <section el={diagnosticHost}>
    <h2>Serializer diagnostics</h2>
    <p>{unsupported.secretToken}</p>
  </section>
}

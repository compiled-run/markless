type ResolverItem = {
  id: string;
  title: string;
  status: "ready" | "paused";
};

type PanelState = {
  open: boolean;
  selectedId: string;
  query: string;
  status: "idle" | "typing" | "focused" | "submitted" | "selected";
  submitCount: number;
  items: ResolverItem[];
};

type DetailResult = {
  id: string;
  title: string;
  summary: string;
};

type BehaviorConfig = {
  mode: "active" | "idle";
  selectedId: string;
};

function resolverHostBehavior(config: BehaviorConfig) {
  return (element: HTMLElement) => {
    element.dataset.resolverMode = config.mode;
    element.dataset.selectedId = config.selectedId;

    return () => {
      delete element.dataset.resolverMode;
      delete element.dataset.selectedId;
    };
  };
}

async function loadDetails(id: string, signal: AbortSignal): Promise<DetailResult> {
  const response = await fetch(`/api/resolver-details/${id}`, { signal });

  if (!response.ok) {
    throw new Error(`Could not load details for ${id}`);
  }

  return await response.json();
}

export function App() @{
  const panel = state<PanelState>({
    open: true,
    selectedId: "alpha",
    query: "",
    status: "idle",
    submitCount: 0,
    items: [
      { id: "alpha", title: "Alpha", status: "ready" },
      { id: "beta", title: "Beta", status: "paused" },
      { id: "gamma", title: "Gamma", status: "ready" },
    ],
  });
  let queryInput = element<HTMLInputElement>();
  let selectedRegion = element<HTMLElement>();

  const selected = computed(() => {
    return panel.items.find((item) => item.id === panel.selectedId) ?? panel.items[0];
  });
  const behaviorConfig = computed<BehaviorConfig>(() => ({
    mode: panel.open ? "active" : "idle",
    selectedId: panel.selectedId,
  }));
  const filteredItems = computed(() => {
    return panel.items.filter((item) => {
      return item.title.toLowerCase().includes(panel.query.toLowerCase());
    });
  });
  const statusLabel = computed(() => {
    return `${panel.status}:${selected.title}:${filteredItems.length}`;
  });
  const details = computed(async ({ signal }) => {
    return await loadDetails(panel.selectedId, signal);
  });

  <main
    data-open={panel.open}
    data-status={panel.status}
    attach={resolverHostBehavior(behaviorConfig)}
  >
    <header>
      <h1>{statusLabel}</h1>
      <button
        type="button"
        aria-expanded={panel.open}
        onClick={() => {
          panel.open = !panel.open;
          panel.status = "focused";
        }}
      >
        {panel.open ? "Close" : "Open"} resolver panel
      </button>
    </header>

    <form
      onSubmit={(event) => {
        event.preventDefault();
        panel.submitCount++;
        panel.status = "submitted";
      }}
    >
      <label>
        Query
        <input
          el={queryInput}
          value={panel.query}
          aria-controls="resolver-results"
          aria-expanded={panel.open}
          data-selected={panel.selectedId}
          onInput={(event) => {
            panel.query = event.currentTarget.value;
            panel.status = "typing";
          }}
          onKeyDown={(event) => {
            if (panel.open && event.key === "Escape") {
              event.preventDefault();

              panel.open = false;
              panel.status = "idle";
            }
          }}
        />
      </label>

      <button type="submit">Submit {panel.submitCount}</button>
    </form>

    @if (panel.open) {
      <section
        id="resolver-results"
        el={selectedRegion}
        data-current={selected.id}
        attach={resolverHostBehavior({
          mode: "active",
          selectedId: selected.id,
        })}
      >
        <h2>{selected.title}</h2>
        <p>{selected.status === "ready" ? "Ready" : "Paused"}</p>

        <ol>
          @for (const item of filteredItems; index index; key item.id) {
            <li data-active={item.id === panel.selectedId}>
              <button
                type="button"
                onClick={() => {
                  panel.selectedId = item.id;
                  panel.status = "selected";
                  selectedRegion?.scrollIntoView();
                }}
              >
                {index + 1}. {item.title}
              </button>
            </li>
          } @empty {
            <li>No symbols match {panel.query}</li>
          }
        </ol>
      </section>
    }

    @try {
      <article data-detail-id={details.id}>
        <h2>{details.title}</h2>
        <p>{details.summary}</p>
      </article>
    } @pending {
      <p>Loading {selected.title}</p>
    } @catch (_error) {
      <p>Could not load {selected.title}</p>
    }

    <footer>
      <button
        type="button"
        onClick={() => {
          queryInput?.focus();
          panel.status = "focused";
        }}
      >
        Focus query
      </button>
      <output>{statusLabel}</output>
    </footer>
  </main>
}

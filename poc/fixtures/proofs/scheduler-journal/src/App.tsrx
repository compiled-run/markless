type JournalItem = {
  id: string;
  title: string;
  status: "ready" | "paused";
  count: number;
};

type JournalState = {
  open: boolean;
  selectedId: string;
  filter: string;
  revision: number;
  committed: number;
  firstHandlerSeen: boolean;
  busy: boolean;
  failNext: boolean;
  message: string;
};

type PreviewResult = {
  id: string;
  title: string;
  revision: number;
};

type BehaviorConfig = {
  scope: "branch" | "row";
  id: string;
  revision: number;
};

function journalBehavior(config: BehaviorConfig) {
  return (element: HTMLElement) => {
    element.dataset.cleanupScope = config.scope;
    element.dataset.cleanupId = config.id;
    element.dataset.cleanupRevision = String(config.revision);

    return () => {
      delete element.dataset.cleanupScope;
      delete element.dataset.cleanupId;
      delete element.dataset.cleanupRevision;
    };
  };
}

async function loadPreview(
  id: string,
  revision: number,
  signal: AbortSignal,
): Promise<PreviewResult> {
  const response = await fetch(`/api/scheduler-preview/${id}?revision=${revision}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(`Preview failed for ${id}`);
  }

  return await response.json();
}

export function App() @{
  const items = state<JournalItem[]>([
    { id: "alpha", title: "Alpha", status: "ready", count: 1 },
    { id: "beta", title: "Beta", status: "paused", count: 2 },
    { id: "gamma", title: "Gamma", status: "ready", count: 3 },
  ]);
  const journal = state<JournalState>({
    open: true,
    selectedId: "alpha",
    filter: "",
    revision: 0,
    committed: 0,
    firstHandlerSeen: false,
    busy: false,
    failNext: false,
    message: "idle",
  });
  let detailsHost = element<HTMLElement>();

  const visibleItems = computed(() => {
    return items.filter((item) => item.title.toLowerCase().includes(journal.filter));
  });
  const selected = computed(() => {
    return items.find((item) => item.id === journal.selectedId) ?? items[0];
  });
  const summary = computed(() => {
    return `${visibleItems.length} visible / ${items.length} total`;
  });
  const flushLabel = computed(() => {
    return `${journal.message}:r${journal.revision}:c${journal.committed}`;
  });
  const preview = computed(async ({ signal }) => {
    const id = journal.selectedId;
    const revision = journal.revision;

    return await loadPreview(id, revision, signal);
  });

  function commitThenThrow() {
    journal.committed++;
    journal.message = "committed-before-error";

    if (journal.failNext) {
      journal.failNext = false;
      throw new Error("after committed graph writes");
    }
  }

  <main
    data-revision={journal.revision}
    data-selected={journal.selectedId}
    aria-busy={journal.busy}
  >
    <header>
      <h1>{summary}</h1>
      <p>{flushLabel}</p>

      <label>
        Filter
        <input
          value={journal.filter}
          onInput={(event) => {
            journal.filter = event.currentTarget.value.trim().toLowerCase();
            journal.revision++;
            journal.message = `filter:${journal.filter || "all"}`;
          }}
        />
      </label>

      <button
        type="button"
        onClick={[
          () => {
            journal.firstHandlerSeen = true;
            journal.revision++;
            journal.message = "ordered-handler:first";
          },
          () => {
            if (journal.firstHandlerSeen) {
              journal.committed++;
              journal.message = "ordered-handler:second";
            }
          },
        ]}
      >
        Run ordered handlers
      </button>
    </header>

    <nav>
      <button
        type="button"
        onClick={() => {
          journal.open = !journal.open;
          journal.revision++;
          journal.message = journal.open ? "insertRange:details" : "removeRange:details";
        }}
      >
        {journal.open ? "Close" : "Open"} details
      </button>

      <button
        type="button"
        onClick={() => {
          items.push({
            id: `new-${journal.revision}`,
            title: `New ${journal.revision}`,
            status: "ready",
            count: journal.revision,
          });
          journal.revision++;
          journal.message = "insertRange:row";
        }}
      >
        Add row
      </button>

      <button
        type="button"
        onClick={() => {
          const first = items[0];
          const second = items[1];

          if (first && second) {
            items.splice(0, 2, second, first);
            journal.revision++;
            journal.message = "moveRange:rows";
          }
        }}
      >
        Move first rows
      </button>

      <button
        type="button"
        onClick={() => {
          journal.failNext = true;
          commitThenThrow();
        }}
      >
        Commit then throw
      </button>
    </nav>

    @if (journal.open) {
      <section
        el={detailsHost}
        data-current={selected.id}
        attach={journalBehavior({
          scope: "branch",
          id: selected.id,
          revision: journal.revision,
        })}
      >
        <h2>{selected.title}</h2>
        <p>Status: {selected.status}</p>
        <p>Count: {selected.count}</p>

        <button
          type="button"
          onClick={() => {
            detailsHost?.scrollIntoView();
            journal.busy = true;
            journal.revision++;
            journal.message = `async-start:${selected.id}`;
          }}
        >
          Refresh preview
        </button>
      </section>
    }

    <ol>
      @for (const item of visibleItems; index index; key item.id) {
        <li data-active={item.id === journal.selectedId}>
          <article
            data-row-status={item.status}
            attach={journalBehavior({
              scope: "row",
              id: item.id,
              revision: journal.revision,
            })}
          >
            <h3>{index + 1}. {item.title}</h3>
            <p>{item.status} count {item.count}</p>

            <button
              type="button"
              onClick={() => {
                journal.selectedId = item.id;
                journal.revision++;
                journal.busy = true;
                journal.message = `select:${item.id}`;
              }}
            >
              Select {item.title}
            </button>

            <button
              type="button"
              onClick={() => {
                items.splice(index, 1);
                journal.revision++;
                journal.message = `removeRange:${item.id}`;
              }}
            >
              Remove {item.title}
            </button>
          </article>
        </li>
      } @empty {
        <li>
          <p>No rows for {journal.filter}</p>
        </li>
      }
    </ol>

    @try {
      <aside data-preview-id={preview.id} data-preview-revision={preview.revision}>
        <h2>{preview.title}</h2>
        <p>Preview revision {preview.revision}</p>
      </aside>
    } @pending {
      <p>Loading preview for {selected.title}</p>
    } @catch (_error) {
      <p>Preview failed for {selected.title}</p>
    }

    <footer>
      <output>{flushLabel}</output>
    </footer>
  </main>
}

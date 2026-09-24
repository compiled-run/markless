type PipelineItem = {
  id: string;
  title: string;
  status: "ready" | "blocked";
};

type PipelineState = {
  selectedId: string;
  filter: string;
  revision: number;
  open: boolean;
  message: string;
};

type PreviewResult = {
  id: string;
  title: string;
  owner: "app" | "symbol" | "runtime";
};

type ReceiptBehaviorOptions = {
  moduleId: string;
  revision: number;
};

function pipelineReceiptBehavior(options: ReceiptBehaviorOptions) {
  return (element: HTMLElement) => {
    element.dataset.pipelineModule = options.moduleId;
    element.dataset.pipelineRevision = String(options.revision);

    return () => {
      delete element.dataset.pipelineModule;
      delete element.dataset.pipelineRevision;
    };
  };
}

async function loadPreview(id: string, signal: AbortSignal): Promise<PreviewResult> {
  const response = await fetch(`/api/bundler-pipeline/${id}`, { signal });

  if (!response.ok) {
    throw new Error(`Could not load pipeline preview for ${id}`);
  }

  return await response.json();
}

export function App() @{
  const items = state<PipelineItem[]>([
    { id: "app", title: "App module", status: "ready" },
    { id: "symbol", title: "Generated symbol chunk", status: "ready" },
    { id: "runtime", title: "Runtime-facing module", status: "blocked" },
  ]);
  const pipeline = state<PipelineState>({
    selectedId: "app",
    filter: "",
    revision: 0,
    open: true,
    message: "pipeline ready",
  });
  let filterInput = element<HTMLInputElement>();
  let receiptHost = element<HTMLElement>();

  const visibleItems = computed(() => {
    return items.filter((item) => {
      return item.title.toLowerCase().includes(pipeline.filter);
    });
  });
  const selected = computed(() => {
    return items.find((item) => item.id === pipeline.selectedId) ?? items[0];
  });
  const pipelineLabel = computed(() => {
    return `${selected.title}:r${pipeline.revision}:${pipeline.message}`;
  });
  const preview = computed(async ({ signal }) => {
    return await loadPreview(pipeline.selectedId, signal);
  });

  <main
    data-selected={pipeline.selectedId}
    data-revision={pipeline.revision}
    attach={pipelineReceiptBehavior({
      moduleId: selected.id,
      revision: pipeline.revision,
    })}
  >
    <header>
      <h1>{pipelineLabel}</h1>

      <label>
        Filter modules
        <input
          el={filterInput}
          value={pipeline.filter}
          onInput={(event) => {
            pipeline.filter = event.currentTarget.value.trim().toLowerCase();
            pipeline.revision++;
            pipeline.message = `filter:${pipeline.filter || "all"}`;
          }}
          onKeyDown={(event) => {
            if (pipeline.open && event.key === "Escape") {
              event.preventDefault();

              pipeline.open = false;
              pipeline.message = "sync-policy:closed";
            }
          }}
        />
      </label>
    </header>

    <nav>
      <button
        type="button"
        onClick={() => {
          pipeline.open = !pipeline.open;
          pipeline.revision++;
          pipeline.message = pipeline.open ? "manifest:open" : "manifest:closed";
        }}
      >
        {pipeline.open ? "Hide" : "Show"} manifest
      </button>

      <button
        type="button"
        onClick={[
          () => {
            pipeline.message = "receipt:first-handler";
            pipeline.revision++;
          },
          () => {
            pipeline.message = "receipt:second-handler";
            receiptHost?.scrollIntoView();
          },
        ]}
      >
        Record receipt
      </button>
    </nav>

    @if (pipeline.open) {
      <section
        el={receiptHost}
        data-owner={selected.id}
        attach={pipelineReceiptBehavior({
          moduleId: selected.id,
          revision: pipeline.revision,
        })}
      >
        <h2>{selected.title}</h2>
        <p>{selected.status === "ready" ? "Ready" : "Blocked"}</p>

        <ol>
          @for (const item of visibleItems; index index; key item.id) {
            <li data-active={item.id === pipeline.selectedId}>
              <button
                type="button"
                onClick={() => {
                  pipeline.selectedId = item.id;
                  pipeline.revision++;
                  pipeline.message = `selected:${item.id}`;
                }}
              >
                {index + 1}. {item.title}
              </button>
            </li>
          } @empty {
            <li>No pipeline modules match {pipeline.filter}</li>
          }
        </ol>
      </section>
    }

    @try {
      <article data-preview-owner={preview.owner}>
        <h2>{preview.title}</h2>
        <p>{preview.id}</p>
      </article>
    } @pending {
      <p>Loading pipeline preview for {selected.title}</p>
    } @catch (_error) {
      <p>Could not load pipeline preview for {selected.title}</p>
    }

    <footer>
      <button
        type="button"
        onClick={() => {
          filterInput?.focus();
          pipeline.message = "filter-focused";
        }}
      >
        Focus filter
      </button>
      <output>{pipelineLabel}</output>
    </footer>
  </main>
}

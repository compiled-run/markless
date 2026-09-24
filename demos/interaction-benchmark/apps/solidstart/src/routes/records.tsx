import { Title } from "@solidjs/meta";
import { createMemo, createSignal, createStore, flush, For, onSettled, Show, untrack } from "solid-js";
import {
  type BenchmarkRecord,
  documentTitle,
  formatUpdatedAt,
  nextSort,
  normalizeEditedName,
  RECORDS,
  recordsCountText,
  ROUTES,
  selectionSummaryText,
  type SortKey,
  type SortState,
  visibleRecords,
} from "../shared/data";

interface Editing {
  record: BenchmarkRecord;
  trigger: HTMLButtonElement;
}

export default function Records() {
  const [records, setRecords] = createStore<BenchmarkRecord[]>(RECORDS.map((record) => ({ ...record })));
  const [selected, setSelected] = createStore<Record<string, boolean>>({});
  const [query, setQuery] = createSignal("");
  const [sort, setSort] = createSignal<SortState | null>(null);
  const [editing, setEditing] = createSignal<Editing | null>(null);

  const visible = createMemo(() => visibleRecords(records, query(), sort()));
  const selectedCount = createMemo(() => records.filter((record) => selected[record.id]).length);
  const ariaSort = (key: SortKey) => {
    const current = sort();
    return current?.key === key ? current.direction : "none";
  };

  const closeDialog = (name?: string) => {
    const current = editing();
    if (!current) return;
    if (name !== undefined) {
      const id = current.record.id;
      setRecords((draft) => {
        const record = draft.find((item) => item.id === id);
        if (record) record.name = name;
      });
    }
    setEditing(null);
    // The modal must leave the DOM before focus can return to a control behind it.
    flush();
    current.trigger.focus();
  };

  return (
    <>
      <Title>{documentTitle(ROUTES[1]!)}</Title>
      <h1 class="page-title" data-testid="page-title">Records</h1>
      <div class="records-toolbar">
        <div class="field">
          <label class="field-label" for="records-search">Search records</label>
          <input
            id="records-search"
            class="input"
            type="search"
            data-testid="records-search"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        <p class="muted" data-testid="records-count">{recordsCountText(visible().length, records.length)}</p>
        <p class="summary" data-testid="selection-summary" role="status">{selectionSummaryText(selectedCount())}</p>
      </div>
      <table class="records-table" data-testid="records-table">
        <thead>
          <tr>
            <th aria-label="Select" />
            <th aria-sort={ariaSort("name")}>
              <button type="button" class="sort-button" data-testid="sort-name" onClick={() => setSort((s) => nextSort(s, "name"))}>
                Name
              </button>
            </th>
            <th>Email</th>
            <th>Team</th>
            <th aria-sort={ariaSort("score")}>
              <button type="button" class="sort-button" data-testid="sort-score" onClick={() => setSort((s) => nextSort(s, "score"))}>
                Score
              </button>
            </th>
            <th>Updated</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          <For
            each={visible()}
            fallback={
              <tr>
                <td colspan="7" data-testid="records-empty">No records match</td>
              </tr>
            }
          >
            {(record) => (
              <tr data-testid="record-row" data-id={record.id}>
                <td>
                  <input
                    type="checkbox"
                    data-testid="record-select"
                    aria-label={`Select ${record.name}`}
                    checked={selected[record.id] === true}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setSelected((draft) => {
                        draft[record.id] = checked;
                      });
                    }}
                  />
                </td>
                <td data-testid="record-name">{record.name}</td>
                <td data-testid="record-email">{record.email}</td>
                <td data-testid="record-team">{record.team}</td>
                <td data-testid="record-score">{record.score}</td>
                <td data-testid="record-updated">{formatUpdatedAt(record.updatedAt)}</td>
                <td>
                  <button
                    type="button"
                    class="button"
                    data-testid="record-edit"
                    aria-label={`Edit ${record.name}`}
                    onClick={(event) => setEditing({ record, trigger: event.currentTarget })}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Show when={editing()} keyed>
        {(current) => <EditDialog initialName={current.record.name} onClose={closeDialog} />}
      </Show>
    </>
  );
}

function EditDialog(props: { initialName: string; onClose: (name?: string) => void }) {
  const [name, setName] = createSignal(untrack(() => props.initialName));
  let dialog!: HTMLDialogElement;
  let input!: HTMLInputElement;

  onSettled(() => {
    dialog.showModal();
    input.focus();
  });

  return (
    <dialog
      ref={(el) => (dialog = el)}
      class="dialog"
      data-testid="edit-dialog"
      aria-labelledby="edit-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const value = normalizeEditedName(name());
          if (value !== "") props.onClose(value);
        }}
      >
        <h2 class="dialog-title" id="edit-dialog-title" data-testid="edit-dialog-title">Edit record</h2>
        <div class="field">
          <label class="field-label" for="edit-name">Name</label>
          <input
            ref={(el) => (input = el)}
            id="edit-name"
            class="input"
            data-testid="edit-name"
            value={name()}
            onInput={(event) => setName(event.currentTarget.value)}
          />
        </div>
        <div class="dialog-actions">
          <button type="button" class="button" data-testid="edit-cancel" onClick={() => props.onClose()}>
            Cancel
          </button>
          <button
            type="submit"
            class="button button-primary"
            data-testid="edit-save"
            disabled={normalizeEditedName(name()) === ""}
          >
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}

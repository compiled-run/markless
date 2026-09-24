import type { DocumentHead } from "@qwik.dev/router";
import {
  $,
  component$,
  noSerialize,
  useComputed$,
  useSignal,
  useStore,
  type NoSerialize,
} from "@qwik.dev/core";
import {
  RECORDS,
  ROUTES,
  documentTitle,
  formatUpdatedAt,
  nextSort,
  normalizeEditedName,
  recordsCountText,
  selectionSummaryText,
  visibleRecords,
  type SortKey,
  type SortState,
} from "~/shared/data";

export default component$(() => {
  const query = useSignal("");
  const sort = useSignal<SortState | null>(null);
  const renamed = useStore<Record<string, string>>({});
  const selected = useStore<Record<string, boolean>>({});
  const editingId = useSignal<string | null>(null);
  const draft = useSignal("");
  const dialog = useSignal<HTMLDialogElement>();
  const trigger = useSignal<NoSerialize<HTMLButtonElement>>();

  const rows = useComputed$(() => {
    const records = RECORDS.map((record) =>
      renamed[record.id] === undefined
        ? record
        : { ...record, name: renamed[record.id] },
    );
    return visibleRecords(records, query.value, sort.value);
  });
  const selectedCount = useComputed$(
    () => Object.values(selected).filter(Boolean).length,
  );

  const ariaSort = (key: SortKey) =>
    sort.value?.key === key ? sort.value.direction : "none";

  const closeDialog = $(() => {
    dialog.value?.close();
  });

  return (
    <>
      <h1 class="page-title" data-testid="page-title">
        Records
      </h1>
      <div class="records-toolbar">
        <div class="field">
          <label class="field-label" for="records-search">
            Search records
          </label>
          <input
            class="input"
            type="search"
            id="records-search"
            data-testid="records-search"
            autoComplete="off"
            bind:value={query}
          />
        </div>
        <p class="muted" data-testid="records-count">
          {recordsCountText(rows.value.length, RECORDS.length)}
        </p>
        <p class="summary" data-testid="selection-summary" role="status">
          {selectionSummaryText(selectedCount.value)}
        </p>
      </div>
      <table class="records-table" data-testid="records-table">
        <thead>
          <tr>
            <th aria-label="Select"></th>
            <th aria-sort={ariaSort("name")}>
              <button
                type="button"
                class="sort-button"
                data-testid="sort-name"
                onClick$={() => (sort.value = nextSort(sort.value, "name"))}
              >
                Name
              </button>
            </th>
            <th>Email</th>
            <th>Team</th>
            <th aria-sort={ariaSort("score")}>
              <button
                type="button"
                class="sort-button"
                data-testid="sort-score"
                onClick$={() => (sort.value = nextSort(sort.value, "score"))}
              >
                Score
              </button>
            </th>
            <th>Updated</th>
            <th aria-label="Actions"></th>
          </tr>
        </thead>
        <tbody>
          {rows.value.length === 0 ? (
            <tr>
              <td colSpan={7} data-testid="records-empty">
                No records match
              </td>
            </tr>
          ) : (
            rows.value.map((record) => {
              const id = record.id;
              const name = record.name;
              return (
                <tr key={id} data-testid="record-row" data-id={id}>
                  <td>
                    <input
                      type="checkbox"
                      data-testid="record-select"
                      aria-label={`Select ${name}`}
                      checked={selected[id] === true}
                      onChange$={(_, el) => (selected[id] = el.checked)}
                    />
                  </td>
                  <td data-testid="record-name">{name}</td>
                  <td data-testid="record-email">{record.email}</td>
                  <td data-testid="record-team">{record.team}</td>
                  <td data-testid="record-score">{record.score}</td>
                  <td data-testid="record-updated">
                    {formatUpdatedAt(record.updatedAt)}
                  </td>
                  <td>
                    <button
                      type="button"
                      class="button"
                      data-testid="record-edit"
                      aria-label={`Edit ${name}`}
                      onClick$={(_, el) => {
                        trigger.value = noSerialize(el);
                        editingId.value = id;
                        draft.value = name;
                        dialog.value?.showModal();
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      <dialog
        ref={dialog}
        class="dialog"
        data-testid="edit-dialog"
        aria-labelledby="edit-dialog-title"
        onClose$={() => {
          editingId.value = null;
          trigger.value?.focus();
        }}
      >
        <form
          preventdefault:submit
          onSubmit$={() => {
            const name = normalizeEditedName(draft.value);
            if (editingId.value === null || name === "") return;
            renamed[editingId.value] = name;
            return closeDialog();
          }}
        >
          <h2
            class="dialog-title"
            id="edit-dialog-title"
            data-testid="edit-dialog-title"
          >
            Edit record
          </h2>
          <div class="field">
            <label class="field-label" for="edit-name">
              Name
            </label>
            <input
              class="input"
              type="text"
              id="edit-name"
              data-testid="edit-name"
              autoComplete="off"
              autoFocus
              bind:value={draft}
            />
          </div>
          <div class="dialog-actions">
            <button
              type="button"
              class="button"
              data-testid="edit-cancel"
              onClick$={closeDialog}
            >
              Cancel
            </button>
            <button
              type="submit"
              class="button button-primary"
              data-testid="edit-save"
              disabled={normalizeEditedName(draft.value) === ""}
            >
              Save
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
});

export const head: DocumentHead = { title: documentTitle(ROUTES[1]) };

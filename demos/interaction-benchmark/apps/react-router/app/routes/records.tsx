import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  type BenchmarkRecord,
  type SortKey,
  type SortState,
} from "../shared/data";

export function meta() {
  return [{ title: documentTitle(ROUTES[1]!) }];
}

const RecordRow = memo(function RecordRow({
  record,
  checked,
  onToggle,
  onEdit,
}: {
  record: BenchmarkRecord;
  checked: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string, trigger: HTMLButtonElement) => void;
}) {
  return (
    <tr data-testid="record-row" data-id={record.id}>
      <td>
        <input
          type="checkbox"
          data-testid="record-select"
          aria-label={`Select ${record.name}`}
          checked={checked}
          onChange={() => onToggle(record.id)}
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
          className="button"
          data-testid="record-edit"
          aria-label={`Edit ${record.name}`}
          onClick={(event) => onEdit(record.id, event.currentTarget)}
        >
          Edit
        </button>
      </td>
    </tr>
  );
});

function EditDialog({
  record,
  onSave,
  onClose,
}: {
  record: BenchmarkRecord;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(record.name);
  const normalized = normalizeEditedName(name);

  useEffect(() => {
    dialogRef.current?.showModal();
    inputRef.current?.focus();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (normalized === "") return;
    onSave(normalized);
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      data-testid="edit-dialog"
      aria-labelledby="edit-dialog-title"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <h2 className="dialog-title" id="edit-dialog-title" data-testid="edit-dialog-title">
          Edit record
        </h2>
        <div className="field">
          <label className="field-label" htmlFor="edit-name">
            Name
          </label>
          <input
            ref={inputRef}
            className="input"
            id="edit-name"
            data-testid="edit-name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </div>
        <div className="dialog-actions">
          <button
            type="button"
            className="button"
            data-testid="edit-cancel"
            onClick={() => dialogRef.current?.close()}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button button-primary"
            data-testid="edit-save"
            disabled={normalized === ""}
          >
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function Records() {
  const [records, setRecords] = useState<readonly BenchmarkRecord[]>(RECORDS);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const rows = useMemo(() => visibleRecords(records, query, sort), [records, query, sort]);
  const editing = editingId === null ? null : records.find((r) => r.id === editingId) ?? null;

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const edit = useCallback((id: string, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setEditingId(id);
  }, []);

  useEffect(() => {
    if (editingId === null && triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [editingId]);

  function save(name: string) {
    const id = editingId;
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
  }

  function ariaSort(key: SortKey) {
    return sort?.key === key ? sort.direction : "none";
  }

  return (
    <>
      <h1 className="page-title" data-testid="page-title">
        Records
      </h1>
      <div className="records-toolbar">
        <div className="field">
          <label className="field-label" htmlFor="records-search">
            Search records
          </label>
          <input
            className="input"
            id="records-search"
            type="search"
            data-testid="records-search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        <p className="muted" data-testid="records-count">
          {recordsCountText(rows.length, records.length)}
        </p>
        <p className="summary" data-testid="selection-summary" role="status">
          {selectionSummaryText(selected.size)}
        </p>
      </div>
      <table className="records-table" data-testid="records-table">
        <thead>
          <tr>
            <th aria-label="Select" />
            <th aria-sort={ariaSort("name")}>
              <button
                type="button"
                className="sort-button"
                data-testid="sort-name"
                onClick={() => setSort((s) => nextSort(s, "name"))}
              >
                Name
              </button>
            </th>
            <th>Email</th>
            <th>Team</th>
            <th aria-sort={ariaSort("score")}>
              <button
                type="button"
                className="sort-button"
                data-testid="sort-score"
                onClick={() => setSort((s) => nextSort(s, "score"))}
              >
                Score
              </button>
            </th>
            <th>Updated</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} data-testid="records-empty">
                No records match
              </td>
            </tr>
          ) : (
            rows.map((record) => (
              <RecordRow
                key={record.id}
                record={record}
                checked={selected.has(record.id)}
                onToggle={toggle}
                onEdit={edit}
              />
            ))
          )}
        </tbody>
      </table>
      {editing && (
        <EditDialog
          key={editing.id}
          record={editing}
          onSave={save}
          onClose={() => setEditingId(null)}
        />
      )}
    </>
  );
}

import { clientEntry, on, ref, type Handle } from 'remix/ui'

import {
  RECORDS,
  formatUpdatedAt,
  nextSort,
  normalizeEditedName,
  recordsCountText,
  selectionSummaryText,
  visibleRecords,
  type BenchmarkRecord,
  type SortKey,
  type SortState,
} from '../../shared/data.ts'

export const RecordsTable = clientEntry(import.meta.url, function RecordsTable(handle: Handle) {
  let records: BenchmarkRecord[] = [...RECORDS]
  let query = ''
  let sort: SortState | null = null
  let selected = new Set<string>()
  let editing: BenchmarkRecord | null = null
  let draftName = ''
  let editButtons = new Map<string, HTMLButtonElement>()

  function ariaSort(key: SortKey) {
    return sort?.key === key ? sort.direction : 'none'
  }

  function toggleSort(key: SortKey) {
    sort = nextSort(sort, key)
    handle.update()
  }

  function toggleSelected(id: string, checked: boolean) {
    if (checked) selected.add(id)
    else selected.delete(id)
    handle.update()
  }

  function openEditor(record: BenchmarkRecord) {
    editing = record
    draftName = record.name
    handle.update()
  }

  async function closeEditor(save: boolean) {
    let record = editing
    if (!record) return
    let name = normalizeEditedName(draftName)
    if (save && name !== '') {
      records = records.map((item) => (item.id === record.id ? { ...item, name } : item))
    }
    editing = null
    await handle.update()
    editButtons.get(record.id)?.focus()
  }

  function renderDialog() {
    let canSave = normalizeEditedName(draftName) !== ''
    return (
      <dialog
        className="dialog"
        data-testid="edit-dialog"
        aria-labelledby="edit-dialog-title"
        mix={[
          ref((node) => node.showModal()),
          on('cancel', (event) => {
            event.preventDefault()
            void closeEditor(false)
          }),
        ]}
      >
        <form
          mix={on('submit', (event) => {
            event.preventDefault()
            if (canSave) void closeEditor(true)
          })}
        >
          <h2 className="dialog-title" id="edit-dialog-title" data-testid="edit-dialog-title">
            Edit record
          </h2>
          <div className="field">
            <label className="field-label" htmlFor="edit-name">
              Name
            </label>
            <input
              className="input"
              type="text"
              id="edit-name"
              data-testid="edit-name"
              value={draftName}
              mix={[
                ref((node) => node.focus()),
                on('input', (event) => {
                  draftName = event.currentTarget.value
                  handle.update()
                }),
              ]}
            />
          </div>
          <div className="dialog-actions">
            <button
              type="button"
              className="button"
              data-testid="edit-cancel"
              mix={on('click', () => void closeEditor(false))}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button button-primary"
              data-testid="edit-save"
              disabled={!canSave}
            >
              Save
            </button>
          </div>
        </form>
      </dialog>
    )
  }

  return () => {
    let rows = visibleRecords(records, query, sort)
    return (
      <>
        <div className="records-toolbar">
          <div className="field">
            <label className="field-label" htmlFor="records-search">
              Search records
            </label>
            <input
              className="input"
              type="search"
              id="records-search"
              data-testid="records-search"
              value={query}
              mix={on('input', (event) => {
                query = event.currentTarget.value
                handle.update()
              })}
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
              <th aria-label="Select"></th>
              <th aria-sort={ariaSort('name')}>
                <button
                  type="button"
                  className="sort-button"
                  data-testid="sort-name"
                  mix={on('click', () => toggleSort('name'))}
                >
                  Name
                </button>
              </th>
              <th>Email</th>
              <th>Team</th>
              <th aria-sort={ariaSort('score')}>
                <button
                  type="button"
                  className="sort-button"
                  data-testid="sort-score"
                  mix={on('click', () => toggleSort('score'))}
                >
                  Score
                </button>
              </th>
              <th>Updated</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr key="empty">
                <td colSpan={7} data-testid="records-empty">
                  No records match
                </td>
              </tr>
            ) : (
              rows.map((record) => (
                <tr key={record.id} data-testid="record-row" data-id={record.id}>
                  <td>
                    <input
                      type="checkbox"
                      data-testid="record-select"
                      aria-label={`Select ${record.name}`}
                      checked={selected.has(record.id)}
                      mix={on('change', (event) =>
                        toggleSelected(record.id, event.currentTarget.checked),
                      )}
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
                      mix={[
                        on('click', () => openEditor(record)),
                        ref((node, signal) => {
                          editButtons.set(record.id, node)
                          signal.addEventListener('abort', () => {
                            if (editButtons.get(record.id) === node) editButtons.delete(record.id)
                          })
                        }),
                      ]}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {editing ? renderDialog() : null}
      </>
    )
  }
})

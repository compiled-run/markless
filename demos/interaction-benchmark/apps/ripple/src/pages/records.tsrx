import { flushSync, track } from 'ripple';
import { AppShell } from '../components/AppShell.tsrx';
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
} from '../shared/data.ts';

function EditDialog({
	record,
	onSave,
	onClose,
}: {
	record: BenchmarkRecord;
	onSave: (name: string) => void;
	onClose: () => void;
}) @{
	const draft = track(record.name);
	const canSave = track(() => normalizeEditedName(draft.value) !== '');
	let dialog: HTMLDialogElement | undefined;
	// oxlint-disable-next-line no-unassigned-vars -- assigned by ref={nameInput}
	let nameInput: HTMLInputElement | undefined;

	function open(node: HTMLDialogElement) {
		dialog = node;
		node.showModal();
		nameInput?.focus();
	}

	// The modal must close before the trigger outside it can take focus.
	function finish(done: () => void) {
		dialog?.close();
		done();
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const name = normalizeEditedName(draft.value);
		if (name !== '') finish(() => onSave(name));
	}

	function cancel(event: Event) {
		event.preventDefault();
		finish(onClose);
	}

	<dialog
		class="dialog"
		data-testid="edit-dialog"
		aria-labelledby="edit-dialog-title"
		ref={open}
		onCancel={{ handleEvent: cancel, delegated: false }}
	>
		<form onSubmit={submit}>
			<h2 class="dialog-title" id="edit-dialog-title" data-testid="edit-dialog-title">Edit record</h2>
			<div class="field">
				<label class="field-label" for="edit-name">Name</label>
				<input
					class="input"
					type="text"
					id="edit-name"
					data-testid="edit-name"
					ref={nameInput}
					value={draft.value}
					onInput={(event: Event) => (draft.value = (event.target as HTMLInputElement).value)}
				/>
			</div>
			<div class="dialog-actions">
				<button type="button" class="button" data-testid="edit-cancel" onClick={() => finish(onClose)}>Cancel</button>
				<button
					type="submit"
					class="button button-primary"
					data-testid="edit-save"
					disabled={!canSave.value}
				>
					Save
				</button>
			</div>
		</form>
	</dialog>
}

export function Records() @{
	const records = track<readonly BenchmarkRecord[]>(RECORDS);
	const query = track('');
	const sort = track<SortState | null>(null);
	const selected = track<ReadonlySet<string>>(new Set<string>());
	const editing = track<BenchmarkRecord | null>(null);
	const rows = track(() => visibleRecords(records.value, query.value, sort.value));
	const editButtons = new Map<string, HTMLButtonElement>();

	function ariaSort(key: SortKey) {
		const current = sort.value;
		return current !== null && current.key === key ? current.direction : 'none';
	}

	function toggleSelected(id: string, checked: boolean) {
		const next = new Set(selected.value);
		if (checked) next.add(id);
		else next.delete(id);
		selected.value = next;
	}

	// Focus the trigger only after a re-sort has moved its row, since moving a node drops focus.
	function closeDialog(rename?: string) {
		const record = editing.value;
		if (!record) return;
		flushSync(() => {
			if (rename !== undefined) {
				records.value = records.value.map((item) => (item.id === record.id ? { ...item, name: rename } : item));
			}
			editing.value = null;
		});
		editButtons.get(record.id)?.focus();
	}

	<AppShell route="records">
		<div class="records-toolbar">
			<div class="field">
				<label class="field-label" for="records-search">Search records</label>
				<input
					class="input"
					type="search"
					id="records-search"
					data-testid="records-search"
					value={query.value}
					onInput={(event: Event) => (query.value = (event.target as HTMLInputElement).value)}
				/>
			</div>
			<p class="muted" data-testid="records-count">{recordsCountText(rows.value.length, records.value.length)}</p>
			<p class="summary" data-testid="selection-summary" role="status">{selectionSummaryText(selected.value.size)}</p>
		</div>
		<table class="records-table" data-testid="records-table">
			<thead>
				<tr>
					<th aria-label="Select"></th>
					<th aria-sort={ariaSort('name')}>
						<button
							type="button"
							class="sort-button"
							data-testid="sort-name"
							onClick={() => (sort.value = nextSort(sort.value, 'name'))}
						>
							Name
						</button>
					</th>
					<th>Email</th>
					<th>Team</th>
					<th aria-sort={ariaSort('score')}>
						<button
							type="button"
							class="sort-button"
							data-testid="sort-score"
							onClick={() => (sort.value = nextSort(sort.value, 'score'))}
						>
							Score
						</button>
					</th>
					<th>Updated</th>
					<th aria-label="Actions"></th>
				</tr>
			</thead>
			<tbody>
				@for (const record of rows.value; key record.id) {
					<tr data-testid="record-row" data-id={record.id}>
						<td>
							<input
								type="checkbox"
								data-testid="record-select"
								aria-label={`Select ${record.name}`}
								checked={selected.value.has(record.id)}
								onChange={(event: Event) => toggleSelected(record.id, (event.target as HTMLInputElement).checked)}
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
								ref={(node: HTMLButtonElement) => {
									editButtons.set(record.id, node);
									return () => editButtons.delete(record.id);
								}}
								onClick={() => (editing.value = record)}
							>
								Edit
							</button>
						</td>
					</tr>
				} @empty {
					<tr>
						<td colspan={7} data-testid="records-empty">No records match</td>
					</tr>
				}
			</tbody>
		</table>
		@if (editing.value) {
			<EditDialog record={editing.value} onSave={(name: string) => closeDialog(name)} onClose={() => closeDialog()} />
		}
	</AppShell>
}

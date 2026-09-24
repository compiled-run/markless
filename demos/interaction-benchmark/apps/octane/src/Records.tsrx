import { useLayoutEffect, useRef, useState } from 'octane';
import {
	RECORDS,
	formatUpdatedAt,
	nextSort,
	normalizeEditedName,
	recordsCountText,
	selectionSummaryText,
	visibleRecords,
} from './shared/data.ts';
import type { BenchmarkRecord, SortKey, SortState } from './shared/data.ts';

function ariaSort(sort: SortState | null, key: SortKey): 'ascending' | 'descending' | 'none' {
	return sort !== null && sort.key === key ? sort.direction : 'none';
}

function EditDialog(props: {
	record: BenchmarkRecord;
	onSave: (name: string) => void;
	onClose: () => void;
}) @{
	const [name, setName] = useState(props.record.name);
	const dialog = useRef<HTMLDialogElement | null>(null);
	const input = useRef<HTMLInputElement | null>(null);
	const trimmed = normalizeEditedName(name);

	useLayoutEffect(() => {
		dialog.current?.showModal();
		input.current?.focus();
	}, []);

	<dialog
		class="dialog"
		data-testid="edit-dialog"
		aria-labelledby="edit-dialog-title"
		ref={dialog}
		onCancel={(event: Event) => {
			event.preventDefault();
			props.onClose();
		}}
	>
		<form
			onSubmit={(event: SubmitEvent) => {
				event.preventDefault();
				if (trimmed !== '') props.onSave(trimmed);
			}}
		>
			<h2 class="dialog-title" id="edit-dialog-title" data-testid="edit-dialog-title">{'Edit record'}</h2>
			<div class="field">
				<label class="field-label" for="edit-name">{'Name'}</label>
				<input
					class="input"
					id="edit-name"
					type="text"
					data-testid="edit-name"
					ref={input}
					value={name}
					onInput={(event: Event) => setName((event.currentTarget as HTMLInputElement).value)}
				/>
			</div>
			<div class="dialog-actions">
				<button class="button" type="button" data-testid="edit-cancel" onClick={() => props.onClose()}>
					{'Cancel'}
				</button>
				<button class="button button-primary" type="submit" data-testid="edit-save" disabled={trimmed === ''}>
					{'Save'}
				</button>
			</div>
		</form>
	</dialog>
}

export function Records() @{
	const [records, setRecords] = useState<readonly BenchmarkRecord[]>(RECORDS);
	const [query, setQuery] = useState('');
	const [sort, setSort] = useState<SortState | null>(null);
	const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
	const [editingId, setEditingId] = useState<string | null>(null);
	const [restoreFocusId, setRestoreFocusId] = useState<string | null>(null);
	const editButtons = useRef(new Map<string, HTMLButtonElement>());

	const rows = visibleRecords(records, query, sort);
	const editing = editingId === null ? null : records.find((record) => record.id === editingId) ?? null;

	useLayoutEffect(() => {
		if (restoreFocusId === null) return;
		editButtons.current.get(restoreFocusId)?.focus();
		setRestoreFocusId(null);
	}, [restoreFocusId]);

	const toggleSelected = (id: string) => {
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const closeDialog = () => {
		setRestoreFocusId(editingId);
		setEditingId(null);
	};

	const saveName = (name: string) => {
		const id = editingId;
		setRecords((current) => current.map((record) => (record.id === id ? { ...record, name } : record)));
		closeDialog();
	};

	<>
		<div class="records-toolbar">
			<div class="field">
				<label class="field-label" for="records-search">{'Search records'}</label>
				<input
					class="input"
					id="records-search"
					type="search"
					data-testid="records-search"
					value={query}
					onInput={(event: Event) => setQuery((event.currentTarget as HTMLInputElement).value)}
				/>
			</div>
			<p class="muted" data-testid="records-count">{recordsCountText(rows.length, records.length)}</p>
			<p class="summary" data-testid="selection-summary" role="status">{selectionSummaryText(selected.size)}</p>
		</div>
		<table class="records-table" data-testid="records-table">
			<thead>
				<tr>
					<th aria-label="Select" />
					<th aria-sort={ariaSort(sort, 'name')}>
						<button class="sort-button" type="button" data-testid="sort-name" onClick={() => setSort((current) => nextSort(current, 'name'))}>
							{'Name'}
						</button>
					</th>
					<th>{'Email'}</th>
					<th>{'Team'}</th>
					<th aria-sort={ariaSort(sort, 'score')}>
						<button class="sort-button" type="button" data-testid="sort-score" onClick={() => setSort((current) => nextSort(current, 'score'))}>
							{'Score'}
						</button>
					</th>
					<th>{'Updated'}</th>
					<th aria-label="Actions" />
				</tr>
			</thead>
			<tbody>
				@for (const record of rows; key record.id) {
					<tr data-testid="record-row" data-id={record.id}>
						<td>
							<input
								type="checkbox"
								data-testid="record-select"
								aria-label={'Select ' + record.name}
								checked={selected.has(record.id)}
								onChange={() => toggleSelected(record.id)}
							/>
						</td>
						<td data-testid="record-name">{record.name}</td>
						<td data-testid="record-email">{record.email}</td>
						<td data-testid="record-team">{record.team}</td>
						<td data-testid="record-score">{record.score}</td>
						<td data-testid="record-updated">{formatUpdatedAt(record.updatedAt)}</td>
						<td>
							<button
								class="button"
								type="button"
								data-testid="record-edit"
								aria-label={'Edit ' + record.name}
								ref={(element: HTMLButtonElement | null) => {
									if (element) editButtons.current.set(record.id, element);
									else editButtons.current.delete(record.id);
								}}
								onClick={() => setEditingId(record.id)}
							>
								{'Edit'}
							</button>
						</td>
					</tr>
				}
				@if (rows.length === 0) {
					<tr>
						<td colSpan={7} data-testid="records-empty">{'No records match'}</td>
					</tr>
				}
			</tbody>
		</table>
		@if (editing !== null) {
			<EditDialog key={editing.id} record={editing} onSave={saveName} onClose={closeDialog} />
		}
	</>
}

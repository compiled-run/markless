import { computed, element, state } from '@markless/core';
import Layout from '../src/layout.tsrx';
import {
	RECORDS,
	formatUpdatedAt,
	nextSort,
	normalizeEditedName,
	recordsCountText,
	selectionSummaryText,
	visibleRecords,
	type SortState,
} from '../src/shared/data.ts';

export default function Records() @{
	let query = state('');
	let sort = state(null as SortState | null);
	let records = state([...RECORDS]);
	let selectedIds = state([] as string[]);
	let editingId = state('');
	let draft = state('');
	const dialogEl = element<HTMLDialogElement>();
	const editNameEl = element<HTMLInputElement>();

	const visible = computed(() => visibleRecords(records, query, sort));
	const selectedCount = computed(() => selectedIds.length);
	const recordsCount = computed(() => recordsCountText(visible.length, RECORDS.length));
	const selectionSummary = computed(() => selectionSummaryText(selectedCount));
	const nameSort = computed(() => (sort?.key === 'name' ? sort.direction : 'none'));
	const scoreSort = computed(() => (sort?.key === 'score' ? sort.direction : 'none'));
	const cannotSave = computed(() => normalizeEditedName(draft) === '');

	<Layout route="records">
		<div class="records-toolbar">
			<div class="field">
				<label class="field-label" for="records-search">Search records</label>
				<input
					class="input"
					type="search"
					id="records-search"
					data-testid="records-search"
					value={query}
					onInput={(event) => (query = (event.target as HTMLInputElement).value)}
				/>
			</div>
			<p class="muted" data-testid="records-count">{recordsCount}</p>
			<p class="summary" data-testid="selection-summary" role="status">{selectionSummary}</p>
		</div>
		<table class="records-table" data-testid="records-table">
			<thead>
				<tr>
					<th aria-label="Select"></th>
					<th aria-sort={nameSort}>
						<button type="button" class="sort-button" data-testid="sort-name" onClick={() => (sort = nextSort(sort, 'name'))}>Name</button>
					</th>
					<th>Email</th>
					<th>Team</th>
					<th aria-sort={scoreSort}>
						<button type="button" class="sort-button" data-testid="sort-score" onClick={() => (sort = nextSort(sort, 'score'))}>Score</button>
					</th>
					<th>Updated</th>
					<th aria-label="Actions"></th>
				</tr>
			</thead>
			<tbody>
				@for (const record of visible; key record.id) {
					<tr data-testid="record-row" data-id={record.id}>
						<td>
							<input
								type="checkbox"
								data-testid="record-select"
								aria-label={`Select ${record.name}`}
								checked={selectedIds.includes(record.id)}
								onChange={(event) =>
									(selectedIds = (event.target as HTMLInputElement).checked
										? [...selectedIds, record.id]
										: selectedIds.filter((id) => id !== record.id))}
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
								id={`edit-${record.id}`}
								data-testid="record-edit"
								aria-label={`Edit ${record.name}`}
								onClick={() => {
									editingId = record.id;
									draft = record.name;
									dialogEl?.showModal();
									editNameEl?.focus();
								}}
							>Edit</button>
						</td>
					</tr>
				} @empty {
					<tr>
						<td colspan={7} data-testid="records-empty">No records match</td>
					</tr>
				}
			</tbody>
		</table>
		<dialog
			el={dialogEl}
			class="dialog"
			data-testid="edit-dialog"
			aria-labelledby="edit-dialog-title"
			onClose={() => {
				const trigger = document.getElementById(`edit-${editingId}`);
				editingId = '';
				trigger?.focus();
			}}
		>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					const name = normalizeEditedName(draft);
					if (editingId === '' || name === '') return;
					const id = editingId;
					records = records.map((record) => (record.id === id ? { ...record, name } : record));
					dialogEl?.close();
				}}
			>
				<h2 class="dialog-title" id="edit-dialog-title" data-testid="edit-dialog-title">Edit record</h2>
				<div class="field">
					<label class="field-label" for="edit-name">Name</label>
					<input
						el={editNameEl}
						class="input"
						id="edit-name"
						data-testid="edit-name"
						value={draft}
						onInput={() => (draft = editNameEl?.value ?? '')}
					/>
				</div>
				<div class="dialog-actions">
					<button type="button" class="button" data-testid="edit-cancel" onClick={() => dialogEl?.close()}>Cancel</button>
					<button type="submit" class="button button-primary" data-testid="edit-save" disabled={cannotSave}>Save</button>
				</div>
			</form>
		</dialog>
	</Layout>
}

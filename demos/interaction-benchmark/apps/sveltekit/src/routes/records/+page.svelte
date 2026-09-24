<script lang="ts">
	import { tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
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
		type SortState
	} from '$lib/shared/data';

	let records = $state.raw<readonly BenchmarkRecord[]>(RECORDS);
	let query = $state('');
	let sort = $state.raw<SortState | null>(null);
	const selected = new SvelteSet<string>();

	let editing = $state.raw<BenchmarkRecord | null>(null);
	let draftName = $state('');
	let dialog = $state<HTMLDialogElement>();
	let trigger: HTMLButtonElement | null = null;

	const rows = $derived(visibleRecords(records, query, sort));

	function ariaSort(key: SortKey) {
		return sort?.key === key ? sort.direction : 'none';
	}

	function toggleSelected(id: string, checked: boolean) {
		if (checked) selected.add(id);
		else selected.delete(id);
	}

	function openEditor(record: BenchmarkRecord, button: HTMLButtonElement) {
		trigger = button;
		draftName = record.name;
		editing = record;
	}

	function showModal(node: HTMLDialogElement) {
		node.showModal();
	}

	function save(event: SubmitEvent) {
		event.preventDefault();
		const name = normalizeEditedName(draftName);
		if (editing === null || name === '') return;
		const id = editing.id;
		records = records.map((r) => (r.id === id ? { ...r, name } : r));
		dialog?.close();
	}

	async function onClose() {
		const returnTo = trigger;
		trigger = null;
		editing = null;
		// A keyed re-sort moves the row, which drops focus from the button inside it.
		await tick();
		returnTo?.focus();
	}
</script>

<div class="records-toolbar">
	<div class="field">
		<label class="field-label" for="records-search">Search records</label>
		<input
			class="input"
			id="records-search"
			type="search"
			data-testid="records-search"
			bind:value={query}
		/>
	</div>
	<p class="muted" data-testid="records-count">{recordsCountText(rows.length, records.length)}</p>
	<p class="summary" data-testid="selection-summary" role="status">{selectionSummaryText(selected.size)}</p>
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
					onclick={() => (sort = nextSort(sort, 'name'))}>Name</button
				>
			</th>
			<th>Email</th>
			<th>Team</th>
			<th aria-sort={ariaSort('score')}>
				<button
					type="button"
					class="sort-button"
					data-testid="sort-score"
					onclick={() => (sort = nextSort(sort, 'score'))}>Score</button
				>
			</th>
			<th>Updated</th>
			<th aria-label="Actions"></th>
		</tr>
	</thead>
	<tbody>
		{#each rows as record (record.id)}
			<tr data-testid="record-row" data-id={record.id}>
				<td
					><input
						type="checkbox"
						data-testid="record-select"
						aria-label="Select {record.name}"
						checked={selected.has(record.id)}
						onchange={(event) => toggleSelected(record.id, event.currentTarget.checked)}
					/></td
				>
				<td data-testid="record-name">{record.name}</td>
				<td data-testid="record-email">{record.email}</td>
				<td data-testid="record-team">{record.team}</td>
				<td data-testid="record-score">{record.score}</td>
				<td data-testid="record-updated">{formatUpdatedAt(record.updatedAt)}</td>
				<td
					><button
						type="button"
						class="button"
						data-testid="record-edit"
						aria-label="Edit {record.name}"
						onclick={(event) => openEditor(record, event.currentTarget)}>Edit</button
					></td
				>
			</tr>
		{:else}
			<tr><td colspan="7" data-testid="records-empty">No records match</td></tr>
		{/each}
	</tbody>
</table>

{#if editing}
	<dialog
		bind:this={dialog}
		{@attach showModal}
		class="dialog"
		data-testid="edit-dialog"
		aria-labelledby="edit-dialog-title"
		onclose={onClose}
	>
		<form onsubmit={save}>
			<h2 class="dialog-title" id="edit-dialog-title" data-testid="edit-dialog-title">Edit record</h2>
			<div class="field">
				<label class="field-label" for="edit-name">Name</label>
				<input class="input" id="edit-name" data-testid="edit-name" bind:value={draftName} />
			</div>
			<div class="dialog-actions">
				<button type="button" class="button" data-testid="edit-cancel" onclick={() => dialog?.close()}
					>Cancel</button
				>
				<button
					type="submit"
					class="button button-primary"
					data-testid="edit-save"
					disabled={normalizeEditedName(draftName) === ''}>Save</button
				>
			</div>
		</form>
	</dialog>
{/if}

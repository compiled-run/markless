import { computed, state } from '@markless/core';

// A select-all checkbox shows "mixed" while some rows are picked; a row shows "mixed" while it is partly picked.
export default function MixedPage() @{
	let files = state([
		{ id: 'a', on: false, partly: false },
		{ id: 'b', on: false, partly: false },
		{ id: 'c', on: false, partly: false },
	]);
	const some = computed(() => files.some((file) => file.on || file.partly) && !files.every((file) => file.on));
	const all = computed(() => files.every((file) => file.on));

	<main>
		<label>
			<input id="all" type="checkbox" indeterminate={some} checked={all} onChange={() => (files = files.map((file) => ({ ...file, on: !all, partly: false })))} />
			All files
		</label>
		<ul>
			@for (const file of files; key file.id) {
				<li>
					<input
						class="one"
						type="checkbox"
						data-id={file.id}
						checked={file.on}
						indeterminate={file.partly}
						onChange={() => (files = files.map((each) => (each.id === file.id ? { ...each, on: !each.on, partly: false } : each)))}
					/>
				</li>
			}
		</ul>
		<button id="partly" onClick={() => (files = files.map((each) => (each.id === 'c' ? { ...each, partly: true } : each)))}>partly</button>
	</main>
}

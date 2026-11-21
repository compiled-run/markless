import { computed, state } from '@markless/core';

export default function ObjectSpread() @{
	let rows = state([
		{ id: 'a', name: 'Ada', tag: 'x' },
		{ id: 'b', name: 'Bo', tag: 'y' },
	]);
	let extra = state<{ readonly tag: string } | null>(null);
	let draft = state('Cy');
	const first = computed(() => ({ tag: 'base', ...rows[0], ...extra }));
	<main>
		<ul>
			@for (const row of rows; key row.id) {
				<li>{`${row.id} ${row.name} ${row.tag}`}</li>
			}
		</ul>
		<p>{`first ${first.name} ${first.tag}`}</p>
		<form onSubmit={(event) => {
			event.preventDefault();
			const name = draft;
			rows = rows.map((row) => (row.id === 'a' ? { ...row, name } : row));
		}}>
			<input value={draft} onInput={(event) => (draft = event.currentTarget.value)} />
			<button>Rename</button>
		</form>
		<button onClick={() => (extra = { tag: 'z' })}>Tag</button>
		<button onClick={() => (rows = rows.map((row) => ({ name: 'kept', tag: 'new', ...row, id: `${row.id}!` })))}>Keep</button>
	</main>
}

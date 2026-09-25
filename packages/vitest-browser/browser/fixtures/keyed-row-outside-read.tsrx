import { computed, state } from '@markless/core';

export function App() @{
	let crew = state([
		{ id: 'c1', name: 'Ada' },
		{ id: 'c2', name: 'Bo' },
		{ id: 'c3', name: 'Cy' },
	]);
	let picked = state([] as string[]);
	const summary = computed(() => `${picked.length} picked`);

	<main>
		<p data-summary>{summary}</p>
		<button type="button" data-rename onClick={() => (crew = crew.map((m) => (m.id === 'c2' ? { ...m, name: 'Bea' } : m)))}>Rename</button>
		<ul>
			@for (const member of crew; key member.id) {
				<li data-member={member.id}>
					<input
						type="checkbox"
						data-pick
						aria-label={`Pick ${member.name}`}
						checked={picked.includes(member.id)}
						onChange={(event) =>
							(picked = (event.target as HTMLInputElement).checked
								? [...picked, member.id]
								: picked.filter((id) => id !== member.id))}
					/>
					<span data-name>{member.name}</span>
				</li>
			}
		</ul>
	</main>
}

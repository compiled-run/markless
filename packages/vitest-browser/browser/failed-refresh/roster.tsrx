import { computed, state } from '@markless/core';

export function Roster() @{
	let page = state(1);
	const members = computed(async () => {
		const at = page;
		await new Promise((resolve) => setTimeout(resolve, at === 1 ? 10 : 120));
		if (at === 2) throw new Error('Page 2 is unavailable');
		return [at * 10 + 1, at * 10 + 2].map((id) => ({ id, name: 'Member ' + id }));
	});

	<>
		<nav>
			<a href="#" data-second onClick={(event) => { event.preventDefault(); page = 2; }}>Second page</a>
			<a href="#" data-third onClick={(event) => { event.preventDefault(); page = 3; }}>Third page</a>
		</nav>
		<table data-roster>
			<tbody>
				@try {
					<>
						@for (const member of members; key member.id) {
							<tr data-member><td>{member.name}</td></tr>
						}
					</>
				} @catch (problem) {
					<tr data-problem><td role="alert">{problem.message}</td></tr>
				}
			</tbody>
		</table>
	</>
}

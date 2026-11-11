import { computed, state } from '@markless/core';
import { fetchList } from './fetch-list.ts';

export default function Page() @{
	let round = state(0);
	let failing = state(false);

	<div>
		<button data-refresh onClick={() => round++}>Refresh</button>
		<button data-fail onClick={() => (failing = true)}>Fail</button>
		<button data-recover onClick={() => (failing = false)}>Recover</button>
		<Todos round={round} failing={failing} />
	</div>
}

function Todos({ round, failing }: { round: number; failing: boolean }) @{
	let picked = state('');
	const todos = computed(async () => fetchList(round, failing));

	<section>
		@try {
			<ul>
				@for (const todo of todos; key todo.id) {
					<li>{todo.name} <button data-edit onClick={() => (picked = todo.name)}>Edit</button></li>
				}
			</ul>
		} @pending {
			<p>Loading</p>
		} @catch (error, reset) {
			<p data-error>{error.message} <button onClick={reset}>Retry</button></p>
		}
		<p data-picked>{picked}</p>
	</section>
}

import { state } from '@markless/core';

function Badge({ count }: { count: number }) @{
	<p>
		@if (count > 0) {
			<span data-open>{count}</span>
		}
	</p>
}

export default function Page() @{
	let count = state(0);

	<section>
		<button data-more onClick={() => count++}>More</button>
		<button data-reset onClick={() => (count = 0)}>Reset</button>
		<Badge count={count} />
	</section>
}

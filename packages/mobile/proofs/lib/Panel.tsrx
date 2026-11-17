import { state } from '@markless/core';

export function Panel({ title }: { title: string }) @{
	let open = state(false);
	<section>
		<button onClick={() => (open = !open)}>{title} is {open ? 'open' : 'shut'}</button>
	</section>
}

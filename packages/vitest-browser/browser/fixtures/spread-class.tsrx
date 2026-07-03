import { state } from '@markless/core';

export function App() @{
	const meta = state({ id: 'hero', role: 'note', hidden: false });
	let picked = state(false);

	<section data-kind="card" {...meta} title="Final">
		<button
			type="button"
			data-pick
			class={picked ? 'chip picked' : 'chip plain'}
			onClick={() => picked = !picked}
		>
			Pick
		</button>
	</section>
}

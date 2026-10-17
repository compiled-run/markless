import { state } from '@markless/core';

export default function GlobalConversionAttribute() @{
	let open = state(false);
	let level = state('4');

	<main>
		<button type="button" data-trigger aria-expanded={String(open)} onClick={() => open = !open}>menu</button>
		<output data-level data-next={Number(level) + 1} onClick={() => level = String(Number(level) * 2)}>{encodeURIComponent('#' + level)}</output>
	</main>
}

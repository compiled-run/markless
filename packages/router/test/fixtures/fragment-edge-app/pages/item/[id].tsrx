import { state } from '@markless/core';
import type { PageProps } from '@markless/router';
import Nav from '../../src/nav.tsrx';

export default function Item({ params }: PageProps<{ id: string }>) @{
	let taps = state(0);

	<main data-page={`item-${params.id}`}>
		<title>{`Item ${params.id}`}</title>
		<Nav />
		<p data-id>{params.id}</p>
		<output data-taps>{taps}</output>
		<button type="button" data-tap onClick={() => taps++}>Tap</button>
		<a href="../" data-up>Up</a>
	</main>
}

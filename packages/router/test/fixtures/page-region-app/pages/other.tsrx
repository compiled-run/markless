import { state } from '@markless/core';
import Layout from '../src/layout.tsrx';

export default function Other() @{
	let taps = state(0);

	<Layout name="other">
		<button type="button" data-tap onClick={() => taps++}>Tap</button>
		<output data-taps>{taps}</output>
	</Layout>
}

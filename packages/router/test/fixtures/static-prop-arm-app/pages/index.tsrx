import { state } from '@markless/core';
import Caption from '../components/caption.tsrx';

export default function Page() @{
	let count = state(0);

	<main>
		<Caption text="A caption with plain text." />
		<button type="button" data-count onClick={() => count++}>{count}</button>
	</main>
}

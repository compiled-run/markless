import { state } from '@markless/core';
import { Outer } from './fpc-lib.tsrx';

export default function ForwardedImportedPage() @{
	let n = state('0');
	<main>
		<button type="button" data-next onClick={() => (n = n + '1')}>
			next
		</button>
		<Outer value={n} />
	</main>;
}

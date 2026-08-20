import { state } from '@markless/core';
import { ImportedStepper } from './optional-callback-child.tsrx';

// The consumer that DOES pass the callback: today's callback-route behaviour.
export default function OptionalCallbackImportedPage() @{
	let observed = state('none');

	<section data-optional-callback-imported>
		<ImportedStepper name="watched" onChange={(value) => observed = 'watched:' + value} />
		<output data-imported-observed>{observed}</output>
	</section>
}

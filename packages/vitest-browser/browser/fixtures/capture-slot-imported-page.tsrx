import { state } from '@markless/core';
import { ImportedSequence } from './capture-slot-imported-child.tsrx';

export default function CaptureSlotImportedPage() @{
	let sequence = state('idle');

	<section data-capture-slot-imported>
		<ImportedSequence
			label="Imported aurora"
			onStep={async (value) => {
				sequence = value + ':started';
				await Promise.resolve();
				sequence = value + ':settled';
			}}
			onAfter={(value) => sequence = sequence + '>' + value}
		/>
		<output data-imported-order>{sequence}</output>
	</section>
}

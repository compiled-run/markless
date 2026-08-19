import { ImportedStepper } from './optional-callback-child.tsrx';

// The consumer that passes NO callback: the absent prop folds to a
// compiler-known undefined, so `onChange?.(steps)` no-ops after resume.
export default function OptionalCallbackAbsentPage() @{
	<section data-optional-callback-absent>
		<ImportedStepper name="silent" />
	</section>
}

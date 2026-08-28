import { state } from '@markless/core';
import { tokenbox } from '../barrel.ts';
import type { TokenBoxKeyedSegment } from '../tokenbox-types.ts';

// A value that already interleaves text and tokens: the shape a saved draft is
// restored into. `defaultValue` is read once, and the surface owns itself after
// that, which is why nothing here has to hold the value in state.
export default function Prefilled() @{
	let held = state('');

	<main>
		<tokenbox.root
			data-testid="root"
			name="prompt"
			defaultValue={[
				{ kind: 'text', text: 'Ask ' },
				{ kind: 'token', value: 'u_1', label: 'Alice Chen' },
				{ kind: 'text', text: ' about ' },
				{ kind: 'token', value: 'doc_9', label: 'Q3 plan' },
				{ kind: 'text', text: ' today' },
			]}
			onChange={(next: readonly TokenBoxKeyedSegment[]) => {
				held = next
					.map((one) => (one.kind === 'token' ? `[${one.value}]` : one.text))
					.join('');
			}}
		>
			<tokenbox.label data-testid="label">Draft</tokenbox.label>
			<tokenbox.input data-testid="input" />
			<tokenbox.field data-testid="field" />
		</tokenbox.root>
		<output data-testid="held">{held}</output>
	</main>
}

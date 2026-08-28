import { state } from '@markless/core';
import { tokenbox } from '../../index.ts';
import type { TokenBoxSegment } from '../tokenbox-types.ts';

// Two of them alive in one document: every handle read, every minted id and
// every instance write has to answer for its OWN widget. The left one takes
// mentions, the right one starts prefilled and has no triggers at all.
export default function TwoTokenBoxes() @{
	let leftHeld = state('');
	let rightHeld = state('');

	<main>
		<tokenbox.root
			data-testid="left-root"
			name="left"
			triggers={['@']}
			onChange={(next: readonly TokenBoxSegment[]) => {
				leftHeld = next
					.map((one) => (one.kind === 'token' ? `[${one.value}]` : one.text))
					.join('');
			}}
		>
			<tokenbox.label data-testid="left-label">Left</tokenbox.label>
			<tokenbox.input data-testid="left-input" />
			<tokenbox.field data-testid="left-field" />
		</tokenbox.root>
		<tokenbox.root
			data-testid="right-root"
			name="right"
			defaultValue={[
				{ kind: 'text', text: 'see ' },
				{ kind: 'token', value: 'doc_9', label: 'Q3 plan' },
			]}
			onChange={(next: readonly TokenBoxSegment[]) => {
				rightHeld = next
					.map((one) => (one.kind === 'token' ? `[${one.value}]` : one.text))
					.join('');
			}}
		>
			<tokenbox.label data-testid="right-label">Right</tokenbox.label>
			<tokenbox.input data-testid="right-input" />
			<tokenbox.field data-testid="right-field" />
		</tokenbox.root>
		<output data-testid="left-held">{leftHeld}</output>
		<output data-testid="right-held">{rightHeld}</output>
	</main>
}

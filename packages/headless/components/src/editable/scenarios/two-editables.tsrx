import { state } from '@markless/core';
import { editable } from '../../index.ts';

// Two of them alive in one document: every handle read, every minted id and every
// instance write has to answer for its OWN widget. Opening one must not open the
// other, and the two labels must name their own root.
export default function TwoEditables() @{
	const left = state({ title: 'alpha' });
	const right = state({ title: 'beta' });
	let leftHeld = state('alpha');
	let rightHeld = state('beta');

	<main>
		<editable.root
			data-testid="left-root"
			value={left.title}
			onChange={(next: string) => {
				left.title = next;
				leftHeld = next;
			}}
		>
			<editable.label data-testid="left-label">First</editable.label>
			<editable.trigger data-testid="left-trigger" />
			<editable.input data-testid="left-input" />
		</editable.root>
		<editable.root
			data-testid="right-root"
			value={right.title}
			onChange={(next: string) => {
				right.title = next;
				rightHeld = next;
			}}
		>
			<editable.label data-testid="right-label">Second</editable.label>
			<editable.trigger data-testid="right-trigger" />
			<editable.input data-testid="right-input" />
		</editable.root>
		<output data-testid="left-held">{leftHeld}</output>
		<output data-testid="right-held">{rightHeld}</output>
	</main>
}

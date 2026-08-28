import { state } from '@markless/core';
import { tokenbox } from '../barrel.ts';
import type { TokenBoxKeyedSegment } from '../tokenbox-types.ts';

// The controlled shape, and the one caret rule that comes with it: hold the
// value on a state object and hand back exactly what `onChange` gave you. An
// array the family emitted is passed over on the way back in, so the surface is
// never re-rendered under the caret; a genuinely different array — the reset
// button below — does re-render, which is the point of controlling it.
export default function Controlled() @{
	const own = state({ value: [] as readonly TokenBoxKeyedSegment[] });
	let held = state('');

	<main>
		<tokenbox.root
			data-testid="root"
			name="prompt"
			triggers={['@']}
			value={own.value}
			onChange={(next: readonly TokenBoxKeyedSegment[]) => {
				own.value = next;
				held = next
					.map((one) => (one.kind === 'token' ? `[${one.value}]` : one.text))
					.join('');
			}}
		>
			<tokenbox.label data-testid="label">Message</tokenbox.label>
			<tokenbox.input data-testid="input" />
		</tokenbox.root>
		<button
			type="button"
			data-testid="reset"
			onClick={() => {
				own.value = [
					{ kind: 'text', text: 'from ', id: 'r1' },
					{ kind: 'token', value: 'u_9', label: 'Reset', id: 'r2' },
				];
				held = 'from [u_9]';
			}}
		>Reset</button>
		<output data-testid="held">{held}</output>
	</main>
}

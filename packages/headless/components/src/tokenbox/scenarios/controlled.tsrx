import { state } from '@markless/core';
import { tokenbox } from '../../index.ts';
import type { TokenBoxSegment } from '../tokenbox-types.ts';

// The controlled shape: hold the value on a state object and hand back what
// `onChange` gave you. The surface keys its runs on content and position, so an
// echo patches nothing under the caret; a genuinely different value — the reset
// button below — does re-render, which is the point of controlling it.
export default function Controlled() @{
	const own = state({ value: [] as readonly TokenBoxSegment[] });
	let held = state('');

	<main>
		<tokenbox.root
			data-testid="root"
			name="prompt"
			triggers={['@']}
			value={own.value}
			onChange={(next: readonly TokenBoxSegment[]) => {
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
					{ kind: 'text', text: 'from ' },
					{ kind: 'token', value: 'u_9', label: 'Reset' },
				];
				held = 'from [u_9]';
			}}
		>Reset</button>
		<output data-testid="held">{held}</output>
	</main>
}

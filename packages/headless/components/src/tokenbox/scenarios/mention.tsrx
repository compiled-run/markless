import { state } from '@markless/core';
import { tokenbox } from '../barrel.ts';
import type { TokenBoxKeyedSegment } from '../tokenbox-types.ts';

// The docs "prompt field" recipe in miniature, and the starter a consumer
// copies. The box owns the trigger context; the suggestion list is ordinary
// consumer markup that reads it and calls `insertToken` with what was chosen.
function Suggestions() @{
	const box = tokenbox.state();
	const own = state({
		people: [
			{ value: 'u_1', label: 'Alice Chen' },
			{ value: 'u_2', label: 'Bo Nakamura' },
		],
	});

	<div data-testid="suggestions" ui-open={box.trigger !== undefined}>
		<output data-testid="trigger-char">{box.trigger?.char ?? ''}</output>
		<output data-testid="trigger-query">{box.trigger?.query ?? ''}</output>
		@for (const person of own.people; key person.value) {
			<button
				type="button"
				data-testid={`suggest-${person.value}`}
				onClick={() => {
					box.insertToken(person.value, person.label);
				}}
			>{person.label}</button>
		}
	</div>
}

export default function Mention() @{
	let held = state('');

	<main>
		<tokenbox.root
			data-testid="root"
			name="prompt"
			triggers={['@', '/']}
			onChange={(next: readonly TokenBoxKeyedSegment[]) => {
				held = next
					.map((one) => (one.kind === 'token' ? `[${one.value}]` : one.text))
					.join('');
			}}
		>
			<tokenbox.label data-testid="label">Message</tokenbox.label>
			<tokenbox.description data-testid="description">
				Type {'@'} to mention someone.
			</tokenbox.description>
			<tokenbox.input data-testid="input" />
			<Suggestions />
		</tokenbox.root>
		<output data-testid="held">{held}</output>
	</main>
}

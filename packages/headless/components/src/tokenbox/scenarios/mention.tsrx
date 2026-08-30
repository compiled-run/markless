import { state } from '@markless/core';
import { tokenbox } from '../../index.ts';
import type { TokenBoxSegment } from '../tokenbox-types.ts';

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
		<output data-testid="trigger-anchored">{box.trigger?.rect === undefined ? 'no' : 'yes'}</output>
		@for (const person of own.people; key person.value) {
			<tokenbox.itemtrigger
				value={person.value}
				label={person.label}
				data-testid={`suggest-${person.value}`}
			/>
		}
	</div>
}

export default function Mention() @{
	let held = state('');
	// Append-only, because DOM commits coalesce: the last value a field shows
	// cannot tell a test which values came before it, and "nothing was reported
	// mid-composition" is a claim about the ones in between.
	let reports = state('');

	<main>
		<tokenbox.root
			data-testid="root"
			name="prompt"
			triggers={['@', '/']}
			onChange={(next: readonly TokenBoxSegment[]) => {
				const text = next
					.map((one) => (one.kind === 'token' ? `[${one.value}]` : one.text))
					.join('');
				held = text;
				reports = `${reports}${text};`;
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
		<output data-testid="reports">{reports}</output>
	</main>
}

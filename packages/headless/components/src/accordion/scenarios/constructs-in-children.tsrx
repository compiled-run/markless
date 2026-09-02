import { state } from '@markless/core';
import type { PropsOf } from '@markless/core';
import { accordion } from '../../index.ts';

// Constructs as the direct child of a component tag, every shape at once: a
// `@for` and an `@if` under the family root, an `@if` under a non-root part
// (the fixed section's content), and `@for`/`@if`/`@switch` under a consumer's
// own component whose hole sits behind an element it renders first.
//
// Two shapes are avoided on purpose, both refused before this change too: a row
// whose part projects an element or an arm ships no row builder
// (MARKLESS_KEYED_REPEAT_ROW_MINT_UNSUPPORTED), and a part written BEFORE the
// loop leaves the loop's row start uncountable, so the repeat never resumes.
function Card({ children, ...rest }: PropsOf<'article'>) @{
	<article {...rest}>
		<h3 data-testid="card-heading">Card</h3>
		{children}
	</article>
}

export default function ConstructsInChildren() @{
	const box = state({
		rows: [
			{ value: 'alpha', question: 'The first question' },
			{ value: 'beta', question: 'The second question' },
		],
		note: false,
		kind: 'calm',
	});

	<section>
		<button
			type="button"
			data-testid="add"
			onClick={() => {
				box.rows = [...box.rows, { value: 'gamma', question: 'The third question' }];
			}}
		>Add</button>
		<button
			type="button"
			data-testid="drop"
			onClick={() => {
				box.rows = box.rows.slice(0, -1);
			}}
		>Drop</button>
		<button
			type="button"
			data-testid="flip"
			onClick={() => {
				box.note = !box.note;
				box.kind = box.note ? 'hot' : 'calm';
			}}
		>Flip</button>
		<accordion.root data-testid="root">
			@for (const row of box.rows; key row.value) {
				<accordion.item value={row.value} data-testid="row">
					<accordion.itemlabel>
						<accordion.itemtrigger data-testid="row-trigger">{row.question}</accordion.itemtrigger>
					</accordion.itemlabel>
					<accordion.itemcontent data-testid="row-content">An answer.</accordion.itemcontent>
				</accordion.item>
			}
			<accordion.item value="fixed" data-testid="fixed">
				<accordion.itemlabel>
					<accordion.itemtrigger data-testid="fixed-trigger">The fixed question</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="fixed-content">
					@if (box.note) {
						<p data-testid="fixed-note">Noted.</p>
					} @else {
						<p data-testid="fixed-plain">Plain.</p>
					}
				</accordion.itemcontent>
			</accordion.item>
			@if (box.note) {
				<p data-testid="root-note">A note under the root.</p>
			}
		</accordion.root>
		<Card data-testid="card">
			@for (const row of box.rows; key row.value) {
				<p data-testid="card-row">{row.value}</p>
			}
			@if (box.note) {
				<em data-testid="card-note">noted</em>
			}
			@switch (box.kind) {
				@case 'hot': { <strong data-testid="card-kind">hot</strong> }
				@default: { <span data-testid="card-kind">calm</span> }
			}
		</Card>
	</section>
}

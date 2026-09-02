import { state } from '@markless/core';
import { accordion } from '../../index.ts';

export default function RowsAtTheComponentRoot() @{
	const box = state({
		rows: [
			{ value: 'alpha', question: 'The first question', answer: 'The first answer.' },
			{ value: 'beta', question: 'The second question', answer: 'The second answer.' },
			{ value: 'gamma', question: 'The third question', answer: 'The third answer.' },
		],
	});

	<accordion.root class="faq" value="alpha" data-testid="root">
		@for (const row of box.rows; key row.value) {
			<accordion.item class="section" value={row.value} data-testid="row">
				<accordion.itemlabel class="heading">
					<accordion.itemtrigger class="trigger" data-testid="row-trigger">{row.question}</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent class="panel" data-testid="row-content">{row.answer}</accordion.itemcontent>
			</accordion.item>
		}
		<button
			type="button"
			data-testid="add"
			onClick={() => {
				box.rows = [...box.rows, { value: 'delta', question: 'The fourth question', answer: 'The fourth answer.' }];
			}}
		>Add</button>

		<style>
			.faq {
				display: grid;
				gap: 0.5em;
			}
		</style>
	</accordion.root>
}

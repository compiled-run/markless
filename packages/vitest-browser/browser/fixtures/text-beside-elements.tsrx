import { state } from '@markless/core';

function Icon() @{
	<i data-glyph>+</i>
}

function Box({ label, children }) @{
	<span data-box>{label}{children}</span>
}

export default function TextBesideElements() @{
	let count = state(0);
	let word = state('');
	let rows = state([{ key: 'a', n: 0 }]);

	<main>
		<button type="button" data-bump onClick={() => {
			count = count + 1;
			word = word + 'x';
			rows = rows.map((row) => ({ key: row.key, n: row.n + 1 }));
		}}>bump</button>
		<button type="button" data-add onClick={() => rows = [...rows, { key: 'b' + rows.length, n: count }]}>add</button>
		<p data-lead>{count}<b data-mark>!</b></p>
		<p data-trail><i data-icon>*</i>{count}</p>
		<p data-both>n={count}<u data-mid>|</u>tail</p>
		<p data-twice>{count}<b>|</b>{count}</p>
		<p data-empty>{word}<b data-after>.</b></p>
		<p data-end><Icon />{count}<b data-last>.</b></p>
		<Box label={count}><em data-caret /></Box>
		<ul>
			@for (const row of rows; key row.key) {
				<li data-row={row.key}>{row.n}<s data-row-mark>~</s></li>
			}
		</ul>
	</main>
}

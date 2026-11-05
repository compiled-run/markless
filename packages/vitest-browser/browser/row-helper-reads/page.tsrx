import { state } from '@markless/core';

const ROWS = [
	{ key: 0, name: 'core', missing: [{ key: 0, dep: 'web' }] },
	{ key: 1, name: 'web', missing: [] },
	{ key: 2, name: 'router', missing: [{ key: 0, dep: 'core' }, { key: 1, dep: 'web' }] },
];
type Row = (typeof ROWS)[number];

export default function RowHelperReads() @{
	let gone = state(-1);
	const missAt = (row: Row) => (gone >= 0 ? row.missing.findIndex((miss) => miss.dep === ROWS[gone]!.name) : -1);
	const goneName = () => (gone >= 0 ? ROWS[gone]!.name : '');
	const hit = (row: Row) => row.missing.some((miss) => miss.dep === goneName());
	const made = () => (row: Row) => missAt(row);
	const fromFactory = made();
	<main>
		<p data-outside={missAt(ROWS[2]!)}>{hit(ROWS[0]!) ? 'hit' : 'clear'}</p>
		<ul>
			@for (const row of ROWS; key row.key) {
				<li data-row={row.name} class={'row' + (gone === row.key ? ' del' : '') + (missAt(row) >= 0 ? ' red' : '')}>
					<span data-only={row.name} class={missAt(row) >= 0 ? 'red' : 'ok'}>{row.name}</span>
					<span data-chain={row.name} class={hit(row) ? 'red' : 'ok'}>c</span>
					<span data-factory={row.name} class={fromFactory(row) >= 0 ? 'red' : 'ok'}>f</span>
					@for (const miss of row.missing; key miss.key) {
						<i data-miss={row.name + miss.key} class={missAt(row) === miss.key ? 'on' : 'off'}>m</i>
					}
				</li>
			}
		</ul>
		<button data-delete onClick={() => (gone = 1)}>delete web</button>
	</main>
}

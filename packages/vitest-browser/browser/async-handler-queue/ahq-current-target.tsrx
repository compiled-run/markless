import { state } from '@markless/core';
import { markCurrentTarget } from './ahq-mark.ts';

export default function CurrentTargetPage() @{
	let rows = state([{ id: 'a' }, { id: 'b' }]);
	let open = state(true);
	let inline = state('');
	<main>
		<button type="button" data-name="own" onClick={markCurrentTarget} onKeyDown={markCurrentTarget}>own</button>
		<section data-name="outer" onClick={markCurrentTarget} onKeyDown={markCurrentTarget}>
			<button type="button" data-inner>inner</button>
		</section>
		<div data-name="inline" onClick={(event) => (inline = (event.currentTarget as HTMLElement).dataset.name ?? '')}>
			<span data-inline-target>inline</span>
		</div>
		<p data-inline>{inline}</p>
		<ul>
			@for (const row of rows; key row.id) {
				<li data-name={row.id} onClick={markCurrentTarget}>
					<span data-row-target>{row.id}</span>
				</li>
			}
		</ul>
		<button type="button" data-add onClick={() => (rows = [...rows, { id: `n${rows.length}` }])}>add</button>
		@if (open) {
			<article data-name="arm" onClick={markCurrentTarget}>
				<span data-arm-target>arm</span>
			</article>
		}
	</main>
}

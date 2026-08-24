import { state } from '@markless/core';

// Defect 84's growth half, over rows the client can finish alone: everything in
// a row here is static markup plus text read from the row's own item, which is
// exactly what the compiler ships `rowTemplate` for. The buttons rewrite the
// source three ways - grow past the served keys, shrink below them, and swap an
// unserved key in while a served one goes out.
//
// Each row also carries a button, so a minted row can be asked the one question
// count and text cannot answer: does the row this runtime built dispatch its
// OWN item's handler?
export default function KrgMintPage() @{
	let shown = state([
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
		{ id: 'c', label: 'charlie' },
	]);
	let picked = state('none');

	<section data-krg-mint-page>
		<button type="button" data-krg-grow onClick={() => shown = [
			{ id: 'a', label: 'alpha' },
			{ id: 'b', label: 'bravo' },
			{ id: 'c', label: 'charlie' },
			{ id: 'd', label: 'delta' },
		]}>grow</button>
		<button type="button" data-krg-shrink onClick={() => shown = [
			{ id: 'a', label: 'alpha' },
			{ id: 'b', label: 'bravo' },
		]}>shrink</button>
		<button type="button" data-krg-swap onClick={() => shown = [
			{ id: 'b', label: 'bravo' },
			{ id: 'd', label: 'delta' },
		]}>swap</button>
		<button type="button" data-krg-restore onClick={() => shown = [
			{ id: 'a', label: 'alpha' },
			{ id: 'b', label: 'bravo' },
			{ id: 'c', label: 'charlie' },
		]}>restore</button>
		<output data-krg-count>{shown.length}</output>
		<output data-krg-picked>{picked}</output>
		<ul data-krg-mint-list>
			<li data-krg-mint-header>header</li>
			@for (const item of shown; key item.id) {
				<li data-krg-mint-row>
					<span data-krg-mint-label>{item.label}</span>
					<button type="button" data-krg-mint-pick onClick={() => picked = item.label}>pick</button>
				</li>
			}
		</ul>
		<p data-krg-mint-tail>tail</p>
	</section>
}

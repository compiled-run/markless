import { state } from '@markless/core';
import { KrgItem } from './krg-family.tsrx';

// The other half of the control pair: the same source and the same three writes
// with ONLY widget-rooting rows, so the plain list is not there to carry it.
export default function KrgWidgetPage() @{
	let shown = state([
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
		{ id: 'c', label: 'charlie' },
	]);

	<section data-krg-widget-page>
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
		<output data-krg-count>{shown.length}</output>
		<div data-krg-widget-list>
			@for (const item of shown; key item.id) {
				<KrgItem value={item.label}>{item.label}</KrgItem>
			}
		</div>
	</section>
}

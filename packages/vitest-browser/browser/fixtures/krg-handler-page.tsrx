import { state } from '@markless/core';
import { KrgItem } from './krg-family.tsrx';

// Defect 84, driven from a handler. ONE keyed source feeds two lists: a
// plain-row control list and a list whose rows each root a widget. The buttons
// rewrite the source three ways - grow past the keys that were served, shrink
// below them, and a filter that admits an unserved key while dropping a served
// one. A text read of the same array sits alongside, so the page says whether
// the source moved at all when the rows do not.
export default function KrgHandlerPage() @{
	let shown = state([
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'bravo' },
		{ id: 'c', label: 'charlie' },
	]);

	<section data-krg-handler-page>
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
		<ul data-krg-plain-list>
			@for (const item of shown; key item.id) {
				<li data-krg-plain-row data-krg-value={item.label}>{item.label}</li>
			}
		</ul>
		<div data-krg-widget-list>
			@for (const item of shown; key item.id) {
				<KrgItem value={item.label}>{item.label}</KrgItem>
			}
		</div>
	</section>
}

import { element, state } from '@markless/core';
import { reportValues } from './aeh-report.ts';

const shelves = ['oak', 'pine', 'elm'];

export function AehModuleConstRows() @{
	let order = state('');
	const shelfEls = element<HTMLLIElement[]>();

	<section data-aeh-module-const data-order={order}>
		<button type="button" data-aeh-module-probe onClick={() => order = `${reportValues(shelfEls)}:${shelfEls.length}`}>probe</button>
		<ul>
			@for (const shelf of shelves; key shelf) {
				<li data-aeh-value={shelf} el={shelfEls}>{shelf}</li>
			}
		</ul>
	</section>
}

export function AehLocalConstRows() @{
	const items = [
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'beta' },
		{ id: 'c', label: 'gamma' },
	];
	let order = state('');
	const rowEls = element<HTMLLIElement[]>();

	<section data-aeh-local-const data-order={order}>
		<button type="button" data-aeh-local-probe onClick={() => order = reportValues(rowEls)}>probe</button>
		<ul>
			@for (const item of items; key item.id) {
				<li data-aeh-value={item.label} el={rowEls}>{item.label}</li>
			}
		</ul>
	</section>
}

export default function AehConstRowsPage() @{
	<div>
		<AehModuleConstRows />
		<AehLocalConstRows />
	</div>
}

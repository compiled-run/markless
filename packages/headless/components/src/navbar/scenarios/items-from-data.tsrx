import { state } from '@markless/core';
import * as navbar from '../index.ts';

// What a real site header looks like: the entries are data, and the items come
// from a keyed loop over them.
//
// The `<div>` around the loop is load-bearing, not decoration: a construct
// cannot open directly inside a component tag's children, so the loop needs an
// intrinsic element to open in.
export default function ItemsFromData() @{
	let sections = state([
		{ value: 'products', label: 'Products' },
		{ value: 'docs', label: 'Docs' },
		{ value: 'company', label: 'Company' },
	]);

	<navbar.root aria-label="Primary" hover={false} data-testid="root">
		<div data-testid="entries">
			@for (const section of sections; key section.value) {
				<navbar.item value={section.value} data-testid="row-item" data-row={section.value}>
					<navbar.itemtrigger data-testid="row-itemtrigger">{section.label}</navbar.itemtrigger>
					<navbar.itemcontent data-testid="row-itemcontent">
						<navbar.itemlink href={'/' + section.value} data-testid="row-itemlink">
							All {section.label}
						</navbar.itemlink>
					</navbar.itemcontent>
				</navbar.item>
			}
		</div>
	</navbar.root>
}

import { state } from '@markless/core';

function Rack({ heading }: { readonly heading: string }) @{
	<div><Slot side="dark" title={heading} /><Slot side="light" title={heading} /></div>
}

function Slot({ side, title }: { readonly side: string; readonly title: string }) @{
	const picked = state({ value: '' });
	<button type="button" data-pick={title + '-' + side} onClick={() => { picked.value = title + ':' + side; }}>{title + ' ' + side + ' -> ' + picked.value}</button>
}

export default function RowsRenamedInPage() @{
	const racks = state([{ id: 1, label: 'alpha' }, { id: 2, label: 'beta' }]);
	<ul>
		<button type="button" data-rename onClick={() => { racks[0].label = 'gamma'; }}>rename</button>
		@for (const rack of racks; key rack.id) {
			<li><Rack heading={rack.label} /></li>
		}
	</ul>
}

import { state } from '@markless/core';

const TABS = [
	{ id: 'one', label: 'One' },
	{ id: 'two', label: 'Two' },
	{ id: 'three', label: 'Three' },
];

export default function ConstantRowsPage() @{
	let active = state('one');
	<nav>
		@for (const tab of TABS; key tab.id) {
			<span data-tab={tab.id}>
				@if (active === tab.id) {
					<b class="current">{tab.label}</b>
				} @else {
					<button type="button" data-pick={tab.id} onClick={() => (active = tab.id)}>{tab.label}</button>
				}
			</span>
		}
	</nav>
}

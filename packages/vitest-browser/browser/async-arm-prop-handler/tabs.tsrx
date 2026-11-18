import { state } from '@markless/core';
import FlagList from './flag-list.tsrx';
import FormList from './form-list.tsrx';

// The child holding the @if arm passes the async prop it got on into the arm's component.
export function FormTabs({ items }: { items: Array<string> }) @{
	let tab = state('a');

	<div>
		<button data-tab onClick={() => (tab = tab === 'a' ? 'b' : 'a')}>Tab</button>
		@if (tab === 'a') {
			<FormList items={items} />
		} @else {
			<p data-other>other</p>
		}
	</div>
}

export function FlagTabs({ items }: { items: Array<string> }) @{
	let tab = state('a');

	<div>
		<button data-tab onClick={() => (tab = tab === 'a' ? 'b' : 'a')}>Tab</button>
		@if (tab === 'a') {
			<FlagList items={items} />
		} @else {
			<p data-other>other</p>
		}
	</div>
}

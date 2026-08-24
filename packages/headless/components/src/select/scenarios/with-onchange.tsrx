import { state } from '@markless/core';
import { select } from '../../index.ts';

// The consumer's own handlers, logged so the suite can read what they were
// called with and how often. `onChange` carries the value, per QDS; the open
// callback is the family's second state and is named `onOpenChange`.
export function WithOnChange() @{
	let chosen = state('');
	let calls = state(0);
	let opens = state('');

	<section>
		<select.root
			data-testid="root"
			onChange={(value: string) => {
				chosen = value;
				calls = calls + 1;
			}}
			onOpenChange={(open: boolean) => {
				opens = opens + (open ? 'o' : 'c');
			}}
		>
			<select.label data-testid="label">Favorite Fruit</select.label>
			<select.trigger data-testid="trigger">Choose a Fruit</select.trigger>
			<select.content data-testid="content">
				<select.item value="apple" data-testid="apple">
					<select.itemlabel>Apple</select.itemlabel>
					<select.itemindicator data-testid="apple-itemindicator">Chosen</select.itemindicator>
				</select.item>
				<select.item value="banana" data-testid="banana">
					<select.itemlabel>Banana</select.itemlabel>
					<select.itemindicator data-testid="banana-itemindicator">Chosen</select.itemindicator>
				</select.item>
			</select.content>
		</select.root>
		<output data-testid="value">{chosen}</output>
		<output data-testid="calls">{calls}</output>
		<output data-testid="opens">{opens}</output>
	</section>
}

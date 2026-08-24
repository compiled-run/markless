import { select } from '../../index.ts';

// Two selects on one page: arrowing or choosing in one must leave the other
// exactly where it was.
export function TwoSelects() @{
	<div>
		<select.root data-testid="left-root">
			<select.label data-testid="left-label">Favorite Fruit</select.label>
			<select.trigger data-testid="left-trigger">Choose a Fruit</select.trigger>
			<select.content data-testid="left-content">
				<select.item value="apple" data-testid="left-apple">
					<select.itemlabel>Apple</select.itemlabel>
					<select.itemindicator data-testid="left-apple-itemindicator">Chosen</select.itemindicator>
				</select.item>
				<select.item value="banana" data-testid="left-banana">
					<select.itemlabel>Banana</select.itemlabel>
					<select.itemindicator data-testid="left-banana-itemindicator">Chosen</select.itemindicator>
				</select.item>
			</select.content>
		</select.root>
		<select.root data-testid="right-root">
			<select.label data-testid="right-label">Support Plan</select.label>
			<select.trigger data-testid="right-trigger">Choose a plan</select.trigger>
			<select.content data-testid="right-content">
				<select.item value="basic" data-testid="right-basic">
					<select.itemlabel>Basic</select.itemlabel>
					<select.itemindicator data-testid="right-basic-itemindicator">Chosen</select.itemindicator>
				</select.item>
				<select.item value="premium" data-testid="right-premium">
					<select.itemlabel>Premium</select.itemlabel>
					<select.itemindicator data-testid="right-premium-itemindicator">
						Chosen
					</select.itemindicator>
				</select.item>
			</select.content>
		</select.root>
	</div>
}

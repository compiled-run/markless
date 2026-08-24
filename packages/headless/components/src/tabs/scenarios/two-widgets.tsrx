import { tabs } from '../../index.ts';

// Two tab sets on one page, sharing the same values on purpose. Each root is its
// own instance boundary, so clicking in one must leave the other exactly where
// it was — the row that catches a regression in `scope: 'widget'`.
export default function TwoWidgets() @{
	<section>
		<tabs.root value="one" data-testid="left-root">
			<tabs.list data-testid="left-list">
				<tabs.trigger value="one" data-testid="left-one">One</tabs.trigger>
				<tabs.trigger value="two" data-testid="left-two">Two</tabs.trigger>
			</tabs.list>
			<tabs.content value="one" data-testid="left-one-content">Left first.</tabs.content>
			<tabs.content value="two" data-testid="left-two-content">Left second.</tabs.content>
		</tabs.root>
		<tabs.root value="one" data-testid="right-root">
			<tabs.list data-testid="right-list">
				<tabs.trigger value="one" data-testid="right-one">One</tabs.trigger>
				<tabs.trigger value="two" data-testid="right-two">Two</tabs.trigger>
			</tabs.list>
			<tabs.content value="one" data-testid="right-one-content">Right first.</tabs.content>
			<tabs.content value="two" data-testid="right-two-content">Right second.</tabs.content>
		</tabs.root>
	</section>
}

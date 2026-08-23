import * as tabs from '../index.ts';

// A consumer writing the attributes the family owns. `{...rest}` is spread
// first, so the family's own role and state win — QDS spreads it last, where a
// consumer silently overwrites aria-selected.
export default function ConsumerAttributes() @{
	<tabs.root value="one" data-testid="root">
		<tabs.list role="group" data-testid="list">
			<tabs.trigger
				value="one"
				role="presentation"
				aria-selected="false"
				data-testid="one-trigger"
			>One</tabs.trigger>
			<tabs.trigger value="two" data-testid="two-trigger">Two</tabs.trigger>
		</tabs.list>
		<tabs.content value="one" data-testid="one-content">First.</tabs.content>
		<tabs.content value="two" hidden={false} role="region" data-testid="two-content">
			Second.
		</tabs.content>
	</tabs.root>
}

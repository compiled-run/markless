import { collapsible } from '../../index.ts';

export default function Basic() @{
	<collapsible.root data-testid="root">
		<collapsible.trigger data-testid="trigger">What is a collapsible?</collapsible.trigger>
		<collapsible.content data-testid="content">
			A button that shows and hides the content below it.
		</collapsible.content>
	</collapsible.root>
}

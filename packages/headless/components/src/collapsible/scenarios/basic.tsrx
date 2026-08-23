import * as collapsible from '../index.ts';

// The starter a consumer copies: one button that shows and hides the panel under
// it, closed to begin with.
//
// The import is the family folder rather than the package barrel because this
// family is not wired into the barrel yet; every other scenario here does the
// same, and they all become `import { collapsible } from '../../index.ts'` the
// day the barrel carries it.
export default function Basic() @{
	<collapsible.root data-testid="root">
		<collapsible.trigger data-testid="trigger">What is a collapsible?</collapsible.trigger>
		<collapsible.content data-testid="content">
			A button that shows and hides the content below it.
		</collapsible.content>
	</collapsible.root>
}

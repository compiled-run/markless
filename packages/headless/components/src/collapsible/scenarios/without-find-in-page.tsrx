import { collapsible } from '../../index.ts';

// `disableUntilFound` turns find-in-page off for this collapsible: a closed panel
// is hidden outright, so the browser never reveals it and never fires
// `beforematch`.
export default function WithoutFindInPage() @{
	<section>
		<collapsible.root disableUntilFound data-testid="terms-root">
			<collapsible.trigger data-testid="terms-trigger">Terms</collapsible.trigger>
			<collapsible.content data-testid="terms-content">
				A phrase nobody should find while this panel is closed.
			</collapsible.content>
		</collapsible.root>
	</section>
}

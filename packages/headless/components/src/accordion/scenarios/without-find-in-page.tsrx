import { accordion } from '../../index.ts';

// `disableUntilFound` turns find-in-page off for this accordion: a closed panel
// is hidden outright, so the browser never reveals it and never fires
// `beforematch`.
export default function WithoutFindInPage() @{
	<section>
		<accordion.root disableUntilFound data-testid="root">
			<accordion.item value="terms" data-testid="terms-item">
				<accordion.itemlabel data-testid="terms-label">
					<accordion.itemtrigger data-testid="terms-trigger">Terms</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="terms-content">
					A phrase nobody should find while this section is closed.
				</accordion.itemcontent>
			</accordion.item>
		</accordion.root>
	</section>
}

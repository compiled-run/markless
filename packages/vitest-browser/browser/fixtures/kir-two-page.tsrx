import { KirItem, KirRoot } from './kir-family.tsrx';

// Defect 78: TWO widget instances on one page, each with its own items. A write
// inside the left one must leave every marker in the right one exactly where it
// was.
export default function KirTwoPage() @{
	<section data-kir-page>
		<KirRoot data-kir-left>
			<KirItem value="apple">apple</KirItem>
			<KirItem value="banana">banana</KirItem>
		</KirRoot>
		<KirRoot data-kir-right>
			<KirItem value="apple">apple</KirItem>
			<KirItem value="banana">banana</KirItem>
		</KirRoot>
	</section>
}

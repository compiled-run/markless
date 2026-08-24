import { KirItem, KirRoot } from './kir-family.tsrx';

// The control for the loop page: the same three items, written flat. Whatever
// the loop page is missing, this page says whether the repeat row is the cause.
export default function KirFlatPage() @{
	<section data-kir-page>
		<KirRoot>
			<KirItem value="apple">apple</KirItem>
			<KirItem value="banana">banana</KirItem>
			<KirItem value="cherry">cherry</KirItem>
		</KirRoot>
	</section>
}

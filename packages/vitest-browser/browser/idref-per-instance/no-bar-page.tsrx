import { Content, Item } from './nested-family.tsrx';

// The same inner family with no enclosing widget above it, so no roster can be
// inherited from one. Bisects the nesting-family page.
export default function NoBarPage() @{
	<section data-page>
		<Item label="plain-one">New</Item>
		<Item label="nesting">
			Share
			<Content>deep</Content>
		</Item>
		<Item label="plain-two">Print</Item>
	</section>
}

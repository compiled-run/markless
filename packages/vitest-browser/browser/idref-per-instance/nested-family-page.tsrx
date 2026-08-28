import { Bar, Content, Item } from './nested-family.tsrx';

// Every item roots its own instance of the inner family, and only "nesting"
// places the content part - so only that one has an element for the handle.
export default function NestedFamilyPage() @{
	<section data-page>
		<Bar>
			<Item label="plain-one">New</Item>
			<Item label="nesting">
				Share
				<Content>
					<Item label="deep-one">Email</Item>
					<Item label="deep-two">Copy link</Item>
				</Content>
			</Item>
			<Item label="plain-two">Print</Item>
		</Bar>
	</section>
}

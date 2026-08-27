import { Disclosure, Panel } from './root-idref.tsrx';

// Two instances on one page, and a third rooted INSIDE the first one's panel.
export default function RootIdrefPage() @{
	<section data-page>
		<Disclosure label="one">
			<Panel>
				first
				<Disclosure label="nested">
					<Panel>deep</Panel>
				</Disclosure>
			</Panel>
		</Disclosure>
		<Disclosure label="two">
			<Panel>second</Panel>
		</Disclosure>
	</section>
}

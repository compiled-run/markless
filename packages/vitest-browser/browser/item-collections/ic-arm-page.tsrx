import { IcArmRoot, IcArmToggle, IcItem, IcRoot } from './ic-widget.tsrx';

// Flat items with NO keyed repeat anywhere on the page, and one of them gated by
// an `@if` arm. A keyed repeat's collection write used to be the only thing that
// bumped a roster revision, so a page shaped like this moved its parts with no
// channel telling the rest to count again.
export default function IcArmPage() @{
	<section data-ic-page>
		<div data-ic-first>
			<IcArmRoot>
				<IcArmToggle />
				<IcItem>alpha</IcItem>
				<IcItem>bravo</IcItem>
				<IcItem>omega</IcItem>
			</IcArmRoot>
		</div>
		<div data-ic-second>
			<IcRoot>
				<IcItem>delta</IcItem>
				<IcItem>echo</IcItem>
			</IcRoot>
		</div>
	</section>
}

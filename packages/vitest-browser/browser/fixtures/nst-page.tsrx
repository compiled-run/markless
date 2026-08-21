import { Display, Root, Trigger } from './nst.tsrx';

// Three roots of one family, each nested in the previous one's projection. In
// document order the parts read: one, two, three.
export default function NstPage() @{
	<section data-nst-page>
		<Root label="one">
			<Trigger />
			<Display />
			<Root label="two">
				<Trigger />
				<Display />
				<Root label="three">
					<Trigger />
					<Display />
				</Root>
			</Root>
		</Root>
	</section>
}

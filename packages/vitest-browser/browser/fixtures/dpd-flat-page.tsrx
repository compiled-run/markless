import { Close, Layer, Open, Root, Surface } from './dpd-family.tsrx';

// Two widget instances on one page, each with its close control three
// projections under its own root.
export default function DpdFlatPage() @{
	<section data-dpd-page>
		<div data-dpd="a">
			<Root>
				<Open>Open A</Open>
				<Layer>
					<Surface>
						<Close>Close A</Close>
					</Surface>
				</Layer>
			</Root>
		</div>
		<div data-dpd="b">
			<Root>
				<Open>Open B</Open>
				<Layer>
					<Surface>
						<Close>Close B</Close>
					</Surface>
				</Layer>
			</Root>
		</div>
	</section>
}

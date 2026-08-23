import { Close, Layer, Open, Root, Surface } from './dpd-family.tsrx';

// The same family rooted inside its own surface: the inner widget's close sits
// six projections down. Rendering this shape is what poisons a later flat page.
export default function DpdNestedPage() @{
	<section data-dpd-page>
		<Root>
			<Open>Open outer</Open>
			<Layer>
				<Surface>
					<Root>
						<Open>Open inner</Open>
						<Layer>
							<Surface>
								<Close>Close inner</Close>
							</Surface>
						</Layer>
					</Root>
					<Close>Close outer</Close>
				</Surface>
			</Layer>
		</Root>
	</section>
}

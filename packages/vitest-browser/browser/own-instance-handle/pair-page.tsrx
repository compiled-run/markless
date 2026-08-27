import { PairContent, PairItem, PairRoot } from './pair.tsrx';

// Two levels: the root's own surface, and the surface the item written inside it
// holds. Both content parts bind and read the same compiled handle id.
export default function PairPage() @{
	<section data-pair-page>
		<PairRoot>
			<PairContent>
				<PairItem name="inner">
					<PairContent>inner</PairContent>
				</PairItem>
			</PairContent>
		</PairRoot>
	</section>
}

import { PairContent, PairItem, PairItemContent, PairRoot } from './pair.tsrx';

// Two levels: the root's own surface, and the surface the item written inside it
// holds. Each level's content binds the handle of its OWN family.
export default function PairPage() @{
	<section data-pair-page>
		<PairRoot>
			<PairContent>
				<PairItem name="inner">
					<PairItemContent>inner</PairItemContent>
				</PairItem>
			</PairContent>
		</PairRoot>
	</section>
}

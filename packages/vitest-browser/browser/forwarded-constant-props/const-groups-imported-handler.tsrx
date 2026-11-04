import { Bin } from './bin.tsrx';

const bins = [{ id: 'glass' }, { id: 'paper' }];

export default function ConstBins() @{
	<main>
		@for (const bin of bins; key bin.id) {
			<Bin kind={bin.id} />
		}
	</main>
}

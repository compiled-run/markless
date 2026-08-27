import { MeterBar, MeterLabel, MeterRoot } from './family/meter.tsrx';

// Three placements of one family: the label's children written as JSX text, the
// same text spelled as a prop, and children carrying markup.
export default function SeedMarkupChildrenPage() @{
	<section>
		<div data-case="markup">
			<MeterRoot>
				<MeterBar value={50} />
				<MeterLabel><em>50</em> of 100 rows</MeterLabel>
			</MeterRoot>
		</div>
	</section>
}

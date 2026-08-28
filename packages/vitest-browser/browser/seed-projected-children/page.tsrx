import { MeterBar, MeterLabel, MeterRoot } from './family/meter.tsrx';

// Four placements of one family: the label's children written as JSX text, the
// same text spelled as a prop, children carrying markup, and children whose text
// has to be decoded out of the compiled statics before a reader hears it.
export default function SeedProjectedChildrenPage() @{
	<section data-seed-projected-page>
		<div data-case="text">
			<MeterRoot>
				<MeterBar value={30} />
				<MeterLabel>30 of 100 rows</MeterLabel>
			</MeterRoot>
		</div>
		<div data-case="prop">
			<MeterRoot>
				<MeterBar value={40} />
				<MeterLabel children="40 of 100 rows" />
			</MeterRoot>
		</div>
		<div data-case="markup">
			<MeterRoot>
				<MeterBar value={50} />
				<MeterLabel><em>50</em> of 100 rows</MeterLabel>
			</MeterRoot>
		</div>
		<div data-case="entity">
			<MeterRoot>
				<MeterBar value={60} />
				<MeterLabel>Tom & Jerry rows</MeterLabel>
			</MeterRoot>
		</div>
	</section>
}

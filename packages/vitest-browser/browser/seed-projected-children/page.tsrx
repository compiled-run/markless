import { MeterBar, MeterLabel, MeterRoot } from './family/meter.tsrx';

// Two placements of one family: the label's children written as JSX text and the
// same text spelled as a prop. Children carrying markup live in markup-page.tsrx,
// which the compiler refuses.
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
	</section>
}

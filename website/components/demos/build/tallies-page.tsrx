import * as tally from './tally-page.tsrx';

export default function TalliesPage() @{
	<section>
		<tally.Tally label="Left"><tally.Badge /></tally.Tally>
		<tally.Tally label="Right"><tally.Badge /></tally.Tally>
	</section>
}

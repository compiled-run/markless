import * as tally from './tally-widget.tsrx';

export default function TalliesWidget() @{
	<section>
		<tally.Tally label="Left"><tally.Badge /></tally.Tally>
		<tally.Tally label="Right"><tally.Badge /></tally.Tally>
	</section>
}

import * as tally from './tally-subtree.tsrx';

export default function TalliesSubtree() @{
	<section>
		<tally.Tally label="Left"><tally.Badge /></tally.Tally>
		<tally.Tally label="Right"><tally.Badge /></tally.Tally>
		<style>
			section {
				position: relative;
				display: flex;
				flex-wrap: wrap;
				gap: 1.5em;
				justify-content: center;
				padding: 0.6em;
			}
		</style>
	</section>
}

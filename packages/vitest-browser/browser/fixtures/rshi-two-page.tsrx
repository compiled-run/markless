import { RshiRoot, RshiTrack, RshiTrigger } from './rshi-shared.tsrx';

// Two rendered widgets, the trigger authored AFTER the track inside each, and
// the two roots separated by the track's own subtree - the two-carousel shape.
export default function RshiTwoPage() @{
	<section data-rshi-page>
		<RshiRoot>
			<RshiTrack />
			<RshiTrigger />
		</RshiRoot>
		<RshiRoot>
			<RshiTrack />
			<RshiTrigger />
		</RshiRoot>
	</section>
}

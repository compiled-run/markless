import { RshiRoot, RshiTrack, RshiTrigger } from './rshi-shared.tsrx';

// One rendered widget: the case the module-level fallback used to answer, kept
// as a witness so the respelling cannot break it.
export default function RshiOnePage() @{
	<section data-rshi-page>
		<RshiRoot>
			<RshiTrack />
			<RshiTrigger />
		</RshiRoot>
	</section>
}

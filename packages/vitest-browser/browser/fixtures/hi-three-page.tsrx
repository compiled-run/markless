import { HiPanel, HiRoot, HiTrigger } from './hi-shared.tsrx';

// Hardcoding resistance for the same shape: three instances rather than two, the
// acting one in the MIDDLE so neither the first nor the last registration can
// answer by accident, the trigger authored BEFORE its panel so document order
// inside an instance is reversed, and one instance sitting a wrapper deeper so
// nesting depth is not what decides.
export default function HiThreePage() @{
	<section data-hi-page>
		<HiRoot>
			<HiTrigger />
			<HiPanel />
		</HiRoot>
		<div data-hi-wrap>
			<HiRoot>
				<HiTrigger />
				<HiPanel />
			</HiRoot>
		</div>
		<HiRoot>
			<HiTrigger />
			<HiPanel />
		</HiRoot>
	</section>
}

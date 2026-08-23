import { HiPanel, HiRoot, HiTrigger } from './hi-shared.tsrx';

// Two widget instances, each with its own panel and its own trigger. The first
// instance is the one a flat handle map loses: its registration is overwritten
// by the second, so its trigger reaches the second panel.
export default function HiTwoPage() @{
	<section data-hi-page>
		<HiRoot>
			<HiPanel />
			<HiTrigger />
		</HiRoot>
		<HiRoot>
			<HiPanel />
			<HiTrigger />
		</HiRoot>
	</section>
}

import { state } from '@markless/core';
import { CbsHits, CbsRoot, CbsTrigger } from './cbslot-widget.tsrx';

// One consumer callback, two routes into it: the part's handler and the root's
// own handler. The root's own handler is the one that used to reach nobody.
export default function CbslotPage() @{
	let seen = state('none');
	let calls = state(0);

	<section data-cbs-page>
		<CbsRoot
			onChange={(next: boolean) => {
				calls = calls + 1;
				seen = next === true ? 'on' : 'off';
			}}
		>
			<CbsTrigger />
			<CbsHits />
		</CbsRoot>
		<output data-cbs-seen>{seen}</output>
		<output data-cbs-calls>{calls}</output>
	</section>
}

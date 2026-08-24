import { element, state } from '@markless/core';
import { mark, reportMarker } from './mb-report.ts';
import {
	MbEventsRoot,
	MbMergeStopTrigger,
	MbMergeTrigger,
	MbOrder,
	MbReset,
	MbStopImmediate,
} from './mb-events.tsrx';

export default function MbEventsPage() @{
	const page = state({ trail: '', named: '' });
	// A consumer handle riding `{...rest}` onto a part element. It registers
	// ALONGSIDE whatever the part binds there, and reads back as that element.
	const consumerEl = element<HTMLButtonElement>();

	<section data-mb-events-page data-trail={page.trail} data-named={page.named}>
		<MbEventsRoot>
			<MbOrder />
			<MbStopImmediate />
			<MbMergeTrigger el={consumerEl} onClick={() => {
				page.trail = mark('consumer');
			}}>merge</MbMergeTrigger>
			<MbMergeStopTrigger onClick={() => {
				page.trail = mark('consumer-stop');
			}}>merge-stop</MbMergeStopTrigger>
			<MbReset />
		</MbEventsRoot>
		<button type="button" data-mb-name onClick={() => {
			page.named = reportMarker(consumerEl);
		}}>name</button>
	</section>
}

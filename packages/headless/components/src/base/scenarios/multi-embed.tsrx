import { state } from '@markless/core';
import { base } from '../../index.ts';

// One embed's worth of page, mounted twice as two islands. The parts take a closed
// prop list rather than spreading the rest onto their element, so the test ids and
// the reported state sit on wrappers. The wrapper reports whether the gesture
// reached it at all, which is the whole of what the locked button has to refuse: a
// natively disabled button dispatches no click, so nothing bubbles out of it.
export default function MultiEmbed() @{
	const mute = state({ reached: false });
	const locked = state({ reached: false });

	<section data-testid="frame">
		<span
			data-testid="mute"
			ui-pressed={mute.reached}
			onClick={() => {
				mute.reached = true;
			}}
		>
			<base.button pressed={false}>Mute</base.button>
		</span>
		<span
			data-testid="locked"
			ui-pressed={locked.reached}
			onClick={() => {
				locked.reached = true;
			}}
		>
			<base.button disabled pressed={false}>Locked</base.button>
		</span>
		<span data-testid="label"><base.label>Name</base.label></span>
		<span data-testid="rule"><base.separator /></span>
		<span data-testid="hidden"><base.visuallyhidden>Hidden</base.visuallyhidden></span>
	</section>
}

import { element } from '@markless/core';
import * as scrollarea from '../index.ts';

// The same naming written the way the rest of this package writes an IDREF: a
// handle instead of a hand-written id. It does not work across a component tag
// today - the suite pins the exact shortfall - and the scenario exists so the
// day it does, the row flips rather than being rediscovered.
export default function NamedByHandle() @{
	const headingEl = element<HTMLHeadingElement>();

	<section>
		<h2 el={headingEl} data-testid="heading">Terms of service</h2>
		<scrollarea.root data-testid="root" style="position: relative; width: 240px;">
			<scrollarea.viewport
				data-testid="viewport"
				aria-labelledby={headingEl}
				style="overflow: auto; height: 120px;"
			>
				<p>These terms apply to every account on the service.</p>
				<p>You keep ownership of anything you upload.</p>
				<p>We keep backups for thirty days after a deletion.</p>
			</scrollarea.viewport>
		</scrollarea.root>
	</section>
}

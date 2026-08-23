import * as scrollarea from '../index.ts';

// Naming the area by the heading that already sits above it, rather than
// repeating the words in an aria-label. The id is written by hand because the
// handle shape does not reach the element yet - `named-by-handle.tsrx` is that
// measurement, and note.md limit 2 is the gap.
export default function NamedByHeading() @{
	<section>
		<h2 id="terms-heading" data-testid="heading">Terms of service</h2>
		<scrollarea.root data-testid="root" style="position: relative; width: 240px;">
			<scrollarea.viewport
				data-testid="viewport"
				aria-labelledby="terms-heading"
				style="overflow: auto; height: 120px;"
			>
				<p>These terms apply to every account on the service.</p>
				<p>You keep ownership of anything you upload.</p>
				<p>We keep backups for thirty days after a deletion.</p>
				<p>Accounts inactive for two years are closed after a warning.</p>
				<p>Disputes are handled in the courts of the country you signed up in.</p>
				<p>We will tell you in advance before these terms change.</p>
			</scrollarea.viewport>
		</scrollarea.root>
	</section>
}

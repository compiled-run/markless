import * as scrollarea from '../index.ts';

// Two areas on one page with different names. The QDS reference dispatches its
// load-time overflow check at `document.querySelector(...)`, which is whichever
// area rendered first, so the second one never gets one; and both areas
// announce the same hard-coded "Scrollable content". Both roots below put the
// SAME timeline name in scope, and each thumb still resolves it inside its own
// root, so nothing crosses between them.
export default function TwoAreas() @{
	<div>
		<scrollarea.root
			data-testid="first-root"
			style="position: relative; width: 220px; timeline-scope: --sa-y;"
		>
			<scrollarea.viewport
				data-testid="first-viewport"
				aria-label="Open incidents"
				style="overflow: auto; height: 120px; scrollbar-width: none; scroll-timeline: --sa-y block;"
			>
				<p>Checkout returns a 500 for card payments in one region.</p>
				<p>The nightly export finished four hours late again.</p>
				<p>Search results are stale for accounts created today.</p>
				<p>Two workers are restarting in a loop on the batch queue.</p>
				<p>The status page did not update during the last incident.</p>
				<p>Invoice PDFs render without the tax line for one plan.</p>
			</scrollarea.viewport>
			<scrollarea.scrollbar
				data-testid="first-scrollbar"
				style="position: absolute; top: 0; right: 0; width: 8px; height: 100%; background: #eee;"
			>
				<scrollarea.thumb
					data-testid="first-thumb"
					style="position: absolute; top: 0; left: 0; width: 8px; height: 24px; background: #888; animation: sa-thumb-y linear both; animation-timeline: --sa-y;"
				/>
			</scrollarea.scrollbar>
		</scrollarea.root>
		<scrollarea.root
			data-testid="second-root"
			style="position: relative; width: 220px; timeline-scope: --sa-y;"
		>
			<scrollarea.viewport
				data-testid="second-viewport"
				aria-label="Resolved incidents"
				style="overflow: auto; height: 120px; scrollbar-width: none; scroll-timeline: --sa-y block;"
			>
				<p>The login redirect loop was a stale cookie domain.</p>
				<p>Duplicate webhooks came from a retry with no idempotency key.</p>
				<p>The slow dashboard was one missing index on the events table.</p>
				<p>Password resets bounced because the sender domain expired.</p>
				<p>Uploads over ten megabytes failed on one proxy only.</p>
				<p>The mobile app crashed on a locale with no plural rule.</p>
			</scrollarea.viewport>
			<scrollarea.scrollbar
				data-testid="second-scrollbar"
				style="position: absolute; top: 0; right: 0; width: 8px; height: 100%; background: #eee;"
			>
				<scrollarea.thumb
					data-testid="second-thumb"
					style="position: absolute; top: 0; left: 0; width: 8px; height: 24px; background: #888; animation: sa-thumb-y linear both; animation-timeline: --sa-y;"
				/>
			</scrollarea.scrollbar>
		</scrollarea.root>
	</div>
}

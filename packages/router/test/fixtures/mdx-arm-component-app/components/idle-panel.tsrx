import { state } from '@markless/core';
import Badge from './badge.tsrx';

// The arm opens with no event: when the page is idle, or when the section scrolls into view.
export default function IdlePanel() @{
	let idle = state(false);
	let seen = state(false);

	<section onIdle={() => (idle = true)}>
		@if (idle) {
			<div class="idle">
				<Badge />
			</div>
		}
		<div onVisible={() => (seen = true)}>
			@if (seen) {
				<div class="seen">
					<Badge />
				</div>
			}
		</div>
	</section>
}

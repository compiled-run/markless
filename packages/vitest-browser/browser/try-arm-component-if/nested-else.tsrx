import { computed, state } from '@markless/core';

async function loadTotal(): Promise<number> {
	await new Promise((done) => setTimeout(done, 10));
	return 7;
}

export default function NestedElse() @{
	const total = computed(async () => loadTotal());
	let view = state('summary');
	let detail = state(false);

	<section>
		<button data-expand onClick={() => (view = 'full')}>Expand</button>
		@try {
			<ul>
				@if (detail) {
					<li data-early>Early</li>
				}
				@if (view === 'summary') {
					<li data-summary>Summary</li>
				} @else {
					<li>
						<span data-total>{total}</span>
						<button data-detail onClick={() => (detail = !detail)}>Detail</button>
						@if (detail) {
							<b data-on>On</b>
						} @else {
							<i data-off>Off</i>
						}
					</li>
				}
			</ul>
		} @pending {
			<p>Loading</p>
		}
	</section>
}

import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// CSR mounts render an async boundary's @pending arm as part of the root
// template. The compile-time per-arm record arrays carry arm-relative indexes
// from a static walk, which composition makes untrustworthy — so the emitted
// @pending html must TAG in-arm hosts with data-markless-arm-host, letting
// the CSR compose step armize the live arm from rendered truth (the same
// earned-trust mechanism the tier-4 arm-render modules use).

async function compilePanel() {
	return await compileTsrxModule({
		filename: 'components/quota-panel.tsrx',
		source: `import { computed, state } from '@markless/core';

export function QuotaPanel() @{
	let picked = state('none');
	const quota = computed(async () => {
		return { label: 'ready' };
	});

	<section data-shell>
		<output data-picked>{picked}</output>
		@try {
			<strong data-value>{quota.label}</strong>
		} @pending {
			<div class="waiting">
				<p data-measuring>Measuring</p>
				<button type="button" data-poke onClick={() => picked = 'poked'}>Poke</button>
			</div>
		} @catch {
			<p class="failed">Failed</p>
		}
	</section>
}`,
		symbols: [],
	});
}

test('the CSR module tags @pending arm hosts so compose can armize the live arm', async () => {
	const result = await compilePanel();
	const csrModule = result.publicRenderModule.csrModuleSource;

	// Pending-arm hosts carry the arm-host tag in the emitted html…
	const pendingParagraph = csrModule.indexOf('class=\\"waiting\\"');
	expect(pendingParagraph).toBeGreaterThan(-1);
	const tagged = csrModule.match(/data-markless-arm-host=\\"([^\\]+)\\"/g) ?? [];
	expect(tagged.length).toBeGreaterThanOrEqual(2);

	// …and hosts OUTSIDE the boundary arms stay untagged (the section root and
	// the output resolve through the static host-path locators).
	const sectionOpen = csrModule.indexOf('<section');
	const sectionTag = csrModule.slice(sectionOpen, csrModule.indexOf('>', sectionOpen));
	expect(sectionTag).not.toContain('data-markless-arm-host');
});

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

test('the CSR module records @pending arm hosts in its native chunk', async () => {
	const result = await compilePanel();
	const csrModule = result.publicRenderModule.csrModuleSource;

	expect(csrModule).toContain('async:boundary:0:arm:pending');
	expect(csrModule).toContain('data-measuring');
	expect(csrModule).toContain('data-poke');
	expect(csrModule).not.toContain('data-markless-arm-host');
});

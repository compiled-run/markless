import type { ExpectApi, PageHandle } from '@async/witness';

const WAIT = { timeoutMs: 10_000 };

type ReachableCell = {
	readonly id: string;
	readonly suite: 'csr' | 'ssr';
	readonly posture: 'csr-legacy' | 'prerendered' | 'ssr-settled' | 'ssr-streamed';
	readonly timing: 'settle-before-interaction' | 'settle-after-interaction' | 'settled-at-boot';
	readonly latencyMs: 0 | 600 | 900;
	readonly reachable: true;
};

type UnreachableCell = {
	readonly id: string;
	readonly suite: 'csr' | 'ssr';
	readonly posture: 'csr-legacy' | 'prerendered' | 'ssr-settled';
	readonly timing: 'settle-before-interaction' | 'settle-after-interaction' | 'settled-at-boot';
	readonly reachable: false;
	readonly reason: string;
};

type CoveredCell = {
	readonly id: 'ssr-streamed:queued-commit-at-wake' | 'ssr-streamed:settle-after-interaction';
	readonly suite: 'ssr';
	readonly posture: 'ssr-streamed';
	readonly timing: 'queued-commit-at-wake' | 'settle-after-interaction';
	readonly reachable: true;
	readonly coveredBy:
		| 'ssr-streamed:settle-after-interaction'
		| 'ssr-streamed:settle-before-interaction + prerendered:settle-after-interaction';
	readonly reason: string;
};

export type ArmRecordCell = ReachableCell | UnreachableCell | CoveredCell;

// T012 posture x settle-timing census. False entries are intentionally data,
// not skipped tests, so adding a new way to reach one requires updating the
// shared contract consumed by both real demo suites.
export const armRecordCells = [
	{
		id: 'csr-legacy:settle-before-interaction',
		suite: 'csr',
		posture: 'csr-legacy',
		timing: 'settle-before-interaction',
		latencyMs: 600,
		reachable: true,
	},
	{
		id: 'csr-legacy:settle-after-interaction',
		suite: 'csr',
		posture: 'csr-legacy',
		timing: 'settle-after-interaction',
		latencyMs: 600,
		reachable: true,
	},
	{
		id: 'csr-legacy:settled-at-boot',
		suite: 'csr',
		posture: 'csr-legacy',
		timing: 'settled-at-boot',
		reachable: false,
		reason: 'Legacy CSR starts the async request in the browser and cannot serve a settled arm at boot.',
	},
	{
		id: 'prerendered:settle-before-interaction',
		suite: 'csr',
		posture: 'prerendered',
		timing: 'settle-before-interaction',
		latencyMs: 600,
		reachable: true,
	},
	{
		id: 'prerendered:settle-after-interaction',
		suite: 'csr',
		posture: 'prerendered',
		timing: 'settle-after-interaction',
		latencyMs: 600,
		reachable: true,
	},
	{
		id: 'prerendered:settled-at-boot',
		suite: 'csr',
		posture: 'prerendered',
		timing: 'settled-at-boot',
		reachable: false,
		reason: 'The static prerender has no request URL or live demo endpoint, so it emits the pending arm.',
	},
	{
		id: 'ssr-settled:settle-before-interaction',
		suite: 'ssr',
		posture: 'ssr-settled',
		timing: 'settle-before-interaction',
		reachable: false,
		reason: 'Latency zero settles during the SSR request, before the browser can interact.',
	},
	{
		id: 'ssr-settled:settle-after-interaction',
		suite: 'ssr',
		posture: 'ssr-settled',
		timing: 'settle-after-interaction',
		reachable: false,
		reason: 'Latency zero settles during the SSR request, before the browser can interact.',
	},
	{
		id: 'ssr-settled:settled-at-boot',
		suite: 'ssr',
		posture: 'ssr-settled',
		timing: 'settled-at-boot',
		latencyMs: 0,
		reachable: true,
	},
	{
		id: 'ssr-streamed:settle-before-interaction',
		suite: 'ssr',
		posture: 'ssr-streamed',
		timing: 'settle-before-interaction',
		latencyMs: 900,
		reachable: true,
	},
	{
		id: 'ssr-streamed:settle-after-interaction',
		suite: 'ssr',
		posture: 'ssr-streamed',
		timing: 'settle-after-interaction',
		reachable: true,
		coveredBy: 'ssr-streamed:settle-before-interaction + prerendered:settle-after-interaction',
		reason:
			'The witness browser visit awaits the page load event, which a streamed response fires only when the stream closes — no click can land inside the held-pending window (harness limitation, not framework behavior; durable fix = a waitUntil option on witness visit, flagged to the owner). The two halves are pinned separately: interact-during-pending + commitArm registration by prerendered:settle-after-interaction, and stream delivery + adoption + registration by ssr-streamed:settle-before-interaction.',
	},
	{
		id: 'ssr-streamed:queued-commit-at-wake',
		suite: 'ssr',
		posture: 'ssr-streamed',
		timing: 'queued-commit-at-wake',
		reachable: true,
		coveredBy: 'ssr-streamed:settle-before-interaction + prerendered:settle-after-interaction',
		reason:
			'The real live-feed stream has one boundary and no reveal dependency that can hold __mArm queued; forcing the parser/wake race would require sleeps, and the streamed settle-after cell is itself harness-covered (see its entry). Wake-before-commit and the commitArm registration path are pinned by the covering cells.',
	},
] as const satisfies readonly ArmRecordCell[];

export function reachableArmRecordCells(suite: 'csr' | 'ssr') {
	return armRecordCells.filter(
		(cell): cell is ReachableCell =>
			cell.suite === suite && cell.reachable && !('coveredBy' in cell),
	);
}

export async function assertArmRecordCell(
	page: PageHandle,
	expect: ExpectApi,
	cell: ReachableCell,
): Promise<void> {
	await expect.page.text(page, '[data-feed-title]', 'Local build updates', WAIT);
	await expect.page.attribute(page, '[data-weight]', 'data-weight', '2', WAIT);

	if (cell.timing === 'settle-after-interaction') {
		await expect.page.text(page, '[data-feed-pending]', 'Checking local updates…', WAIT);
		await page.click('[data-increase-weight]', WAIT);
		await expect.page.attribute(page, '[data-weight]', 'data-weight', '3', WAIT);
	}

	await expect.page.attribute(page, '[data-update-list]', 'data-row-count', '3', WAIT);
	await expect.page.text(page, '[data-weighted-count]', cell.timing === 'settle-after-interaction' ? 'Weighted count 9' : 'Weighted count 6', WAIT);
	await page.click('[data-row-key="beacon-118"]', WAIT);
	await expect.page.text(page, '[data-selected-key]', 'Selected beacon-118', WAIT);

	if (cell.timing !== 'settle-after-interaction') {
		await page.click('[data-increase-weight]', WAIT);
		await expect.page.attribute(page, '[data-weight]', 'data-weight', '3', WAIT);
	}
	await expect.page.text(page, '[data-weighted-count]', 'Weighted count 9', WAIT);
	await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
}

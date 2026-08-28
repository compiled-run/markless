// One storm: mount, hammer, then hold the widget to the four invariants. Nothing
// here reads the clock for a decision - every choice comes from the seed.

import { page } from 'vite-plus/test/browser';
import { type StormKind, nextAction, tick } from './actions.ts';
import type { ChaosFamily } from './families.ts';
import { ariaStateMismatches, lostFocusReports, watchForFailures } from './invariants.ts';
import { RUN_SEED, replayHint, rngFrom, stormSeedFor } from './seed.ts';

/** Three storms per family per run, forty gestures each: the lane stays in minutes. */
export const STORM_KINDS: readonly StormKind[] = ['pointer', 'keyboard', 'mixed'];
export const ACTIONS_PER_STORM = 40;

/** How long the widget is given to finish reacting before the invariants are read. */
const SETTLE_MS = 150;

function el(testid: string): HTMLElement {
	const found = page.getByTestId(testid).element();
	if (!found) throw new Error(`Expected [data-testid="${testid}"] to be on the page.`);
	return found as unknown as HTMLElement;
}

// A storm can leave a modal drawer open, and its trigger is then inert - so
// recovery would fail on the storm's leftovers rather than on a defect.
async function unwindOpenSurfaces(): Promise<void> {
	for (let unwind = 0; unwind < 4; unwind++) {
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await tick();
	}
	await tick(SETTLE_MS);
}

function report(
	family: ChaosFamily,
	kind: StormKind,
	stormSeed: number,
	log: readonly string[],
	problems: readonly string[],
): string {
	return [
		`${family.name}: the ${kind} storm broke an invariant.`,
		'',
		`  Replay:     ${replayHint()}`,
		`  Run seed:   ${RUN_SEED}`,
		`  Storm seed: ${stormSeed}`,
		'',
		'  Broken:',
		...problems.map((problem) => `    - ${problem}`),
		'',
		`  Gestures (${log.length}, in order):`,
		...log.map((line, index) => `    ${String(index + 1).padStart(2, '0')} ${line}`),
	].join('\n');
}

export async function runStorm(family: ChaosFamily, kind: StormKind): Promise<void> {
	const label = `${family.name}/${kind}`;
	const stormSeed = stormSeedFor(RUN_SEED, label);
	const rng = rngFrom(stormSeed);

	await family.mount();
	const root = el(family.rootTestId);

	// Opened after the mount so a mount's own output is not charged to the storm.
	const watch = watchForFailures();
	const log: string[] = [];
	const problems: string[] = [];

	try {
		if (kind === 'keyboard') el(family.keyboardEntryTestId).focus();

		for (let step = 0; step < ACTIONS_PER_STORM; step++) {
			const action = nextAction(rng, root, kind);
			log.push(action.note);
			await action.run();
			// Checked as the storm runs, not only at the end: a page that threw on
			// gesture 3 should not be blamed on gesture 40.
			if (watch.reports.length > 0) break;
		}

		await tick(SETTLE_MS);

		problems.push(...watch.reports);
		if (kind === 'keyboard') problems.push(...lostFocusReports());
		problems.push(...ariaStateMismatches(root));

		if (problems.length === 0) {
			await unwindOpenSurfaces();
			const beforeRecovery = watch.reports.length;
			try {
				await family.recover();
			} catch (failure) {
				problems.push(
					'the widget did not come back: ' +
						(failure instanceof Error ? failure.message : String(failure)),
				);
			}
			problems.push(...watch.reports.slice(beforeRecovery));
		}
	} finally {
		watch.stop();
	}

	if (problems.length > 0) throw new Error(report(family, kind, stormSeed, log, problems));
}

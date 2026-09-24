import { runVisit } from './measure.mjs';
import { selectProfiles } from './profiles.mjs';

/** Runs each case once per listed phase per target in an already-launched Chromium, normal profile. No timing output. */
export async function runCorrectness({ browser, targets, cases, phases, runId, opts, playwrightVersion, log = console.error }) {
	const [profile] = selectProfiles(['normal']);
	const outcomes = [];
	let order = 0;
	for (const target of targets)
		for (const caseDef of cases)
			for (const phase of caseDef.phases.filter((p) => phases.includes(p))) {
				if (!target.ready) {
					outcomes.push({ target: target.name, caseId: caseDef.id, phase, pass: false, failure: { kind: 'navigation-error', message: `target not ready: ${target.setupError}` } });
					continue;
				}
				const { result, raw } = await runVisit({ browser, browserName: 'chromium', playwrightVersion, target, caseDef, phase, profile, visitIndex: 0, order: order++, runId, opts });
				const outcome = {
					target: target.name,
					caseId: caseDef.id,
					phase,
					pass: result.failure === null,
					failure: result.failure,
					allFailures: raw.failures.map(({ kind, message, observed }) => ({ kind, message, observed })),
					documentRequestsDuringAction: result.requests.perActionDocument,
					consoleErrors: raw.consoleErrors,
					pageErrors: raw.pageErrors,
				};
				outcomes.push(outcome);
				log(`${outcome.pass ? 'PASS' : 'FAIL'} ${target.name} ${caseDef.id} [${phase}]${outcome.pass ? '' : ` ${result.failure.kind}: ${result.failure.message.slice(0, 160)}`}`);
			}
	return outcomes;
}

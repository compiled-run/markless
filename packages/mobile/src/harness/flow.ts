import { isDeepStrictEqual } from 'node:util';
import { parseAllDocuments, stringify } from 'yaml';
import { flowSteps, type LadderRung } from '../../proofs/ladder.ts';
import { PROOF_APP_ID, PROOF_APP_ID_VARIABLE } from './proof-app.ts';

export type ProofFlowStep = {
	/** `launch`, or the step's `do` action (`tap`, `type`, `relaunch`, `wait`). */
	readonly action: string;
	readonly before: string;
	readonly after: string;
};

export type InstrumentedFlow = {
	readonly yaml: string;
	readonly steps: ReadonlyArray<ProofFlowStep>;
	/** For each top-level command of `yaml` in order: the step it belongs to and whether it is the rung's own or a screenshot. */
	readonly commands: ReadonlyArray<{
		readonly step: number;
		readonly role: 'flow' | 'screenshot';
	}>;
};

const pad = (index: number) => String(index).padStart(2, '0');

/**
 * Checks that a rung's flow.yaml is the flow its expected.json renders to (so the flow checks every expected text), then
 * rewrites it for one platform run with a screenshot before and after each step.
 */
export function instrumentFlow(
	flowText: string,
	rung: LadderRung,
	source: string,
): InstrumentedFlow {
	const documents = parseAllDocuments(flowText);
	if (!Array.isArray(documents) || documents.length !== 2) {
		throw new Error(`${source}: a flow is two YAML documents (config, then commands)`);
	}
	for (const document of documents) {
		if (document.errors.length > 0)
			throw new Error(`${source}: ${document.errors[0]!.message}`);
	}
	const config = documents[0]!.toJS() as Record<string, unknown> | null;
	const appId = config?.appId;
	if (appId !== `\${${PROOF_APP_ID_VARIABLE}}` && appId !== PROOF_APP_ID) {
		throw new Error(
			`${source}: appId must be \${${PROOF_APP_ID_VARIABLE}} or ${PROOF_APP_ID}, found ${JSON.stringify(appId)}`,
		);
	}
	const steps = flowSteps(rung);
	if (!isDeepStrictEqual(documents[1]!.toJS(), steps.flat())) {
		throw new Error(
			`${source}: the flow is not what expected.json renders to; run node packages/mobile/proofs/write-flows.ts`,
		);
	}

	const out: unknown[] = [];
	const roles: InstrumentedFlow['commands'][number][] = [];
	const push = (step: number, role: 'flow' | 'screenshot', command: unknown) => {
		out.push(command);
		roles.push({ step, role });
	};
	const named = steps.map((commands, index): ProofFlowStep => {
		const action = index === 0 ? 'launch' : Object.keys(rung.steps[index]!.do!)[0]!;
		const before = `${pad(index)}-${action}-before`;
		const after = `${pad(index)}-${action}-after`;
		push(index, 'screenshot', { takeScreenshot: before });
		for (const command of commands) push(index, 'flow', command);
		push(index, 'screenshot', { takeScreenshot: after });
		return { action, before, after };
	});
	return { yaml: `${stringify(config)}---\n${stringify(out)}`, steps: named, commands: roles };
}

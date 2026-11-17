import { parseAllDocuments, stringify } from 'yaml';
import type { ProofExpected, ProofExpectedStep } from './expected.ts';
import { PROOF_APP_ID, PROOF_APP_ID_VARIABLE } from './proof-app.ts';

/** Maestro commands that only look at the screen; every other top-level command is an action that starts a step. */
const LOOKING_COMMANDS = new Set([
	'assertVisible',
	'assertNotVisible',
	'assertTrue',
	'extendedWaitUntil',
	'waitForAnimationToEnd',
	'takeScreenshot',
]);

type FlowCommand = string | Record<string, unknown>;

export type ProofFlowStep = {
	/** The action's command name (`launchApp`, `tapOn`...). */
	readonly action: string;
	readonly before: string;
	readonly after: string;
};

export type InstrumentedFlow = {
	readonly yaml: string;
	readonly steps: ReadonlyArray<ProofFlowStep>;
	/** For each top-level command of `yaml` in order: the step it belongs to and what it is there for. */
	readonly commands: ReadonlyArray<{
		readonly step: number;
		readonly role: 'flow' | 'expected' | 'screenshot';
	}>;
};

const commandName = (command: FlowCommand): string => {
	if (typeof command === 'string') return command;
	const keys = Object.keys(command);
	if (keys.length !== 1)
		throw new Error(`a flow command has ${keys.length} keys: ${JSON.stringify(command)}`);
	return keys[0]!;
};

/** Maestro reads a text selector as a regular expression over the whole label; this matches `text` literally. */
export const literalSelector = (text: string): string =>
	Array.from(text, (char) => ('\\^$.|?*+()[]{}'.includes(char) ? `\\${char}` : char)).join('');

const expectedChecks = (step: ProofExpectedStep): FlowCommand[] => [
	...step.visible.map((text) => ({ assertVisible: { text: literalSelector(text) } })),
	...(step.absent ?? []).map((text) => ({ assertNotVisible: { text: literalSelector(text) } })),
	...(step.disabled ?? []).map((text) => ({
		assertVisible: { text: literalSelector(text), enabled: false },
	})),
];

const pad = (index: number) => String(index).padStart(2, '0');

/**
 * Rewrites a rung's flow for one platform run: a screenshot before and after each step, and after the flow's own checks
 * for a step, the rung's expected texts for it. A step is one action command plus the checks that follow it.
 */
export function instrumentFlow(
	flowText: string,
	expected: ProofExpected,
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
	const commands = documents[1]!.toJS() as FlowCommand[] | null;
	const appId = config?.appId;
	if (appId !== `\${${PROOF_APP_ID_VARIABLE}}` && appId !== PROOF_APP_ID) {
		throw new Error(
			`${source}: appId must be \${${PROOF_APP_ID_VARIABLE}} or ${PROOF_APP_ID}, found ${JSON.stringify(appId)}`,
		);
	}
	if (!Array.isArray(commands) || commands.length === 0)
		throw new Error(`${source}: the flow has no commands`);

	const grouped: FlowCommand[][] = [];
	for (const command of commands) {
		const looking = LOOKING_COMMANDS.has(commandName(command));
		if (!looking) grouped.push([command]);
		else if (grouped.length === 0)
			throw new Error(`${source}: the flow checks the screen before its first action`);
		else grouped.at(-1)!.push(command);
	}
	if (grouped.length !== expected.steps.length) {
		throw new Error(
			`${source}: the flow has ${grouped.length} actions but expected.json has ${expected.steps.length} steps; they must match one to one`,
		);
	}

	const out: FlowCommand[] = [];
	const roles: InstrumentedFlow['commands'][number][] = [];
	const push = (step: number, role: 'flow' | 'expected' | 'screenshot', command: FlowCommand) => {
		out.push(command);
		roles.push({ step, role });
	};
	const steps = grouped.map((group, index): ProofFlowStep => {
		const action = commandName(group[0]!);
		const before = `${pad(index)}-${action}-before`;
		const after = `${pad(index)}-${action}-after`;
		push(index, 'screenshot', { takeScreenshot: before });
		for (const command of group) push(index, 'flow', command);
		for (const command of expectedChecks(expected.steps[index]!))
			push(index, 'expected', command);
		push(index, 'screenshot', { takeScreenshot: after });
		return { action, before, after };
	});
	return { yaml: `${stringify(config)}---\n${stringify(out)}`, steps, commands: roles };
}

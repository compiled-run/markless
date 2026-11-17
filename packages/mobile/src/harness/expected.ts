import type { LadderRung } from '../../proofs/ladder.ts';

const isStringList = (value: unknown): value is ReadonlyArray<string> =>
	Array.isArray(value) && value.every((item) => typeof item === 'string');

/** Reads a rung's expected.json, refusing a shape the harness cannot check rather than checking less. */
export function readProofExpected(json: unknown, source: string): LadderRung {
	const fail = (message: string): never => {
		throw new Error(`${source}: ${message}`);
	};
	if (
		typeof json !== 'object' ||
		json === null ||
		!('steps' in json) ||
		!Array.isArray(json.steps)
	) {
		return fail('expected an object with a "steps" list');
	}
	if (json.steps.length === 0) fail('"steps" is empty');
	(json.steps as unknown[]).forEach((step, index) => {
		if (typeof step !== 'object' || step === null)
			return fail(`step ${index} is not an object`);
		const fields = step as Record<string, unknown>;
		if (!isStringList(fields.visible)) fail(`step ${index} has no "visible" text list`);
		for (const key of ['absent', 'disabled', 'order', 'calls'] as const) {
			if (fields[key] !== undefined && !isStringList(fields[key]))
				fail(`step ${index} "${key}" is not a text list`);
		}
		if (fields.prompt !== undefined && fields.prompt !== 'location')
			fail(`step ${index} "prompt" names no known permission`);
		if (index === 0 && fields.do !== undefined) fail('step 0 is the launch and takes no "do"');
		if (index > 0 && (typeof fields.do !== 'object' || fields.do === null))
			fail(`step ${index} has no "do" action`);
	});
	return json as LadderRung;
}

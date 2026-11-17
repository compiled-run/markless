/** What one rung's screen shows after each step; the first step is the launch, every later one follows one action. */
export type ProofExpectedStep = {
	readonly do?: unknown;
	readonly visible: ReadonlyArray<string>;
	readonly absent?: ReadonlyArray<string>;
	readonly disabled?: ReadonlyArray<string>;
};

export type ProofExpected = { readonly steps: ReadonlyArray<ProofExpectedStep> };

const isStringList = (value: unknown): value is ReadonlyArray<string> =>
	Array.isArray(value) && value.every((item) => typeof item === 'string');

/** Reads a rung's expected.json, refusing a shape the harness cannot check rather than checking less. */
export function readProofExpected(json: unknown, source: string): ProofExpected {
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
	const steps = (json.steps as unknown[]).map((step, index): ProofExpectedStep => {
		if (typeof step !== 'object' || step === null)
			return fail(`step ${index} is not an object`);
		const fields = step as Record<string, unknown>;
		if (!isStringList(fields.visible)) return fail(`step ${index} has no "visible" text list`);
		for (const key of ['absent', 'disabled'] as const) {
			if (fields[key] !== undefined && !isStringList(fields[key]))
				fail(`step ${index} "${key}" is not a text list`);
		}
		if (index === 0 && fields.do !== undefined) fail('step 0 is the launch and takes no "do"');
		if (index > 0 && fields.do === undefined) fail(`step ${index} has no "do" action`);
		return fields as ProofExpectedStep;
	});
	return { steps };
}

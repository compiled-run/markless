import {
	PERMISSION_PROMPTS,
	SYSTEM_SCREENS,
	type LadderRung,
	type LadderText,
} from '../../proofs/ladder.ts';

const isStringList = (value: unknown): value is ReadonlyArray<string> =>
	Array.isArray(value) && value.every((item) => typeof item === 'string');

const isText = (value: unknown): value is LadderText =>
	typeof value === 'string' ||
	(typeof value === 'object' &&
		value !== null &&
		Object.keys(value).length === 1 &&
		'startsWith' in value &&
		typeof value.startsWith === 'string' &&
		value.startsWith !== '');

const isTextList = (value: unknown): value is ReadonlyArray<LadderText> =>
	Array.isArray(value) && value.every(isText);

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
		if (!isTextList(fields.visible)) fail(`step ${index} has no "visible" text list`);
		if (fields.absent !== undefined && !isTextList(fields.absent))
			fail(`step ${index} "absent" is not a text list`);
		for (const key of ['disabled', 'order', 'calls'] as const) {
			if (fields[key] !== undefined && !isStringList(fields[key]))
				fail(`step ${index} "${key}" is not a text list`);
		}
		if (
			fields.prompt !== undefined &&
			!Object.hasOwn(PERMISSION_PROMPTS, String(fields.prompt))
		)
			fail(`step ${index} "prompt" names no known permission`);
		if (fields.system !== undefined && !Object.hasOwn(SYSTEM_SCREENS, String(fields.system)))
			fail(`step ${index} "system" names no known system screen`);
		if (index === 0 && fields.do !== undefined) fail('step 0 is the launch and takes no "do"');
		if (index > 0 && (typeof fields.do !== 'object' || fields.do === null))
			fail(`step ${index} has no "do" action`);
		const action = fields.do as Record<string, unknown> | undefined;
		for (const key of ['tap', 'doubleTap'] as const) {
			if (action?.[key] !== undefined && !isText(action[key]))
				fail(`step ${index} "${key}" is neither a text nor { "startsWith": <text> }`);
		}
	});
	const held = (json as { held?: unknown }).held;
	if (
		held !== undefined &&
		!(
			Array.isArray(held) &&
			held.every(
				(h) =>
					typeof h === 'object' &&
					h !== null &&
					Object.keys(h).sort().join() === 'node,text' &&
					typeof (h as { node: unknown }).node === 'string' &&
					typeof (h as { text: unknown }).text === 'string',
			)
		)
	)
		fail('"held" is not a list of { "text": <text>, "node": <id> }');
	return json as LadderRung;
}

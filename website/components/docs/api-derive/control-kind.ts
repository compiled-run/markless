// A playground control is inferred from the prop's type text and nothing else,
// so adding a family adds no control table to hand-maintain. Text analysis only:
// this module never reads the manifest, which is what lets it be exercised on a
// type string on its own.

/** What a playground draws for a prop. `none` means its type is not expressible as a control. */
export type ControlKind = 'toggle' | 'select' | 'stepper' | 'textbox' | 'event' | 'none';

/** Everything a playground needs to draw one prop, derived from its type. */
export type ControlDescriptor = {
	readonly kind: ControlKind;
	/** The type text with its wrapping collapsed to one line. */
	readonly type: string;
	/** The union arms of `type`, split at the top level. One entry when it is not a union. */
	readonly members: readonly string[];
	/** `select` only: the literal values, unquoted and in declaration order. */
	readonly options?: readonly string[];
	/** `event` only: the callback signature, for the event log's label. */
	readonly signature?: string;
};

const QUOTED = /^'([^']*)'$/;

/** Collapses the manifest's wrapped type text and drops a leading union bar. */
export function normalizeType(type: string): string {
	return type
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^\|\s*/, '');
}

/** Splits a union at bar characters that are not inside brackets, parens or quotes. */
export function splitUnion(type: string): readonly string[] {
	const members: string[] = [];
	let depth = 0;
	let quote = '';
	let start = 0;
	for (let at = 0; at < type.length; at += 1) {
		const char = type[at] ?? '';
		if (quote !== '') {
			if (char === quote) quote = '';
			continue;
		}
		if (char === "'" || char === '"' || char === '`') {
			quote = char;
			continue;
		}
		if (char === '(' || char === '[' || char === '{' || char === '<') depth += 1;
		else if (char === ')' || char === ']' || char === '}' || char === '>') depth -= 1;
		else if (char === '|' && depth === 0) {
			members.push(type.slice(start, at).trim());
			start = at + 1;
		}
	}
	members.push(type.slice(start).trim());
	return members.filter((member) => member !== '');
}

/** True when the type is a function type: an arrow outside every bracket and quote. */
export function isCallback(type: string): boolean {
	let depth = 0;
	let quote = '';
	for (let at = 0; at < type.length - 1; at += 1) {
		const char = type[at] ?? '';
		if (quote !== '') {
			if (char === quote) quote = '';
			continue;
		}
		if (char === "'" || char === '"' || char === '`') {
			quote = char;
			continue;
		}
		if (char === '(' || char === '[' || char === '{' || char === '<') depth += 1;
		else if (char === ')' || char === ']' || char === '}' || char === '>') depth -= 1;
		else if (char === '=' && type[at + 1] === '>' && depth === 0) return true;
	}
	return false;
}

function literalOf(member: string): string | undefined {
	const matched = QUOTED.exec(member);
	return matched ? matched[1] : undefined;
}

/**
 * The control a type text asks for, in the order the rules are tried:
 * a function is an event log, a union of string literals is a select, plain
 * `boolean` is a toggle, plain `number` is a stepper, anything that can hold a
 * string is a textbox, anything that can hold a number is a stepper, and a
 * union mixing `boolean` with literals is a select over all its values.
 */
export function controlFor(type: string): ControlDescriptor {
	const normalized = normalizeType(type);
	if (isCallback(normalized))
		return { kind: 'event', type: normalized, members: [normalized], signature: normalized };

	const members = splitUnion(normalized);
	const literals = members.map(literalOf);

	if (literals.every((literal) => literal !== undefined))
		return {
			kind: 'select',
			type: normalized,
			members,
			options: literals.filter((literal): literal is string => literal !== undefined),
		};
	if (normalized === 'boolean') return { kind: 'toggle', type: normalized, members };
	if (normalized === 'number') return { kind: 'stepper', type: normalized, members };
	if (members.includes('string')) return { kind: 'textbox', type: normalized, members };
	if (members.includes('number')) return { kind: 'stepper', type: normalized, members };
	if (members.every((member, at) => member === 'boolean' || literals[at] !== undefined))
		return {
			kind: 'select',
			type: normalized,
			members,
			options: members.flatMap((member, at) =>
				member === 'boolean' ? ['true', 'false'] : [literals[at] ?? member],
			),
		};
	return { kind: 'none', type: normalized, members };
}

/**
 * The manifest's `default` written as source text, read back as the value a
 * control starts on. Anything that is not a scalar literal comes back undefined
 * and the control starts from the family's own behaviour instead.
 */
export function initialValue(
	defaultText: string | undefined,
): string | number | boolean | undefined {
	if (defaultText === undefined) return undefined;
	const text = defaultText.trim();
	if (text === 'true') return true;
	if (text === 'false') return false;
	const literal = literalOf(text);
	if (literal !== undefined) return literal;
	if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
	return undefined;
}

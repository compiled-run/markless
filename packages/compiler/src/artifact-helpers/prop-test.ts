import type { SemanticBranchSite, SemanticPropTest } from '../artifacts.ts';

export type KnownPropValue =
	| { readonly known: true; readonly value: unknown }
	| { readonly known: false };

const UNKNOWN: KnownPropValue = { known: false };

/** The value of a prop test for one caller, given what that caller is known to pass at each prop path. */
export function evaluatePropTest(
	test: SemanticPropTest,
	prop: (path: ReadonlyArray<string>) => KnownPropValue,
): KnownPropValue {
	switch (test.kind) {
		case 'value':
			return { known: true, value: test.value };
		case 'prop':
			return prop(test.path);
		case 'not': {
			const operand = evaluatePropTest(test.operand, prop);
			return operand.known ? { known: true, value: !operand.value } : UNKNOWN;
		}
		case 'compare': {
			const left = evaluatePropTest(test.left, prop);
			const right = left.known ? evaluatePropTest(test.right, prop) : UNKNOWN;
			if (!left.known || !right.known) return UNKNOWN;
			// The build rebuilds each object a caller passes, so identity between two of them is unknown.
			if (isReference(left.value) || isReference(right.value)) return UNKNOWN;
			const equal =
				test.operator === '===' || test.operator === '!=='
					? left.value === right.value
					: left.value == right.value;
			return { known: true, value: test.operator.startsWith('!') ? !equal : equal };
		}
		case 'logical': {
			const left = evaluatePropTest(test.left, prop);
			if (!left.known) return UNKNOWN;
			const short =
				test.operator === '&&'
					? !left.value
					: test.operator === '||'
						? !!left.value
						: left.value !== null && left.value !== undefined;
			return short ? left : evaluatePropTest(test.right, prop);
		}
	}
}

function isReference(value: unknown): boolean {
	return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

/** The arm one caller's props render: an index, null for none, undefined when the props do not decide it. */
export function propDecidedArm(
	site: Pick<SemanticBranchSite, 'kind' | 'armCount' | 'propTest' | 'armTests'>,
	prop: (path: ReadonlyArray<string>) => KnownPropValue,
): number | null | undefined {
	if (!site.propTest) return undefined;
	const tested = evaluatePropTest(site.propTest, prop);
	if (!tested.known) return undefined;
	if (site.kind === 'if') return tested.value ? 0 : site.armCount > 1 ? 1 : null;
	if (!site.armTests) return undefined;
	const matched = site.armTests.findIndex((test) => test !== null && test === tested.value);
	if (matched >= 0) return matched;
	const fallback = site.armTests.indexOf(null);
	return fallback >= 0 ? fallback : null;
}

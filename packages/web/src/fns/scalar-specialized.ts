import type { NonFiniteNumberName } from '@markless/serializer';

// The specialized scalar reader decodes ONE cell straight out of the served
// state script, so it names only the payload fields it inspects.
type MarklessScalarRoot =
	| { readonly $type: 'undefined' }
	| { readonly $type: 'bigint'; readonly value: string }
	| { readonly $type: 'number'; readonly value: NonFiniteNumberName }
	| { readonly $type: 'date'; readonly value: string }
	| { readonly $type?: undefined };
type MarklessScalarCell = {
	readonly graphNodeId?: string;
	readonly valueKind?: string;
	readonly value?: {
		readonly version?: number;
		readonly records?: ReadonlyArray<unknown>;
		readonly root?: MarklessScalarRoot | string | number | boolean | null;
	};
};

const e = (c: string, s: string): never => {
	throw Object.assign(
		Error(c),
		{ code: c, site: s },
		c === 'MARKLESS_PAYLOAD_INVALID'
			? { docsUrl: 'https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID' }
			: {},
	);
};
export const marklessReadScalarCell = (r: ParentNode, graphNodeId: string) => {
	const script = r.querySelector('script[type="markless/state"]');
	if (!script) return;
	try {
		return (
			JSON.parse(script.textContent || 'null') as {
				readonly cells?: ReadonlyArray<MarklessScalarCell | null>;
			} | null
		)?.cells?.find((cell) => cell?.graphNodeId === graphNodeId);
	} catch {}
};
export const marklessDecodeScalarCell = (
	c: MarklessScalarCell | null | undefined,
	g: string,
	s: string,
) => {
	try {
		const v = c?.value,
			r = v?.root;
		if (
			!c ||
			c.graphNodeId !== g ||
			c.valueKind !== 'scalar' ||
			v?.version !== 1 ||
			v.records?.length !== 0
		)
			e('MARKLESS_PAYLOAD_INVALID', s);
		if (r == null || typeof r !== 'object') return r;
		if (r.$type === 'undefined') return undefined;
		if (r.$type === 'bigint') return BigInt(r.value);
		if (r.$type === 'number') return Number(r.value);
		if (r.$type === 'date') {
			const d = new Date(r.value);
			if (!Number.isNaN(d.getTime())) return d;
		}
	} catch {}
	e('MARKLESS_PAYLOAD_INVALID', s);
};
export { e as marklessScalarSpecializedError };

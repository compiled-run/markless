import {
	renderSsrData,
	type RenderSsrDataOutput,
	type SsrDataReadContext,
	type SsrDataResidue,
	type SsrDataSlot,
	type SsrRenderData,
} from '../ssr-data/renderer.ts';
import { renderSsrOutput, type SsrRenderable, type SsrRenderOutput } from '../render-to-string.ts';

type Awaitable<T> = T | Promise<T>;
type GraphValues = ReadonlyMap<string, unknown>;

export type PrerenderRead = (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;

export type PrerenderEvaluationContext = {
	readonly values: GraphValues;
	readonly read: PrerenderRead;
};

type PrerenderRenderData = SsrRenderData & {
	readonly initialValues?: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly value:
			| { readonly kind: 'constant'; readonly value: unknown }
			| { readonly kind: string; readonly [key: string]: unknown };
	}>;
};

export type PrerenderPageClosure = {
	readonly renderData: PrerenderRenderData;
	readonly props?: unknown;
	readonly idPrefix?: string;
	readonly computed?: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly evaluate: (context: PrerenderEvaluationContext) => Awaitable<unknown>;
	}>;
	readonly readAuthored?: (
		residue: Extract<SsrDataResidue, { readonly kind: 'authored-expression' }>,
		context: SsrDataReadContext,
		evaluation: PrerenderEvaluationContext,
	) => Awaitable<unknown>;
	readonly selectBranchArm?: (
		slot: Extract<SsrDataSlot, { readonly kind: 'branch' }>,
		context: SsrDataReadContext,
		evaluation: PrerenderEvaluationContext,
	) => Awaitable<number>;
	readonly selectAsyncArm?: (
		slot: Extract<SsrDataSlot, { readonly kind: 'async' }>,
		context: SsrDataReadContext,
		evaluation: PrerenderEvaluationContext,
	) => Awaitable<number | { readonly arm: number; readonly error?: unknown }>;
	readonly children?: Readonly<
		Record<
			string,
			{
				readonly closure: PrerenderPageClosure;
				readonly idPrefix?: string;
				readonly props?: (
					evaluation: PrerenderEvaluationContext,
					context: SsrDataReadContext,
				) => Awaitable<unknown>;
			}
		>
	>;
};

// Evaluates only the already-linked render closure. Authored expressions arrive
// as compiler-created callbacks; this layer never reads or parses source files.
export async function evaluatePrerenderClosure(
	closure: PrerenderPageClosure,
): Promise<RenderSsrDataOutput> {
	const values = new Map<string, unknown>();
	for (const initial of closure.renderData.initialValues ?? []) {
		if (initial.value.kind === 'constant') {
			values.set(initial.graphNodeId, structuredClone(initial.value.value));
		}
	}
	values.set('prop:props', structuredClone(closure.props ?? {}));
	const read: PrerenderRead = (graphNodeId, path = []) => readPath(values.get(graphNodeId), path);
	const evaluation = { values, read };
	for (const computed of closure.computed ?? []) {
		values.set(computed.graphNodeId, await computed.evaluate(evaluation));
	}

	return renderSsrData({
		renderData: closure.renderData,
		idPrefix: closure.idPrefix,
		read: (residue, context) => {
			if (residue.kind === 'repeat-item') return readPath(context.repeatItem, residue.path);
			if (residue.kind === 'graph-read') return read(residue.graphNodeId, residue.path);
			if (closure.readAuthored) return closure.readAuthored(residue, context, evaluation);
			throw new Error(`MARKLESS_PRERENDER_RESIDUE_MISSING: ${residue.source}`);
		},
		selectBranchArm: closure.selectBranchArm
			? (slot, context) => closure.selectBranchArm!(slot, context, evaluation)
			: undefined,
		selectAsyncArm: closure.selectAsyncArm
			? (slot, context) => closure.selectAsyncArm!(slot, context, evaluation)
			: undefined,
		renderChild: async (slot, context) => {
			const child = closure.children?.[slot.componentEdgeId];
			if (!child)
				throw new Error(`MARKLESS_PRERENDER_CHILD_MISSING: ${slot.componentEdgeId}`);
			const childIndex = Object.keys(closure.children ?? {}).indexOf(slot.componentEdgeId);
			return evaluatePrerenderClosure({
				...child.closure,
				props: child.props ? await child.props(evaluation, context) : child.closure.props,
				idPrefix: `${closure.idPrefix ?? ''}${child.idPrefix ?? `c${childIndex}:`}`,
			});
		},
	});
}

// Production bundles already contain the compiler-linked server closure. This
// entry evaluates that closure directly; it does not import authored modules
// outside the closure and it never recompiles source.
export function evaluateBuiltPageClosure(
	page: SsrRenderable,
	props?: unknown,
): Promise<SsrRenderOutput> {
	return renderSsrOutput(page, props, undefined);
}

function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let current = value;
	for (const segment of path) {
		if (current === null || current === undefined) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

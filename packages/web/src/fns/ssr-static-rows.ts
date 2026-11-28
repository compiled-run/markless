// Server render only: which props a placed child receives fixed, and what its static-row lists then leave out.
import { marklessSsrChildInstancePath } from './ssr.ts';

type SsrRenderContext = NonNullable<Parameters<typeof marklessSsrChildInstancePath>[0]>;

type StaticRowsContext = SsrRenderContext & {
	readonly instancePath?: string;
	// The props this instance's caller passed as values that never change, stamped with the instance it names.
	readonly staticProps?: { readonly at: string; readonly names: ReadonlyArray<string> };
};

type SeedCell = {
	readonly graphNodeId: string;
	readonly keys: ReadonlyArray<string> | null;
	readonly rowKeys?: ReadonlyArray<string>;
	readonly staticRowKeys?: ReadonlyArray<string>;
};

// A context spread from an ancestor names that ancestor, and a forced-arm probe renders placeholders, so neither fixes a prop.
function fixedProps(renderContext: StaticRowsContext | undefined): ReadonlyArray<string> {
	const stamped = renderContext?.staticProps;
	return stamped && !renderContext.prerenderSettle && stamped.at === (renderContext.instancePath ?? '')
		? stamped.names
		: [];
}

/** The props a placed child receives fixed: values that never change, and this instance's own fixed props passed on. */
export function marklessSsrStaticProps(
	renderContext: StaticRowsContext | undefined,
	placed: { readonly symbolPrefix?: string },
	edge: {
		readonly fixed?: ReadonlyArray<string>;
		readonly from?: ReadonlyArray<readonly [string, string]>;
	},
): NonNullable<StaticRowsContext['staticProps']> {
	const own = fixedProps(renderContext);
	return {
		at: marklessSsrChildInstancePath(renderContext, placed),
		names: renderContext?.prerenderSettle
			? []
			: [
					...(edge.fixed ?? []),
					...(edge.from ?? []).flatMap(([name, from]) => (own.includes(from) ? [name] : [])),
				],
	};
}

/** Drops the records of this render's static-row lists whose prop its caller fixed: their rows stay as served. */
export function marklessSsrStaticRows<
	T extends { readonly view: { readonly keyedRepeats?: ReadonlyArray<{ readonly id: string }> } },
>(composition: T, repeats: ReadonlyArray<readonly [string, string]>, renderContext: StaticRowsContext | undefined): T {
	const fixed = fixedProps(renderContext);
	const dropped = new Set(repeats.flatMap(([repeatId, prop]) => (fixed.includes(prop) ? [repeatId] : [])));
	if (dropped.size === 0 || !composition.view.keyedRepeats) return composition;
	return {
		...composition,
		view: {
			...composition.view,
			keyedRepeats: composition.view.keyedRepeats.filter((repeat) => !dropped.has(repeat.id)),
		},
	};
}

/** A seed's static-row keys as row keys, less the ones this instance's caller fixed. */
export function marklessSsrStaticRowCells(
	cells: ReadonlyArray<SeedCell>,
	renderContext: StaticRowsContext | undefined,
): Array<Omit<SeedCell, 'staticRowKeys'>> {
	const fixed = fixedProps(renderContext);
	return cells.map(({ staticRowKeys, ...cell }) =>
		staticRowKeys
			? { ...cell, rowKeys: [...(cell.rowKeys ?? []), ...staticRowKeys.filter((key) => !fixed.includes(key))] }
			: cell,
	);
}

// Joins Dragon's per-page style exports into the one style file an app ships (styles-contract.md beside nav-contract.md).
export const NATIVE_APP_STYLE_VERSION = 'markless.native-app-style/0';

/** The Dragon export schema an app style is built from; hosts read its node and write shapes unchanged. */
export const DRAGON_STYLE_EXPORT_SCHEMA = 'dragon.native-style-export/1';

type Json = unknown;

const fail = (reason: string): never => {
	throw new Error(reason);
};

type DragonNode = {
	readonly id: string;
	readonly writes: ReadonlyArray<Json>;
	readonly [field: string]: Json;
};

type DragonTarget = {
	readonly backend: string;
	readonly viewport: { readonly width: number; readonly height: number };
	readonly dpr: number;
	readonly readiness: Json;
	readonly states: ReadonlyArray<Json>;
	readonly initial: number;
	readonly assignments: ReadonlyArray<{
		readonly values: Json;
		readonly nodes: ReadonlyArray<DragonNode>;
		/** The colour Chrome paints behind the page (html's background, else body's, else white). */
		readonly canvas: Json;
		/** body's own background in its box, when html's is the canvas; null when body paints none. */
		readonly bodyBackground?: Json;
	}>;
	readonly next: Json;
	readonly bands?: Json;
};

/** `dragon.native-style-export/1`, as Dragon's `markless:style-export` writes it for one page. */
export type DragonStyleExport = {
	readonly schema: string;
	readonly units: string;
	readonly compiler: string;
	readonly component: string;
	readonly warnings: ReadonlyArray<{ readonly code: string; readonly message: string }>;
	readonly fonts: ReadonlyArray<{ readonly id: string; readonly file: string }>;
	readonly targets: Readonly<Record<string, DragonTarget>>;
};

/** A page's styles inside the app file: Dragon's target fields, each node's `writes` an index into the target's `writes`. */
export type NativeAppStyleRoute = Omit<
	DragonTarget,
	'backend' | 'viewport' | 'dpr' | 'assignments'
> & {
	readonly pattern: string;
	readonly component: string;
	readonly compiler: string;
	readonly assignments: ReadonlyArray<{
		readonly values: Json;
		readonly nodes: ReadonlyArray<Omit<DragonNode, 'writes'> & { readonly writes: number }>;
		readonly canvas: Json;
		readonly bodyBackground?: Json;
	}>;
};

export type NativeAppStyle = {
	readonly version: typeof NATIVE_APP_STYLE_VERSION;
	readonly units: string;
	readonly warnings: ReadonlyArray<{
		readonly pattern: string;
		readonly code: string;
		readonly message: string;
	}>;
	readonly fonts: ReadonlyArray<{ readonly id: string; readonly file: string }>;
	readonly targets: Readonly<
		Record<
			string,
			{
				readonly backend: string;
				readonly viewport: DragonTarget['viewport'];
				readonly dpr: number;
				/** Every distinct list of lowered writes in the app, once: a component styled alike on two pages shares its lists. */
				readonly writes: ReadonlyArray<ReadonlyArray<Json>>;
				/** Only the routes with styles, in the app payload's route order. */
				readonly routes: ReadonlyArray<NativeAppStyleRoute>;
			}
		>
	>;
};

/**
 * One style file for the app. Frames stay per page (layout depends on where a component sits); the writes, which are the
 * component's look, are stored once per distinct list and named by index.
 */
export function nativeAppStyle(
	pages: ReadonlyArray<{ readonly pattern: string; readonly exported: DragonStyleExport }>,
): NativeAppStyle {
	if (pages.length === 0) throw new Error('an app style needs at least one styled page');
	const first = pages[0]!.exported;
	const fonts = new Map<string, string>();
	const targets: Record<string, NativeAppStyle['targets'][string]> = {};
	for (const { pattern, exported } of pages) {
		if (exported.schema !== DRAGON_STYLE_EXPORT_SCHEMA)
			throw new Error(
				`${pattern}: style export is ${exported.schema}, not ${DRAGON_STYLE_EXPORT_SCHEMA}`,
			);
		if (exported.units !== first.units)
			throw new Error(
				`${pattern}: style export units "${exported.units}" differ from "${first.units}"`,
			);
		const names = Object.keys(exported.targets).sort().join();
		if (names !== Object.keys(first.targets).sort().join())
			throw new Error(
				`${pattern}: style export targets ${names} differ from the other pages'`,
			);
		for (const font of exported.fonts) {
			if ((fonts.get(font.id) ?? font.file) !== font.file)
				throw new Error(`font ${font.id} names two files`);
			fonts.set(font.id, font.file);
		}
	}
	for (const name of Object.keys(first.targets)) {
		const { backend, viewport, dpr } = first.targets[name]!;
		const lists: Json[][] = [];
		const indexOf = new Map<string, number>();
		const intern = (writes: ReadonlyArray<Json>): number => {
			const key = JSON.stringify(writes);
			let index = indexOf.get(key);
			if (index === undefined) {
				index = lists.push([...writes]) - 1;
				indexOf.set(key, index);
			}
			return index;
		};
		const routes = pages.map(({ pattern, exported }): NativeAppStyleRoute => {
			const target = exported.targets[name]!;
			if (
				target.backend !== backend ||
				target.dpr !== dpr ||
				target.viewport.width !== viewport.width ||
				target.viewport.height !== viewport.height
			)
				throw new Error(
					`${pattern}: the ${name} export was laid out for another device than the other pages'`,
				);
			const { backend: _b, viewport: _v, dpr: _d, assignments, ...rest } = target;
			return {
				pattern,
				component: exported.component,
				compiler: exported.compiler,
				...rest,
				assignments: assignments.map((assignment, index) => ({
					values: assignment.values,
					canvas:
						assignment.canvas ??
						fail(`${pattern}: the ${name} export's assignment ${index} has no canvas`),
					...(assignment.bodyBackground === undefined
						? {}
						: { bodyBackground: assignment.bodyBackground }),
					nodes: assignment.nodes.map((node) => ({
						...node,
						writes: intern(node.writes),
					})),
				})),
			};
		});
		targets[name] = { backend, viewport, dpr, writes: lists, routes };
	}
	return {
		version: NATIVE_APP_STYLE_VERSION,
		units: first.units,
		warnings: pages.flatMap(({ pattern, exported }) =>
			exported.warnings.map((warning) => ({ pattern, ...warning })),
		),
		fonts: [...fonts].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, file]) => ({ id, file })),
		targets,
	};
}

/** Bytes of the app style beside the per-page exports it replaces, both as compact JSON. */
export function nativeAppStyleSize(
	pages: ReadonlyArray<{ readonly pattern: string; readonly exported: DragonStyleExport }>,
	style: NativeAppStyle,
) {
	const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
	return {
		perPage: Object.fromEntries(
			pages.map(({ pattern, exported }) => [pattern, bytes(exported)]),
		),
		perPageTotal: pages.reduce((sum, { exported }) => sum + bytes(exported), 0),
		app: bytes(style),
		targets: Object.fromEntries(
			Object.entries(style.targets).map(([name, target]) => [
				name,
				{
					writeLists: target.writes.length,
					writeListReferences: target.routes.reduce(
						(sum, route) =>
							sum +
							route.assignments.reduce(
								(n, assignment) => n + assignment.nodes.length,
								0,
							),
						0,
					),
				},
			]),
		),
	};
}

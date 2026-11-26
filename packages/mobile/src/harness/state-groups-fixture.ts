#!/usr/bin/env node
// The hosts' factored-states fixture: Dragon's export of a page whose states it splits into groups (schema /2), and beside it
// every entry the hosts must compose from it (each combination, then each one's interaction states), as Dragon's own reference
// (parity/src/state-groups.ts) composes it, for one target, and the export as an app's style file.
// Usage: node state-groups-fixture.ts <export.json> <target> <expected.json> <app-style.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nativeAppStyle, type DragonStyleExport } from '../app-style.ts';
import { assertDragonPin, dragonDir } from '../style-export.ts';

type Json = unknown;
type Assignment = { readonly values: Record<string, Json>; readonly nodes: ReadonlyArray<Json>; readonly [k: string]: Json };
type Level = { readonly states: ReadonlyArray<ReadonlyArray<number>> };
type Product = {
	readonly assignments: ReadonlyArray<ReadonlyArray<number>>;
	readonly interaction?: { readonly levels: ReadonlyArray<Level> };
	readonly rootPaint: number;
};
type Table = {
	readonly assignments: ReadonlyArray<Assignment>;
	readonly groupStates?: ReadonlyArray<string>;
	readonly planNames?: ReadonlyArray<ReadonlyArray<readonly [string, string]>>;
	readonly interaction?: { readonly levels: ReadonlyArray<{ readonly planAssignments?: ReadonlyArray<number> }> };
};
type Target = Table & {
	readonly groups: ReadonlyArray<Table>;
	readonly product: Product;
	readonly plan: { readonly groups: ReadonlyArray<{ readonly first: number }> };
};

const [exportPath, target, outPath, appPath] = process.argv.slice(2);
if (exportPath === undefined || target === undefined || outPath === undefined || appPath === undefined) throw new Error('usage: state-groups-fixture.ts <export.json> <target> <expected.json> <app-style.json>');
const dir = dragonDir();
assertDragonPin(dir);
const groupsReference = (await import(pathToFileURL(join(dir, 'packages/parity/src/state-groups.ts')).href)) as {
	composedNodes(target: Target, values: Json, shownIn: (table: number, entry: number) => Assignment): ReadonlyArray<Json>;
	shownState(base: Assignment, state: Assignment): Assignment;
	interactionStateOf(table: Table, level: number, k: number): Assignment;
};
const exported = JSON.parse(readFileSync(exportPath, 'utf8')) as { readonly targets: Record<string, Target> };
// Each distinct node once: an entry names its nodes by index, as most entries share most of them.
const pool: Json[] = [];
const poolIndex = new Map<string, number>();
const pooled = (node: Json): number => {
	const key = JSON.stringify(node);
	let k = poolIndex.get(key);
	if (k === undefined) {
		k = pool.push(node) - 1;
		poolIndex.set(key, k);
	}
	return k;
};
const expected = Object.fromEntries(
	Object.entries(exported.targets).filter(([name]) => name === target).map(([name, x]) => {
		const tables: ReadonlyArray<Table> = [x, ...x.groups];
		const firsts = [0, ...x.plan.groups.map((g) => g.first)];
		const shownOf = (t: number, e: number, s: number): Assignment => {
			const base = tables[t]!.assignments[e]!;
			return s < 0 ? base : groupsReference.shownState(base, groupsReference.interactionStateOf(tables[t]!, e, s));
		};
		const planOf = (t: number, e: number, s: number): number =>
			s < 0 ? firsts[t]! + e : tables[t]!.interaction!.levels[e]!.planAssignments![s]!;
		const flat = [
			...x.product.assignments.map((tuple) => ({ tuple, states: tuple.map(() => -1) })),
			...(x.product.interaction?.levels ?? []).flatMap((level, a) =>
				level.states.map((states) => ({ tuple: x.product.assignments[a]!, states })),
			),
		];
		const entries = flat.map(({ tuple, states }) => {
			// Each group gives only its own states' values; the page's entry every other.
			const values = Object.assign(
				{},
				...tuple.map((e, t) => {
					const own = tables[t]!.assignments[e]!.values;
					return t === 0 ? own : Object.fromEntries(tables[t]!.groupStates!.map((key) => [key, own[key]]));
				}),
			) as Record<string, Json>;
			// A node's text lines are its owner's, unchanged by composing: they are left out, as the hosts' check leaves them.
			const nodes = groupsReference.composedNodes(x, values, (t) => shownOf(t, tuple[t]!, states[t]!)).map((n) => {
				const { lines: _lines, ...rest } = n as Record<string, Json>;
				return pooled(rest);
			});
			const paint = shownOf(x.product.rootPaint, tuple[x.product.rootPaint]!, states[x.product.rootPaint]!);
			const parts = tuple.map((e, t) => planOf(t, e, states[t]!));
			const names = Object.fromEntries(
				parts.flatMap((p, t) => [...(tables[t]!.planNames?.[p - firsts[t]!] ?? [])]),
			);
			return { values, canvas: paint['canvas'], bodyBackground: paint['bodyBackground'] ?? null, nodes, parts, names };
		});
		return [name, { entries }];
	}),
);
writeFileSync(outPath, `${JSON.stringify({ nodes: pool, ...expected })}\n`);
writeFileSync(appPath, `${JSON.stringify(nativeAppStyle([{ pattern: '/', exported: exported as unknown as DragonStyleExport }]))}\n`);

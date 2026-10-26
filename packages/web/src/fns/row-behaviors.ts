import type { RuntimeGraph } from '@markless/runtime';
import { marklessElementAt } from '../resume-anchor-census.ts';
import { readKeyedRepeatCollection, repeatItemKey } from '../resume-keyed-repeats.ts';
import type {
	ResumeDomElement,
	ResumeKeyedRepeatRecord,
	ResumeRuntimeInput,
} from '../resume-types.ts';

type RowBehaviorHost = {
	readonly graph: RuntimeGraph;
	readonly loadSymbol?: ResumeRuntimeInput['loadSymbol'];
	readonly getElementHandle?: (handleIdOrName: string) => unknown;
};

type AttachedRow = {
	readonly root: ResumeDomElement;
	readonly started: Set<number>;
	readonly cleanups: Array<() => void>;
};

/**
 * Runs each row's attach once per row element, and its cleanup when the row leaves or is rebuilt.
 * A served row starts an attach only from an event on or inside its element, as a served page element does.
 */
export function marklessRowBehaviors(repeat: ResumeKeyedRepeatRecord, host: RowBehaviorHost) {
	const loadSymbol = host.loadSymbol;
	if (!loadSymbol)
		throw new Error(
			`MARKLESS_ROW_ATTACH_HOST_MISSING: keyed repeat ${repeat.id} has row attach records but was wired without a symbol loader.`,
		);
	const attached = new Map<unknown, AttachedRow>();
	const release = (rowKey: unknown): void => {
		const row = attached.get(rowKey);
		attached.delete(rowKey);
		for (const cleanup of (row?.cleanups ?? []).reverse()) cleanup();
	};
	return {
		async row(rowRoot: ResumeDomElement, rowKey: unknown, trigger?: ResumeDomElement): Promise<void> {
			const items = readKeyedRepeatCollection(host.graph, repeat);
			const index = items.findIndex((item, at) => repeatItemKey(item, repeat, at) === rowKey);
			if (index < 0) return;
			const item = items[index];
			let row = attached.get(rowKey);
			if (row?.root !== rowRoot) {
				release(rowKey);
				row = { root: rowRoot, started: new Set(), cleanups: [] };
				attached.set(rowKey, row);
			}
			const own = row;
			const locals = {
				[repeat.itemName]: item,
				...(repeat.indexName ? { [repeat.indexName]: index } : {}),
			};
			for (const [at, behavior] of (repeat.rowBehaviors ?? []).entries()) {
				const element = marklessElementAt(rowRoot, behavior.hostPath);
				if (!element || own.started.has(at)) continue;
				if (trigger && !(element as { contains?: (node: unknown) => boolean }).contains?.(trigger))
					continue;
				own.started.add(at);
				const symbol = (await loadSymbol(behavior.symbolId)) as (context: object) => unknown;
				if (attached.get(rowKey) !== own) return;
				const cleanup = await symbol({
					graph: host.graph,
					element,
					getElementHandle: host.getElementHandle ?? (() => undefined),
					locals,
					behaviorInputs: behavior.inputPaths.map((path) =>
						path.reduce<unknown>(
							(value, key) => (value as Record<string, unknown> | null | undefined)?.[key],
							item,
						),
					),
				});
				if (typeof cleanup !== 'function') continue;
				if (attached.get(rowKey) === own) own.cleanups.push(cleanup as () => void);
				else (cleanup as () => void)();
			}
		},
		sweep(rowRootsByKey: ReadonlyMap<unknown, ResumeDomElement>): void {
			for (const [rowKey, row] of attached)
				if (rowRootsByKey.get(rowKey) !== row.root) release(rowKey);
		},
	};
}

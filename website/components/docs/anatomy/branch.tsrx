import { tree, lucide } from '@markless/ui';
import type { AnatomyNode } from './hierarchy.ts';

export default function AnatomyBranch({ part, label, name, shapeId, level, nodes }: {
	readonly part: string;
	readonly label: string;
	readonly name: string;
	readonly shapeId: string;
	readonly level: number;
	readonly nodes: readonly AnatomyNode[];
}) @{
	const icon = part === 'root' ? 'M8 1 11 4 8 7 5 4ZM4 5 7 8 4 11 1 8ZM12 5 15 8 12 11 9 8ZM8 9 11 12 8 15 5 12Z' : nodes.length > 0 ? 'M5 1v14M11 1v14M1 5h14M1 11h14' : part.endsWith('label') ? 'M3 3h10M8 3v10M5 13h6' : 'M2 3h12v10H2Z';
	<tree.item class="structure-node" open leaf={nodes.length === 0} level={level} aria-label={name} data-part={part} data-shape={shapeId}>
		<div class="structure-row" data-part={part} data-shape={shapeId} style={'--layer-level: ' + level}>
			<tree.itemtrigger class="structure-trigger" hidden={nodes.length === 0}>
				<lucide.chevronright width="12" height="12" aria-hidden="true" />
			</tree.itemtrigger>
			<span class="structure-leaf" hidden={nodes.length > 0} aria-hidden="true"></span>
			<svg class="structure-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d={icon} /></svg>
			<tree.itemlabel class="structure-label">{label}</tree.itemlabel>
		</div>
		<tree.itemcontent class="structure-children">
			@for (const entry of nodes; key entry.id) {
				<AnatomyBranch part={entry.part} label={entry.label} name={entry.name} shapeId={entry.shapeId} level={entry.level} nodes={entry.children} />;
			}
		</tree.itemcontent>
		<style>
			.structure-node { outline: none; }
			.structure-row { display: flex; align-items: center; gap: 6px; height: 30px; box-sizing: border-box; padding: 0 10px 0 calc(6px + (var(--layer-level) - 1) * 12px); color: var(--ink); cursor: default; }
			.structure-row:hover { background: color-mix(in srgb, var(--purple) 12%, var(--paper)); }
			.structure-node:focus-visible > .structure-row { outline: 2px solid var(--ink); outline-offset: -2px; }
			.structure-trigger { display: grid; place-items: center; flex: none; width: 12px; height: 24px; padding: 0; border: 0; background: none; color: inherit; cursor: pointer; }
			.structure-trigger[ui-open] { transform: rotate(90deg); }
			.structure-trigger[hidden], .structure-leaf[hidden], .structure-node[ui-leaf] > .structure-children { display: none; }
			.structure-trigger:focus-visible { outline: 2px solid var(--ink); }
			.structure-leaf { width: 12px; flex: none; }
			.structure-icon { flex: none; fill: none; stroke: currentColor; stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round; }
			.structure-row[data-part='root'] .structure-icon { color: color-mix(in srgb, var(--purple) 60%, var(--ink)); }
			.structure-label { overflow: hidden; text-overflow: ellipsis; font: 12px/1.4 system-ui, sans-serif; white-space: nowrap; }
			.structure-children[hidden] { display: none; }
			@anatomy-tree-selection;
		</style>
	</tree.item>;
}

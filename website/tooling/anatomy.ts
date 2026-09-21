import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';
import { scenes } from '../components/docs/anatomy/scenes.ts';
import type { ApiManifest } from '../components/docs/api-derive/manifest.ts';

const directive = '@anatomy-selection;';
const treeDirective = '@anatomy-tree-selection;';

export function expandAnatomyStyles(source: string, parts: readonly string[], shapeIds: readonly string[] = []): string {
	if (!source.includes(directive) && !source.includes(treeDirective)) return source;
	const rules = [...new Set(parts)].map((part) => {
		if (!/^[a-z][a-z0-9]*$/i.test(part)) throw new Error(`Anatomy: invalid exported part name ${part}.`);
		const selected = `.anatomy-study[data-selected="${part}"]`;
		const target = `[data-part="${part}"]`;
		return `${selected} .callout${target}, ${selected} .part-shape${target} { opacity: 1; }
${selected} .callout${target} path { stroke: color-mix(in srgb, var(--purple) 65%, var(--ink)); stroke-width: 2; }
${selected} .callout${target} .callout-part { font-weight: 800; }
${selected} .part-shape${target} .shape-face { fill: color-mix(in srgb, var(--purple) 70%, var(--paper)); stroke: var(--ink); stroke-width: 2.5; }`;
	});
	const instances = shapeIds.map((id) => {
		if (!/^[a-z][a-z0-9-]*$/i.test(id)) throw new Error(`Anatomy: invalid shape id ${id}.`);
		return `.anatomy-study[data-shape="${id}"] .part-shape[data-selection-id="${id}"] { opacity: 1; }
.anatomy-study[data-shape="${id}"] .part-shape[data-selection-id="${id}"] .shape-face { fill: color-mix(in srgb, var(--purple) 70%, var(--paper)); stroke: var(--ink); stroke-width: 2.5; }`;
	});
	const treeRules = shapeIds.map((id) => `.anatomy-study[data-shape="${id}"] .structure-row[data-shape="${id}"] { background: color-mix(in srgb, var(--purple) 35%, var(--paper)); font-weight: 700; }`);
	return source.replace(directive, (shapeIds.length ? instances : rules).join('\n')).replace(treeDirective, treeRules.join('\n'));
}

export function anatomy(): Plugin {
	const manifestFile = createRequire(import.meta.url).resolve('@markless/ui/api/manifest.json');
	return {
		name: 'compiled-website:anatomy',
		enforce: 'pre',
		transform(source, id) {
			if (!id.split('?', 1)[0]?.endsWith('.tsrx') || (!source.includes(directive) && !source.includes(treeDirective))) return;
			this.addWatchFile(manifestFile);
			const metadata = JSON.parse(readFileSync(manifestFile, 'utf8')) as ApiManifest;
			const parts = Object.values(metadata).flatMap((family) => family.parts.map((part) => part.part));
			return { code: expandAnatomyStyles(source, parts, Object.entries(scenes).flatMap(([family, scene]) => scene.shapes.map((_, index) => `${family}-${index}`))), map: null };
		},
	};
}

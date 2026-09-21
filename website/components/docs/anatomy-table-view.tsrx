import { state } from '@markless/core';
import { lucide, slider, tree } from '@markless/ui';
import type { deriveAnatomy } from './anatomy/model.ts';
import AnatomyBranch from './anatomy/branch.tsrx';

export default function AnatomyTableView({ family: name, data }: { readonly family: string; readonly data: ReturnType<typeof deriveAnatomy> }) @{
	const anatomy = structuredClone(data);
	const parts = anatomy.parts;
	const shapes = anatomy.shapes;
	const hierarchy = anatomy.hierarchy;
	if (!hierarchy) throw new Error(`No anatomy composition for ${name}`);
	let study = state({
		selected: 'root',
		selectedShape: anatomy.rootShape.selectionId,
		layers: false,
		hierarchy,
		parts,
		shapes,
		current: { ...anatomy.root },
		region: { ...anatomy.rootShape },
		drawn: true,
	});

	<slider.root class="anatomy-control" value={0} onChange={(value: number | [number, number]) => { study.layers = typeof value === 'number' && value > 0; }}>
	<figure
		class="anatomy-study"
		data-family={name}
		data-selected={study.selected}
		data-shape={study.selectedShape}
		data-layers={study.layers}
		onKeydown={(event: KeyboardEvent) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			const target = event.target;
			if (!(target instanceof Element)) return;
			const hotspot = target.closest('[data-part]');
			const part = hotspot?.getAttribute('data-part');
			if (!part) return;
			event.preventDefault();
			const shapeId = hotspot?.getAttribute('data-shape');
			const options = study.parts;
			const drawing = study.shapes;
			const found = options.find((option) => option.part === part);
			if (!found) return;
			study.selected = part;
			study.current.name = found.name;
			study.current.description = found.description;
			const area = drawing.find((shape) => shapeId ? shape.id === shapeId : shape.part === part);
			study.drawn = Boolean(area);
			const bounds = area ?? drawing[0];
			study.selectedShape = bounds.selectionId;
			study.region.layerStyle = bounds.layerStyle;
			study.region.x = bounds.x;
			study.region.y = bounds.y;
			study.region.width = bounds.width;
			study.region.height = bounds.height;
		}}
		onClick={(event: Event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const hotspot = target.closest('[data-part]');
			const part = hotspot?.getAttribute('data-part');
			if (!part) return;
			const shapeId = hotspot?.getAttribute('data-shape');
			const options = study.parts;
			const drawing = study.shapes;
			const found = options.find((option) => option.part === part);
			if (!found) return;
			study.selected = part;
			study.current.name = found.name;
			study.current.description = found.description;
			const area = drawing.find((shape) => shapeId ? shape.id === shapeId : shape.part === part);
			study.drawn = Boolean(area);
			const bounds = area ?? drawing[0];
			study.selectedShape = bounds.selectionId;
			study.region.layerStyle = bounds.layerStyle;
			study.region.x = bounds.x;
			study.region.y = bounds.y;
			study.region.width = bounds.width;
			study.region.height = bounds.height;
		}}
		onPointerover={(event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const hotspot = target.closest('[data-part]');
			if (event.relatedTarget instanceof Element && event.relatedTarget.closest('[data-part]') === hotspot) return;
			const part = hotspot?.getAttribute('data-part');
			if (!part) return;
			const shapeId = hotspot?.getAttribute('data-shape');
			const options = study.parts;
			const drawing = study.shapes;
			const found = options.find((option) => option.part === part);
			if (!found) return;
			study.selected = part;
			study.current.name = found.name;
			study.current.description = found.description;
			const area = drawing.find((shape) => shapeId ? shape.id === shapeId : shape.part === part);
			study.drawn = Boolean(area);
			const bounds = area ?? drawing[0];
			study.selectedShape = bounds.selectionId;
			study.region.layerStyle = bounds.layerStyle;
			study.region.x = bounds.x;
			study.region.y = bounds.y;
			study.region.width = bounds.width;
			study.region.height = bounds.height;
		}}

		onFocusin={(event: Event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const hotspot = target.closest('[data-part]');
			const part = hotspot?.getAttribute('data-part');
			if (!part) return;
			const shapeId = hotspot?.getAttribute('data-shape');
			const options = study.parts;
			const drawing = study.shapes;
			const found = options.find((option) => option.part === part);
			if (!found) return;
			study.selected = part;
			study.current.name = found.name;
			study.current.description = found.description;
			const area = drawing.find((shape) => shapeId ? shape.id === shapeId : shape.part === part);
			study.drawn = Boolean(area);
			const bounds = area ?? drawing[0];
			study.selectedShape = bounds.selectionId;
			study.region.layerStyle = bounds.layerStyle;
			study.region.x = bounds.x;
			study.region.y = bounds.y;
			study.region.width = bounds.width;
			study.region.height = bounds.height;
		}}
	>
		<style>
			@property --anatomy-selection-y { syntax: "<number>"; inherits: false; initial-value: 0; }
			.anatomy-study { --view: calc(var(--slider-end) / 100%); margin: 1.5rem 0 2rem; color: var(--ink); container-type: inline-size; border: 1.5px solid var(--ink); border-radius: 12px; background: var(--paper); box-shadow: 7px 7px 0 var(--muted-ink); }
			.study-header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; padding: 1rem 1.25rem .5rem; }
			.study-title { font-size: var(--step-0); font-weight: 600; text-shadow: none; }
			.study-hint { color: var(--muted-ink); font-size: var(--step--2); }
			button { color: inherit; font: inherit; cursor: pointer; }
			.drawing { position: relative; overflow-x: auto; }
			.anatomy-canvas { display: block; width: 100%; height: auto; overflow: visible; }
			.part-shape { --plane-y: var(--layer-y); cursor: pointer; opacity: .8; transition: opacity 180ms ease-out; }
			.part-shape .shape-face { fill: color-mix(in srgb, var(--purple) 28%, var(--paper)); stroke: var(--ink); stroke-width: 1.8; transition: fill 180ms ease-out, stroke 180ms ease-out; }
			.part-shape[data-kind='wash'] .shape-face { fill: color-mix(in srgb, var(--purple) 40%, var(--paper)); }
			.part-shape[data-kind='line'] .shape-face { fill: color-mix(in srgb, var(--purple) 10%, var(--paper)); stroke: color-mix(in srgb, var(--ink) 65%, var(--paper)); }
			.part-shape[data-kind='text'] .shape-face { fill: color-mix(in srgb, var(--purple) 18%, var(--paper)); stroke: color-mix(in srgb, var(--ink) 65%, var(--paper)); }
			.part-chevron { color: var(--ink); pointer-events: none; }
			.part-chevron:not([data-icon]) { display: none; }
			.part-shape text { fill: var(--ink); font-size: 15px; pointer-events: none; }
			.part-shape:focus-visible { outline: none; }
			.part-shape:focus-visible rect { stroke: var(--ink); stroke-width: 2.5; stroke-dasharray: 3 2; }
			[data-selected="root"] .selection { fill: none; }
			.selection { fill: none; stroke: color-mix(in srgb, var(--purple) 65%, var(--ink)); stroke-width: 2; pointer-events: none; transition: x 180ms ease-out, y 180ms ease-out, width 180ms ease-out, height 180ms ease-out; }
			.measure-group { --anatomy-selection-y: var(--layer-y); --plane-y: var(--anatomy-selection-y); pointer-events: none; transition: --anatomy-selection-y 180ms ease-out; }
			.measure-group:not([data-visible]) { display: none; }
			.inspector { display: grid; gap: .35rem; min-height: 6rem; box-sizing: border-box; padding: .8rem 1.25rem 1rem; border-top: 1px solid var(--code-edge); }
			.part-name { font-family: var(--font-mono); font-size: var(--step--2); overflow-wrap: anywhere; }
			.part-description { grid-column: 1 / -1; margin: 0; font-size: var(--step--1); line-height: 1.5; }
			button:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
			.view-control { display: flex; align-items: center; gap: .65rem; font-family: var(--font-mono); font-size: var(--step--2); }
			.view-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
			.view-track { position: relative; width: 7rem; height: 2.5rem; touch-action: none; cursor: ew-resize; }
			.view-track::before { content: ''; position: absolute; inset: calc(50% - 2px) 0 auto; height: 4px; border-radius: 4px; background: linear-gradient(to right, var(--purple) var(--slider-end), var(--code-edge) var(--slider-end)); }
			.view-thumb { position: absolute; left: var(--slider-offset); top: 50%; transform: translate(-50%, -50%); width: 1rem; height: 1rem; border: 1.5px solid var(--ink); border-radius: 50%; background: var(--purple); box-shadow: 2px 2px 0 var(--muted-ink); }
			.view-thumb:focus-visible { outline: 2px solid var(--ink); outline-offset: 4px; }
			.part-shape, .measure-group { transform: matrix(calc(var(--flat-scale) + (var(--layer-a) - var(--flat-scale)) * var(--view)), calc(var(--layer-b) * var(--view)), calc(var(--layer-c) * var(--view)), calc(var(--flat-scale) + (var(--layer-d) - var(--flat-scale)) * var(--view)), calc(var(--flat-x) + (var(--layer-x) - var(--flat-x)) * var(--view)), calc(var(--flat-y) + (var(--plane-y) - var(--flat-y)) * var(--view))); }
			.layer-side { fill: var(--muted-ink); stroke: var(--ink); stroke-width: 1; pointer-events: none; opacity: var(--view); }
			.anatomy-study[data-layers] .part-shape .shape-face { fill: color-mix(in srgb, var(--purple) 28%, var(--paper)); stroke: var(--ink); }
			.anatomy-study[data-layers] .part-shape[data-kind='wash'] .shape-face { fill: color-mix(in srgb, var(--purple) 40%, var(--paper)); }
			.anatomy-study:not([data-layers]) .layer-side { display: none; }
			.study-workspace { display: grid; grid-template-columns: minmax(12rem, 1fr) minmax(0, 2fr); border-top: 1px solid var(--code-edge); }
			.structure-panel { min-width: 0; padding: 0 0 .5rem; border-right: 1px solid var(--code-edge); background: color-mix(in srgb, var(--paper) 96%, var(--ink)); }
			.structure-tree { max-height: 23rem; overflow: auto; }
			.structure-heading { display: flex; align-items: center; height: 38px; padding: 0 12px; font: 600 12px/1.4 system-ui, sans-serif; color: var(--ink); }
			.drawing { display: grid; align-items: center; padding: .5rem; }
			@container (max-width: 520px) { .study-workspace { grid-template-columns: 1fr; } .structure-panel { order: 2; border-right: 0; border-top: 1px solid var(--code-edge); } .structure-tree { max-height: 12rem; } }
			@media (prefers-reduced-motion: reduce) { .part-shape, .part-shape .shape-face, .selection, .measure-group { transition: none; } }
			@anatomy-selection;
			@container (max-width: 420px) { .study-header { flex-wrap: wrap; gap: .2rem; } .study-title { font-size: var(--step--1); } .part-shape text { font-size: 16px; } }
		</style>
		<div class="study-header">
			<span class="study-title">{name} anatomy</span>
			<div class="view-control">
				<slider.label class="view-label">Anatomy perspective</slider.label>
				<span>Flat</span>
				<slider.track class="view-track">
					<slider.thumb class="view-thumb" />
				</slider.track>
				<span>Layers</span>
			</div>
		</div>
		<div class="study-workspace">
			<aside class="structure-panel" aria-label="Component structure">
				<tree.root class="structure-tree" aria-label={name + ' structure'}>
					<tree.label class="structure-heading">Layers</tree.label>
					<AnatomyBranch part={study.hierarchy.part} label={study.hierarchy.label} name={study.hierarchy.name} shapeId={study.hierarchy.shapeId} level={study.hierarchy.level} nodes={study.hierarchy.children} />
				</tree.root>
			</aside>
		<div class="drawing">
			<svg class="anatomy-canvas" viewBox="180 60 440 350" role="group" aria-label={anatomy.diagramLabel}>
				<g class="drawing-plane">
				@for (const shape of shapes; key shape.id) {
					<g class="part-shape" data-part={shape.part} data-shape={shape.id} data-kind={shape.kind} data-selection-id={shape.selectionId} style={shape.layerStyle}>
						<rect class="layer-side" x={shape.x} y={shape.y + 5} width={shape.width} height={shape.height} rx={shape.radius} />
						<rect class="shape-face"
							x={shape.x}
							y={shape.y}
							width={shape.width}
							height={shape.height}
							rx={shape.radius}
						/>
						<g class="part-chevron" data-icon={Boolean(shape.icon)} transform={shape.iconTransform}>
							<g transform={shape.iconRotation}>
								<lucide.chevronright width="24" height="24" aria-hidden="true" />
							</g>
						</g>
						<text
							x={shape.textX}
							y={shape.y + shape.height / 2}
							text-anchor={shape.textAnchor}
							dominant-baseline="middle"
						>
							{shape.text}
						</text>
					</g>;
				}
				</g>
				<g class="measure-group" style={study.region.layerStyle} data-visible={study.drawn} aria-hidden="true">
					<rect class="selection" x={study.region.x - 3} y={study.region.y - 3} width={study.region.width + 6} height={study.region.height + 6} rx={3} />
				</g>
			</svg>
		</div>
		</div>
		<div class="inspector" aria-live="polite" aria-atomic="true">
			<span class="part-name">{study.current.name}</span>
			<p class="part-description">{study.current.description}</p>
		</div>
	</figure>
	</slider.root>;
}

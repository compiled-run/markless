import { expect, test } from 'vitest';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../../src/artifact-helpers/graph-paths.ts';
import { compileModule, type CompiledModule } from './support.ts';

/**
 * Minting a distinct wire key per declaring component is only half the cell.
 * A template read still resolves its source name through a MODULE-WIDE binding
 * map, which keeps whichever same-named binding came last, so both parts' reads
 * point at the later part's cell. The read record already carries the component
 * that authored it; these rows pin that the scoped lookup answers correctly and
 * that the emitted surfaces carry the answer.
 */

const FAMILY = `
import { computed, shared, state } from '@markless/core';

export const stepperState = shared(
	() => {
		const stepper = state({ step: 0, count: 3 });
		return { ...stepper };
	},
	{ scope: 'widget' },
);

export function StepperBackTrigger({ children }) @{
	const stepper = stepperState();
	const isOff = computed(() => {
		const at = stepper.step;
		return at <= 0;
	});

	<button type="button" data-back disabled={isOff}>{children}</button>
}

export function StepperForwardTrigger({ children }) @{
	const stepper = stepperState();
	const isOff = computed(() => {
		const at = stepper.step;
		const total = stepper.count;
		return at >= total - 1;
	});

	<button type="button" data-forward disabled={isOff}>{children}</button>
}
`;

function scopedRead(compiled: CompiledModule, componentName: string, source: string) {
	const graph = compiled.semanticGraph;
	return resolveGraphPath(
		source,
		graphBindingMap(graph, null, componentName),
		semanticAliasMap(graph, null, componentName),
	);
}

function unscopedRead(compiled: CompiledModule, source: string) {
	const graph = compiled.semanticGraph;
	return resolveGraphPath(source, graphBindingMap(graph, null), semanticAliasMap(graph, null));
}

test('a lookup scoped to the reading component answers that component own cell', async () => {
	const compiled = await compileModule('src/stepper.tsrx', FAMILY);

	expect(scopedRead(compiled, 'StepperBackTrigger', 'isOff')?.binding.id).toBe(
		'computed:StepperBackTrigger.isOff',
	);
	expect(scopedRead(compiled, 'StepperForwardTrigger', 'isOff')?.binding.id).toBe(
		'computed:StepperForwardTrigger.isOff',
	);
});

test('the module-wide lookup answers only the last declarer, which is the defect', async () => {
	const compiled = await compileModule('src/stepper.tsrx', FAMILY);

	expect(unscopedRead(compiled, 'isOff')?.binding.id).toBe(
		'computed:StepperForwardTrigger.isOff',
	);
});

test('each template chunk slot reads the cell its own component declared', async () => {
	const compiled = await compileModule('src/stepper.tsrx', FAMILY);
	const residues = compiled.renderData.chunks.flatMap((chunk) =>
		chunk.componentName
			? (chunk.slots ?? []).flatMap((slot) =>
					'residue' in slot && slot.residue.kind === 'graph-read'
						? [`${chunk.componentName} ${slot.residue.graphNodeId}`]
						: [],
				)
			: [],
	);

	expect(residues).toContain('StepperBackTrigger computed:StepperBackTrigger.isOff');
	expect(residues).toContain('StepperForwardTrigger computed:StepperForwardTrigger.isOff');
});

test('each host DOM update reads the cell its own component declared', async () => {
	const compiled = await compileModule('src/stepper.tsrx', FAMILY);
	const backHost = compiled.renderData.chunks
		.find((chunk) => chunk.componentName === 'StepperBackTrigger')
		?.hosts?.[0]?.hostNodeId;
	const backUpdate = compiled.payloadArena.view.domUpdates.find(
		(update) => update.hostNodeId === backHost && update.source === 'isOff',
	);

	expect(backUpdate?.graphNodeId).toBe('computed:StepperBackTrigger.isOff');
});

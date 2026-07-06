import type { ProtocolStatePayload } from '@markless/serializer';
import type {
	RuntimeGraphRead,
	RuntimeGraphSharedPatch,
	RuntimeGraphSharedWrite,
} from './graph.ts';
import {
	dirtyPathForGraphWrite,
	findLastSharedReturnProperty,
	readPath,
	writePath,
} from './graph-core.ts';

type RuntimeSharedDefinition = NonNullable<ProtocolStatePayload['sharedDefinitions']>[number];

export function createSharedGraphPlane(input: {
	readonly cells: Map<string, unknown>;
	readonly sharedDefinitionsInput: ProtocolStatePayload['sharedDefinitions'] | undefined;
	readonly readGraph: RuntimeGraphRead;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
}) {
	const sharedDefinitions = new Map<string, RuntimeSharedDefinition>();
	const sharedPatches: RuntimeGraphSharedPatch[] = [];
	for (const definition of input.sharedDefinitionsInput ?? []) {
		sharedDefinitions.set(definition.id, definition);
	}

	const resolveSharedGraphPath = (
		definitionId: string,
		propertyName: string,
		path: ReadonlyArray<string>,
	):
		| {
				readonly definition: RuntimeSharedDefinition;
				readonly graphNodeId: string;
				readonly graphPath: ReadonlyArray<string>;
				readonly exposedPath: ReadonlyArray<string>;
		  }
		| undefined => {
		const definition = sharedDefinitions.get(definitionId);
		if (!definition) return undefined;

		const property = findLastSharedReturnProperty(definition.returnProperties, propertyName);
		if (!property || property.kind !== 'graph') return undefined;

		return {
			definition,
			graphNodeId: property.graphNodeId,
			graphPath: [...property.path, ...path],
			exposedPath: [property.name, ...path],
		};
	};

	const setSharedDefinitionVersion = (
		definition: RuntimeSharedDefinition,
		version: number,
	): RuntimeSharedDefinition => {
		const nextDefinition = {
			...definition,
			version,
		};
		sharedDefinitions.set(definition.id, nextDefinition);
		return nextDefinition;
	};

	const nextSharedDefinitionVersion = (
		definition: RuntimeSharedDefinition,
	): RuntimeSharedDefinition => setSharedDefinitionVersion(definition, definition.version + 1);

	const applySharedPatch = (patch: RuntimeGraphSharedPatch): boolean => {
		const definition = sharedDefinitions.get(patch.id);
		if (!definition) return false;
		if (patch.version <= definition.version) return false;
		if (patch.scope && definition.scope && patch.scope !== definition.scope) return false;
		if (patch.patch.length === 0) return false;

		const resolvedPatches: Array<{
			readonly graphNodeId: string;
			readonly graphPath: ReadonlyArray<string>;
			readonly value: unknown;
		}> = [];

		for (const [operation, exposedPath, value] of patch.patch) {
			if (operation !== 'set') return false;
			const [propertyName, ...path] = exposedPath;
			if (!propertyName) return false;

			const resolved = resolveSharedGraphPath(patch.id, propertyName, path);
			if (!resolved) return false;
			resolvedPatches.push({
				graphNodeId: resolved.graphNodeId,
				graphPath: resolved.graphPath,
				value,
			});
		}

		for (const resolved of resolvedPatches) {
			const current = input.cells.get(resolved.graphNodeId);
			input.cells.set(resolved.graphNodeId, writePath(current, resolved.graphPath, resolved.value));
			input.markDirtyPath(
				resolved.graphNodeId,
				dirtyPathForGraphWrite(current, resolved.graphPath),
			);
		}

		setSharedDefinitionVersion(definition, patch.version);
		input.scheduleFlush();
		return true;
	};

	return {
		readShared(
			definitionId: string,
			propertyName: string,
			path: ReadonlyArray<string> = [],
		): unknown {
			const resolved = resolveSharedGraphPath(definitionId, propertyName, path);
			if (!resolved) return undefined;

			return input.readGraph(resolved.graphNodeId, resolved.graphPath);
		},
		writeShared(write: RuntimeGraphSharedWrite): boolean {
			const target = resolveSharedGraphPath(
				write.definitionId,
				write.propertyName,
				write.path ?? [],
			);
			if (!target) return false;

			const current = input.cells.get(target.graphNodeId);
			input.cells.set(target.graphNodeId, writePath(current, target.graphPath, write.value));
			const nextDefinition = nextSharedDefinitionVersion(target.definition);
			sharedPatches.push({
				id: nextDefinition.id,
				...(nextDefinition.scope ? { scope: nextDefinition.scope } : {}),
				version: nextDefinition.version,
				patch: [['set', target.exposedPath, write.value]],
			});
			input.markDirtyPath(
				target.graphNodeId,
				dirtyPathForGraphWrite(current, target.graphPath),
			);
			input.scheduleFlush();
			return true;
		},
		getSharedDefinition(definitionId: string) {
			return sharedDefinitions.get(definitionId);
		},
		listSharedDefinitions() {
			return [...sharedDefinitions.values()];
		},
		takeSharedPatches() {
			return sharedPatches.splice(0);
		},
		applySharedPatch,
	};
}

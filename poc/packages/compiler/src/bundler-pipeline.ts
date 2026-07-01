import type {
	PipelineEmittedChunkRecord,
	PipelineManifest,
	PipelineReceipt,
	PipelineTransformConstraints,
	PipelineVirtualModuleRecord,
} from '../../protocol/src/index.ts';
import { planPayloadLocators } from './payload-locators.ts';
import { buildSemanticGraph, type SemanticGraphInput } from './semantic-graph.ts';
import { planSymbolResolver } from './symbol-resolver.ts';

export type BundlerPipelineTransformInput = SemanticGraphInput & {
	readonly revision?: number;
};

export type BundlerTransformedModule = {
	readonly id: string;
	readonly code: string;
	readonly map: null;
};

export type BundlerPipelineTransformArtifact = {
	readonly passId: 'bundler-pipeline-transform';
	readonly filename: string;
	readonly sourceKind: 'tsrx';
	readonly transformedModule: BundlerTransformedModule;
	readonly virtualModules: ReadonlyArray<PipelineVirtualModuleRecord>;
	readonly emittedChunks: ReadonlyArray<PipelineEmittedChunkRecord>;
	readonly manifest: PipelineManifest;
	readonly pipelineReceipts: ReadonlyArray<PipelineReceipt>;
	readonly constraints: PipelineTransformConstraints;
};

export async function transformTsrxForBundler(
	input: BundlerPipelineTransformInput,
): Promise<BundlerPipelineTransformArtifact> {
	const graph = await buildSemanticGraph(input);
	const locators = planPayloadLocators(graph);
	const resolver = await planSymbolResolver(input);
	const sourceFingerprint = portableFingerprint(input.source);
	const revision = input.revision ?? 1;
	const moduleSlug = stableModuleSlug(input.filename);

	const symbolIds = [
		...resolver.eventHandlerSymbols.map((symbol) => symbol.symbolId),
		...resolver.bindingUpdateSymbols.map((symbol) => symbol.symbolId),
		...resolver.behaviorSymbols.map((symbol) => symbol.symbolId),
		...resolver.asyncRunnerSymbols.map((symbol) => symbol.symbolId),
	];
	const eventNames = unique(resolver.eventHandlerSymbols.map((symbol) => symbol.eventName));
	const virtualModules = createVirtualModules({
		filename: input.filename,
		moduleSlug,
		revision,
		symbolIds,
		sourceFingerprint,
	});
	const emittedChunks: PipelineEmittedChunkRecord[] = [
		{
			id: `chunk:${moduleSlug}:app`,
			kind: 'app',
			owner: 'app-module',
			moduleIds: [input.filename],
		},
		{
			id: `chunk:${moduleSlug}:symbols`,
			kind: 'symbol',
			owner: 'generated-symbol-resolver',
			moduleIds: symbolIds,
		},
		{
			id: `chunk:${moduleSlug}:runtime`,
			kind: 'runtime',
			owner: 'runtime-resume-entry',
			moduleIds: virtualModules
				.filter((module) => module.kind === 'runtime-entry')
				.map((module) => module.id),
		},
	];
	const manifest: PipelineManifest = {
		protocol: 'markless-pipeline-poc',
		revision,
		transformedModules: [
			{
				id: input.filename,
				sourceKind: 'tsrx',
				sourceFingerprint,
				virtualModuleIds: virtualModules.map((module) => module.id),
				chunkIds: emittedChunks.map((chunk) => chunk.id),
				symbolIds,
				eventNames,
			},
		],
		virtualModules: virtualModules.map(({ code: _code, ...module }) => module),
		emittedChunks,
		relationships: [
			{
				from: input.filename,
				to: requiredVirtualModule(virtualModules, 'symbol-resolver').id,
				relationship: 'owns-symbols',
			},
			{
				from: input.filename,
				to: requiredVirtualModule(virtualModules, 'runtime-entry').id,
				relationship: 'uses-runtime',
			},
			{
				from: input.filename,
				to: requiredVirtualModule(virtualModules, 'manifest').id,
				relationship: 'describes-manifest',
			},
			...emittedChunks.map((chunk) => ({
				from: input.filename,
				to: chunk.id,
				relationship: 'emits-chunk' as const,
			})),
		],
	};

	return {
		passId: 'bundler-pipeline-transform',
		filename: input.filename,
		sourceKind: 'tsrx',
		transformedModule: {
			id: input.filename,
			code: transformedModuleCode(input.filename, virtualModules),
			map: null,
		},
		virtualModules: withManifestVirtualModule(virtualModules, manifest),
		emittedChunks,
		manifest,
		pipelineReceipts: [
			{
				stage: 'compiler-transform',
				moduleId: input.filename,
				inspectable: true,
				summary: 'Compiler consumed TSRX and produced pipeline transform artifacts.',
				details: {
					componentCount: graph.components.length,
					hostNodeCount: graph.hostNodes.length,
					behaviorCount: graph.behaviorProps.length,
					locatorRecordCount: locators.locatorStream.length,
					virtualModuleCount: virtualModules.length,
					emittedChunkCount: emittedChunks.length,
					symbolCount: symbolIds.length,
				},
			},
		],
		constraints: {
			usesHydration: false,
			usesVdom: false,
			sharedCodeUsesNodeApis: false,
			buildTooling: 'vite-rolldown-vite-plus',
		},
	};
}

export function portableFingerprint(source: string): string {
	let hash = 2166136261;

	for (let index = 0; index < source.length; index++) {
		hash ^= source.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	return `fp_${(hash >>> 0).toString(36)}_${source.length.toString(36)}`;
}

function createVirtualModules(input: {
	readonly filename: string;
	readonly moduleSlug: string;
	readonly revision: number;
	readonly symbolIds: ReadonlyArray<string>;
	readonly sourceFingerprint: string;
}): PipelineVirtualModuleRecord[] {
	const symbolResolverId = `virtual:markless/symbol-resolver?module=${input.moduleSlug}`;
	const manifestId = `virtual:markless/manifest?module=${input.moduleSlug}`;
	const runtimeId = `virtual:markless/runtime?module=${input.moduleSlug}`;

	return [
		{
			id: symbolResolverId,
			kind: 'symbol-resolver',
			ownerModuleId: input.filename,
			code: symbolResolverCode(input.symbolIds),
		},
		{
			id: manifestId,
			kind: 'manifest',
			ownerModuleId: input.filename,
			code: 'export const manifest = undefined;\n',
		},
		{
			id: runtimeId,
			kind: 'runtime-entry',
			ownerModuleId: input.filename,
			code: [
				'export const runtimePlan = {',
				`  ownerModuleId: ${JSON.stringify(input.filename)},`,
				`  revision: ${input.revision},`,
				`  sourceFingerprint: ${JSON.stringify(input.sourceFingerprint)},`,
				'  browserResumeImplemented: false,',
				'};',
				'',
			].join('\n'),
		},
	];
}

function withManifestVirtualModule(
	virtualModules: ReadonlyArray<PipelineVirtualModuleRecord>,
	manifest: PipelineManifest,
): PipelineVirtualModuleRecord[] {
	return virtualModules.map((module) => {
		if (module.kind !== 'manifest') return module;

		return {
			...module,
			code: `export const manifest = ${JSON.stringify(manifest, null, 2)};\n`,
		};
	});
}

function transformedModuleCode(
	filename: string,
	virtualModules: ReadonlyArray<PipelineVirtualModuleRecord>,
): string {
	const resolver = requiredVirtualModule(virtualModules, 'symbol-resolver');
	const manifest = requiredVirtualModule(virtualModules, 'manifest');
	const runtime = requiredVirtualModule(virtualModules, 'runtime-entry');

	return [
		'/* markless TSRX transform */',
		`import { loadSymbol as __asyncLoadSymbol } from ${JSON.stringify(resolver.id)};`,
		`import { manifest as __asyncManifest } from ${JSON.stringify(manifest.id)};`,
		`import { runtimePlan as __asyncRuntimePlan } from ${JSON.stringify(runtime.id)};`,
		'',
		'export const __markless_pipeline = {',
		`  moduleId: ${JSON.stringify(filename)},`,
		'  manifest: __asyncManifest,',
		'  runtime: __asyncRuntimePlan,',
		'  loadSymbol: __asyncLoadSymbol,',
		'};',
		'',
		'export default __markless_pipeline;',
		'',
	].join('\n');
}

function symbolResolverCode(symbolIds: ReadonlyArray<string>): string {
	const cases = symbolIds.map((symbolId, index) =>
		[
			`    case ${JSON.stringify(symbolId)}:`,
			`      return import(${JSON.stringify(`/assets/async-symbol-${index}.js`)});`,
		].join('\n'),
	);

	return [
		`export const symbolIds = ${JSON.stringify(symbolIds, null, 2)};`,
		'',
		'export function loadSymbol(id) {',
		'  switch (id) {',
		...cases,
		'    default:',
		'      return Promise.reject(new Error(`Unknown async symbol ${id}`));',
		'  }',
		'}',
		'',
	].join('\n');
}

function requiredVirtualModule(
	virtualModules: ReadonlyArray<PipelineVirtualModuleRecord>,
	kind: PipelineVirtualModuleRecord['kind'],
): PipelineVirtualModuleRecord {
	const module = virtualModules.find((candidate) => candidate.kind === kind);

	if (!module) {
		throw new Error(`Missing bundler pipeline virtual module ${kind}`);
	}

	return module;
}

function stableModuleSlug(filename: string): string {
	return encodeURIComponent(filename).replaceAll('%', '_').replaceAll('.', '_');
}

function unique(values: ReadonlyArray<string>): string[] {
	return [...new Set(values)];
}

import type { CompilerPassDefinition } from './artifacts.ts';

export const defaultCompilerPasses: ReadonlyArray<CompilerPassDefinition> = [
	{
		passId: 'tsrx-semantic-graph',
		description: 'Build the TSRX semantic graph artifact from source.',
		consumes: ['source'],
		produces: ['semanticGraph'],
	},
	{
		passId: 'state-lowering',
		description: 'Lower graph state reads and writes into state access artifacts.',
		consumes: ['semanticGraph'],
		produces: ['stateLowering'],
	},
	{
		passId: 'payload-arena',
		description: 'Plan state and view payload arenas from semantic and state artifacts.',
		consumes: ['semanticGraph', 'stateLowering'],
		produces: ['payloadArena'],
	},
	{
		passId: 'symbol-resolver',
		description: 'Plan lazy symbols and sync policy records for the generated resolver.',
		consumes: ['semanticGraph', 'stateLowering', 'payloadArena'],
		produces: ['symbolResolver'],
	},
	{
		passId: 'render-data',
		description: 'Derive native markup chunks and dynamic residue from the semantic graph.',
		consumes: ['semanticGraph', 'symbolResolver'],
		produces: ['renderData'],
	},
	{
		passId: 'public-render-plan',
		description: 'Plan compiler-proven direct DOM artifacts for public render().',
		consumes: ['source', 'semanticGraph', 'payloadArena', 'symbolResolver'],
		produces: ['publicRenderPlan'],
	},
	{
		passId: 'capture-analysis',
		description: 'Analyze extracted symbol sources for resumable capture eligibility.',
		consumes: ['semanticGraph', 'symbolResolver', 'symbols'],
		produces: ['captureAnalysis'],
	},
	{
		passId: 'protocol-state',
		description: 'Create the serializable protocol state payload.',
		consumes: ['semanticGraph', 'payloadArena'],
		produces: ['protocolState'],
	},
	{
		passId: 'protocol-view',
		description: 'Create the protocol view payload with symbol IDs wired to view records.',
		consumes: ['payloadArena', 'symbolResolver', 'renderData', 'captureAnalysis'],
		produces: ['protocolView'],
	},
	{
		passId: 'public-render-module',
		description:
			'Emit public render component factories from compiler-proven render artifacts.',
		consumes: [
			'source',
			'semanticGraph',
			'renderData',
			'publicRenderPlan',
			'symbolResolver',
			'captureAnalysis',
			'protocolState',
			'protocolView',
		],
		produces: ['publicRenderModule'],
	},
	{
		passId: 'payload-scripts',
		description: 'Render markless/state and markless/view data scripts.',
		consumes: ['protocolState', 'protocolView'],
		produces: ['payloadScripts'],
	},
	{
		passId: 'symbol-modules',
		description: 'Emit lazy symbol module sources for planned symbols.',
		consumes: [
			'source',
			'semanticGraph',
			'symbolResolver',
			'captureAnalysis',
			'renderData',
			'publicRenderPlan',
		],
		produces: ['symbolModules'],
	},
	{
		passId: 'runtime-demand-map',
		description: 'Map emitted symbols and payload records to exact runtime module demands.',
		consumes: [
			'symbolResolver',
			'captureAnalysis',
			'symbolModules',
			'publicRenderModule',
			'protocolState',
			'protocolView',
		],
		produces: ['runtimeDemandMap', 'runtimeDemandMaps'],
	},
	{
		passId: 'trigger-groups',
		description: 'Close each delegated trigger over its exact state, record, and symbol group.',
		consumes: ['symbolResolver', 'protocolState', 'protocolView', 'runtimeDemandMap'],
		produces: ['triggerGroups'],
	},
	{
		passId: 'symbol-resolver-module',
		description: 'Emit the generated symbol resolver module that owns dynamic imports.',
		consumes: ['symbolResolverModuleInput'],
		produces: ['symbolResolverModule', 'symbolResolverModuleManifest'],
	},
];

// Link passes run across modules once the bundler has a module graph, so they
// are not part of the per-module `defaultCompilerPasses` pipeline.
export const linkCompilerPasses: ReadonlyArray<CompilerPassDefinition> = [
	{
		passId: 'execution-attribution',
		description: 'Flatten linked module manifests into per-route execution scope tables.',
		consumes: ['moduleManifests', 'childTable'],
		produces: ['executionAttribution'],
	},
];

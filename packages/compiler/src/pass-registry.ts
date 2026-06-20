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
		passId: 'capture-analysis',
		description: 'Analyze extracted symbol sources for resumable capture eligibility.',
		consumes: ['semanticGraph', 'symbolResolver'],
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
		consumes: ['payloadArena', 'symbolResolver'],
		produces: ['protocolView'],
	},
	{
		passId: 'payload-scripts',
		description: 'Render arcade/state and arcade/view data scripts and the render shell.',
		consumes: ['protocolState', 'protocolView'],
		produces: ['payloadScripts', 'renderShell'],
	},
	{
		passId: 'client-event-only-entry',
		description: 'Emit the generated client event-only render entry for simple CSR modules.',
		consumes: ['source', 'semanticGraph', 'symbolResolver'],
		produces: ['clientEventOnlyEntry'],
	},
	{
		passId: 'symbol-modules',
		description: 'Emit lazy symbol module sources for planned symbols.',
		consumes: ['symbolResolver', 'captureAnalysis'],
		produces: ['symbolModules'],
	},
	{
		passId: 'symbol-resolver-module',
		description: 'Emit the generated symbol resolver module that owns dynamic imports.',
		consumes: ['symbolResolverModuleInput'],
		produces: ['symbolResolverModule', 'symbolResolverModuleManifest'],
	},
];

export type PipelineSourceKind = 'tsrx';

export type PipelineVirtualModuleKind = 'symbol-resolver' | 'manifest' | 'runtime-entry';

export type PipelineChunkKind = 'app' | 'symbol' | 'runtime';

export type PipelineChunkOwner =
	| 'app-module'
	| 'generated-symbol-resolver'
	| 'runtime-resume-entry';

export type PipelineRelationshipKind =
	| 'owns-symbols'
	| 'uses-runtime'
	| 'describes-manifest'
	| 'emits-chunk';

export type PipelineReceiptStage =
	| 'compiler-transform'
	| 'rolldown-transform'
	| 'virtual-module-load'
	| 'vite-transform'
	| 'hmr-update'
	| 'page-load'
	| 'resume-graph-read'
	| 'delegated-event-dispatch'
	| 'sync-policy-evaluate'
	| 'lazy-symbol-load'
	| 'graph-write'
	| 'dom-journal-apply';

export type PipelineReceipt = {
	readonly stage: PipelineReceiptStage;
	readonly moduleId: string;
	readonly inspectable: true;
	readonly summary: string;
	readonly details: Readonly<Record<string, unknown>>;
};

export type PipelineVirtualModuleRecord = {
	readonly id: string;
	readonly kind: PipelineVirtualModuleKind;
	readonly ownerModuleId: string;
	readonly code: string;
};

export type PipelineEmittedChunkRecord = {
	readonly id: string;
	readonly kind: PipelineChunkKind;
	readonly owner: PipelineChunkOwner;
	readonly moduleIds: ReadonlyArray<string>;
};

export type PipelineTransformedModuleRecord = {
	readonly id: string;
	readonly sourceKind: PipelineSourceKind;
	readonly sourceFingerprint: string;
	readonly virtualModuleIds: ReadonlyArray<string>;
	readonly chunkIds: ReadonlyArray<string>;
	readonly symbolIds: ReadonlyArray<string>;
	readonly eventNames: ReadonlyArray<string>;
};

export type PipelineRelationshipRecord = {
	readonly from: string;
	readonly to: string;
	readonly relationship: PipelineRelationshipKind;
};

export type PipelineManifest = {
	readonly protocol: 'arcade-pipeline-poc';
	readonly revision: number;
	readonly transformedModules: ReadonlyArray<PipelineTransformedModuleRecord>;
	readonly virtualModules: ReadonlyArray<Omit<PipelineVirtualModuleRecord, 'code'>>;
	readonly emittedChunks: ReadonlyArray<PipelineEmittedChunkRecord>;
	readonly relationships: ReadonlyArray<PipelineRelationshipRecord>;
};

export type PipelineTransformConstraints = {
	readonly usesHydration: false;
	readonly usesVdom: false;
	readonly sharedCodeUsesNodeApis: false;
	readonly buildTooling: 'vite-rolldown-vite-plus';
};

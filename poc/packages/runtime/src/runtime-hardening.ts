export type RuntimeHardeningReceipt = {
	readonly stage:
		| 'async-request'
		| 'async-commit'
		| 'async-stale-ignore'
		| 'keyed-move'
		| 'cleanup-run'
		| 'handler-error'
		| 'graph-write'
		| 'dom-journal-apply';
	readonly inspectable: true;
	readonly summary: string;
	readonly details: Readonly<Record<string, unknown>>;
};

export type RuntimeHardeningGraphState = {
	readonly committed: number;
	readonly message: string;
	readonly failNext: boolean;
};

export type RuntimeHardeningPreview = {
	readonly id: string;
	readonly title: string;
	readonly version: number;
};

export type RuntimeHardeningPreviewRequest = {
	readonly requestId: string;
	readonly id: string;
	readonly version: number;
};

export type RuntimeHardeningJournalEntry =
	| {
			readonly kind: 'setText';
			readonly targetId: string;
			readonly value: string;
	  }
	| {
			readonly kind: 'moveRange';
			readonly key: string;
			readonly beforeKey: string;
	  }
	| {
			readonly kind: 'removeRange';
			readonly key: string;
	  }
	| {
			readonly kind: 'runCleanup';
			readonly key: string;
			readonly count: number;
	  }
	| {
			readonly kind: 'errorRecord';
			readonly code: 'ARCADE_RUNTIME_HANDLER_THROW';
			readonly message: string;
			readonly committedWritesPreserved: true;
	  };

export type RuntimeHardeningErrorRecord = {
	readonly code: 'ARCADE_RUNTIME_HANDLER_THROW';
	readonly message: string;
	readonly committedWritesPreserved: true;
};

export type RuntimeHardeningPoc = {
	readonly requestPreview: (id: string) => RuntimeHardeningPreviewRequest;
	readonly resolvePreview: (
		requestId: string,
		value: { readonly id: string; readonly title: string },
	) => Promise<'committed' | 'ignored'>;
	readonly preview: () => RuntimeHardeningPreview | null;
	readonly itemIdentity: (key: string) => object | undefined;
	readonly moveBefore: (key: string, beforeKey: string) => void;
	readonly removeKey: (key: string) => void;
	readonly cleanupCount: (key: string) => number;
	readonly commitThenThrow: () => RuntimeHardeningErrorRecord;
	readonly graph: () => RuntimeHardeningGraphState;
	readonly journal: () => ReadonlyArray<RuntimeHardeningJournalEntry>;
	readonly receipts: () => ReadonlyArray<RuntimeHardeningReceipt>;
	readonly constraints: () => {
		readonly usesHydration: false;
		readonly usesVdom: false;
		readonly productionBrowserResume: false;
	};
};

type ItemRecord = {
	readonly key: string;
	readonly title: string;
	cleanupRuns: number;
	removed: boolean;
};

type MutableRuntimeState = {
	committed: number;
	message: string;
	failNext: boolean;
};

export function createRuntimeHardeningPoc(): RuntimeHardeningPoc {
	const state: MutableRuntimeState = {
		committed: 0,
		message: 'idle',
		failNext: true,
	};
	const items: ItemRecord[] = [
		{ key: 'alpha', title: 'Alpha', cleanupRuns: 0, removed: false },
		{ key: 'beta', title: 'Beta', cleanupRuns: 0, removed: false },
		{ key: 'gamma', title: 'Gamma', cleanupRuns: 0, removed: false },
	];
	const requests = new Map<string, RuntimeHardeningPreviewRequest>();
	const journal: RuntimeHardeningJournalEntry[] = [];
	const receipts: RuntimeHardeningReceipt[] = [];
	let currentVersion = 0;
	let currentPreview: RuntimeHardeningPreview | null = null;

	return {
		requestPreview(id) {
			currentVersion++;
			const request = {
				requestId: `preview:${currentVersion}:${id}`,
				id,
				version: currentVersion,
			};
			requests.set(request.requestId, request);
			receipts.push(
				receipt('async-request', {
					requestId: request.requestId,
					id,
					version: request.version,
				}),
			);
			return request;
		},
		async resolvePreview(requestId, value) {
			const request = requests.get(requestId);
			if (!request) {
				throw new Error(`Unknown preview request ${requestId}`);
			}

			if (request.version < currentVersion) {
				receipts.push(
					receipt('async-stale-ignore', {
						requestId,
						requestVersion: request.version,
						currentVersion,
					}),
				);
				return 'ignored';
			}

			currentPreview = {
				id: value.id,
				title: value.title,
				version: request.version,
			};
			receipts.push(
				receipt('async-commit', {
					requestId,
					version: request.version,
					id: value.id,
				}),
			);
			appendJournal(journal, receipts, {
				kind: 'setText',
				targetId: 'preview-title',
				value: value.title,
			});
			return 'committed';
		},
		preview() {
			return currentPreview;
		},
		itemIdentity(key) {
			return items.find((item) => item.key === key && !item.removed);
		},
		moveBefore(key, beforeKey) {
			const from = items.findIndex((item) => item.key === key && !item.removed);
			const to = items.findIndex((item) => item.key === beforeKey && !item.removed);
			if (from < 0 || to < 0 || from === to) return;

			const [item] = items.splice(from, 1);
			const nextTo = items.findIndex((candidate) => candidate.key === beforeKey);
			items.splice(nextTo, 0, item);
			appendJournal(
				journal,
				receipts,
				{
					kind: 'moveRange',
					key,
					beforeKey,
				},
				'keyed-move',
			);
		},
		removeKey(key) {
			const item = items.find((candidate) => candidate.key === key);
			if (!item || item.removed) return;

			item.removed = true;
			if (item.cleanupRuns === 0) {
				item.cleanupRuns++;
				appendJournal(
					journal,
					receipts,
					{
						kind: 'runCleanup',
						key,
						count: item.cleanupRuns,
					},
					'cleanup-run',
				);
			}

			appendJournal(journal, receipts, {
				kind: 'removeRange',
				key,
			});
		},
		cleanupCount(key) {
			return items.find((item) => item.key === key)?.cleanupRuns ?? 0;
		},
		commitThenThrow() {
			state.committed++;
			state.message = 'committed-before-error';
			state.failNext = false;
			receipts.push(
				receipt('graph-write', {
					path: 'journal.committed',
					value: state.committed,
				}),
			);
			receipts.push(
				receipt('graph-write', {
					path: 'journal.message',
					value: state.message,
				}),
			);

			const error = {
				code: 'ARCADE_RUNTIME_HANDLER_THROW',
				message: 'after committed graph writes',
				committedWritesPreserved: true,
			} as const;
			appendJournal(
				journal,
				receipts,
				{
					kind: 'errorRecord',
					...error,
				},
				'handler-error',
			);
			return error;
		},
		graph() {
			return { ...state };
		},
		journal() {
			return [...journal];
		},
		receipts() {
			return [...receipts];
		},
		constraints() {
			return {
				usesHydration: false,
				usesVdom: false,
				productionBrowserResume: false,
			};
		},
	};
}

function appendJournal(
	journal: RuntimeHardeningJournalEntry[],
	receipts: RuntimeHardeningReceipt[],
	entry: RuntimeHardeningJournalEntry,
	stage: RuntimeHardeningReceipt['stage'] = 'dom-journal-apply',
): void {
	journal.push(entry);
	receipts.push(receipt(stage, entry));
	if (stage !== 'dom-journal-apply') {
		receipts.push(receipt('dom-journal-apply', entry));
	}
}

function receipt(
	stage: RuntimeHardeningReceipt['stage'],
	details: Readonly<Record<string, unknown>>,
): RuntimeHardeningReceipt {
	return {
		stage,
		inspectable: true,
		summary: runtimeHardeningSummary(stage),
		details,
	};
}

function runtimeHardeningSummary(stage: RuntimeHardeningReceipt['stage']): string {
	switch (stage) {
		case 'async-request':
			return 'Runtime hardening POC started a versioned async request.';
		case 'async-commit':
			return 'Runtime hardening POC committed the newest async request.';
		case 'async-stale-ignore':
			return 'Runtime hardening POC ignored a stale async completion.';
		case 'keyed-move':
			return 'Runtime hardening POC moved a keyed range without replacing identity.';
		case 'cleanup-run':
			return 'Runtime hardening POC ran behavior cleanup for a removed keyed range.';
		case 'handler-error':
			return 'Runtime hardening POC routed a thrown handler error without rollback.';
		case 'graph-write':
			return 'Runtime hardening POC committed a graph write.';
		case 'dom-journal-apply':
			return 'Runtime hardening POC applied a concrete DOM journal record.';
	}
}

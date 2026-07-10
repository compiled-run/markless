export type AnalyzerInvariantId =
	| 'BQA-I1-CONSOLE'
	| 'BQA-I2-NETWORK'
	| 'BQA-I3-BOUNDARY-MISSING'
	| 'BQA-I3-PENDING-TIMEOUT'
	| 'BQA-I3-REJECTED'
	| 'BQA-I4-WIRING-MISSING'
	| 'BQA-I4-UNCLASSIFIED'
	| 'BQA-I5-BOOTSTRAP-BUDGET'
	| 'BQA-I5-ACTION-BUDGET';

export interface AnalyzerInvariantResult {
	readonly id: AnalyzerInvariantId;
	readonly status: 'pass' | 'fail' | 'not-run';
	readonly details: readonly string[];
}

export interface AnalyzerKnownAuditResult {
	readonly id: string;
	readonly invariantId: 'BQA-I4-WIRING-MISSING' | 'BQA-I4-UNCLASSIFIED';
	readonly details: readonly string[];
}

export interface AnalyzerRequestRecord {
	readonly method: string;
	readonly url: string;
	readonly resourceType: string;
	readonly classification: 'document' | 'asset' | 'declared-api' | 'violation' | 'leaked';
	readonly status: number | null;
}

export interface AnalyzerActionReport {
	readonly routeFile: string;
	readonly fixtureUrlId: string;
	readonly actionId: 'bootstrap' | string;
	readonly startedAt: string;
	readonly durationMs: number;
	readonly console: readonly { source: 'console.error' | 'pageerror'; text: string }[];
	readonly requests: readonly AnalyzerRequestRecord[];
	readonly executedBytes: number;
	readonly invariants: readonly AnalyzerInvariantResult[];
	readonly knownAudit: readonly AnalyzerKnownAuditResult[];
}

export interface AnalyzerReportV1 {
	readonly version: 1;
	readonly build: { debugEnabled: boolean; marklessSha: string; artifactHash: string };
	readonly actions: readonly AnalyzerActionReport[];
	readonly passed: boolean;
}

export interface AnalyzerFaultReceiptV1 {
	readonly version: 1;
	readonly mode: 'fault';
	readonly passed: false;
	readonly invariants: readonly AnalyzerInvariantResult[];
}

export type PendingPolicy =
	| { readonly allow: false }
	| {
			readonly allow: true;
			readonly boundaryIds: readonly string[];
			readonly maxAgeMs: number;
			readonly reason: string;
	  };

export interface MatrixApiContract {
	readonly id: string;
	readonly phase: 'bootstrap' | 'action';
	readonly actionId?: string;
	readonly method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	readonly path: string;
	readonly required?: boolean;
}

export interface MatrixAction {
	readonly id: string;
	readonly fixtureUrlId: string;
	readonly safety: 'safe' | 'mutating';
	readonly defaultCrawl: boolean;
	readonly locator: {
		readonly kind: 'testId' | 'role' | 'css';
		readonly value: string;
		readonly name?: string;
	};
	readonly operation: 'click' | 'fill' | 'select' | 'press';
	readonly value?: string;
	readonly expectedEventTypes: readonly string[];
	readonly expectedInteraction:
		| 'inline-resumer'
		| 'resume-record'
		| 'row-record'
		| 'direct-csr'
		| 'router-delegation'
		| 'native';
	readonly apiContractIds: readonly string[];
	readonly setupActionIds?: readonly string[];
	readonly pendingPolicy: PendingPolicy;
	readonly expectedRejectedBoundaryIds: readonly string[];
	readonly reset: { readonly mode: 'none' | 'fresh-fixture'; readonly reason?: string };
}

export interface MatrixRoute {
	readonly routeFile: string;
	readonly fixtureUrls: readonly { readonly id: string; readonly url: string }[];
	readonly apiContracts: readonly MatrixApiContract[];
	readonly actions: readonly MatrixAction[];
	readonly bootstrapPendingPolicy: PendingPolicy;
	readonly bootstrapExpectedRejectedBoundaryIds: readonly string[];
	readonly resetRequirements: {
		readonly beforeRoute: 'fresh-fixture' | 'reuse-read-only-fixture';
		readonly beforeEachAction: 'fresh-browser-context' | 'fresh-fixture';
		readonly afterMutatingAction: 'discard-fixture';
	};
	readonly ownerNotes?: readonly string[];
}

export interface RouteActionMatrix {
	readonly schemaVersion: 1;
	readonly routes: readonly MatrixRoute[];
}

export interface CandidateRecord {
	readonly documentIndex: number;
	readonly tagName: string;
	readonly identity: string;
	readonly classification: string;
	readonly details: readonly string[];
	readonly expectedEvents: readonly string[];
	readonly explanations: Readonly<Record<string, { readonly kind: string }>>;
	readonly knownAuditId?: string;
	readonly violations: readonly AnalyzerInvariantResult[];
}

export interface AnalyzerCandidateActionReport extends AnalyzerActionReport {
	readonly candidates: readonly CandidateRecord[];
}

export interface AnalyzerCandidateInventoryReport extends AnalyzerReportV1 {
	readonly actions: readonly AnalyzerCandidateActionReport[];
	readonly knownAuditItems: readonly AnalyzerKnownAuditItem[];
}

export interface AnalyzerKnownAuditItem {
	readonly id: string;
	readonly routeFile: string;
	readonly selector: string;
	readonly source: string;
	readonly description: string;
	readonly status: 'known-unwired';
}

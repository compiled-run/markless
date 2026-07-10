import type {
	AnalyzerCandidateActionReport,
	AnalyzerInvariantResult,
	AnalyzerKnownAuditResult,
	PendingPolicy,
} from './contracts.ts';

export const QA_LIVENESS_DEADLINE_MS = 5_000;

export interface BoundarySnapshot {
	readonly boundaryId: string;
	readonly readIndex: number;
	readonly graphNodeId: string;
	readonly status: 'pending' | 'fulfilled' | 'rejected' | 'missing';
	readonly runVersion: number | null;
	readonly pendingSince: number | null;
	readonly hasSettledContent: boolean;
	readonly missingReason?: 'graph-read-missing' | 'snapshot-invalid';
}

export function evaluateBoundaries(
	boundaries: readonly BoundarySnapshot[],
	now: number,
	pendingPolicy: PendingPolicy,
	expectedRejectedBoundaryIds: readonly string[],
): { settled: boolean; results: AnalyzerInvariantResult[] } {
	const expectedRejected = new Set(expectedRejectedBoundaryIds);
	const allowedPending = new Set(pendingPolicy.allow ? pendingPolicy.boundaryIds : []);
	const details = new Map<AnalyzerInvariantResult['id'], string[]>();
	let settled = true;
	const fail = (id: AnalyzerInvariantResult['id'], detail: string) =>
		details.set(id, [...(details.get(id) ?? []), detail]);
	for (const boundary of boundaries) {
		const name = `${boundary.boundaryId}[${boundary.readIndex}]`;
		if (boundary.status === 'missing')
			fail('BQA-I3-BOUNDARY-MISSING', `${name}: ${boundary.missingReason ?? 'missing'}`);
		else if (boundary.status === 'rejected' && !expectedRejected.has(boundary.boundaryId))
			fail(
				'BQA-I3-REJECTED',
				`${name}: rejected run version ${boundary.runVersion ?? 'unknown'}`,
			);
		else if (boundary.status === 'pending') {
			const age =
				boundary.pendingSince === null
					? QA_LIVENESS_DEADLINE_MS
					: now - boundary.pendingSince;
			if (pendingPolicy.allow && allowedPending.has(boundary.boundaryId)) {
				if (age > pendingPolicy.maxAgeMs)
					fail(
						'BQA-I3-PENDING-TIMEOUT',
						`${name}: pending ${age}ms exceeds bounded allowance ${pendingPolicy.maxAgeMs}ms (${pendingPolicy.reason})`,
					);
			} else if (age >= QA_LIVENESS_DEADLINE_MS)
				fail(
					'BQA-I3-PENDING-TIMEOUT',
					`${name}: pending ${age}ms (deadline ${QA_LIVENESS_DEADLINE_MS}ms)`,
				);
			else settled = false;
		}
	}
	return {
		settled,
		results: [...details].map(([id, entries]) => ({ id, status: 'fail', details: entries })),
	};
}

export interface SemanticCandidate {
	readonly identity: string;
	readonly classification: string;
	readonly expectedEvents: readonly string[];
	readonly explanations: Readonly<Record<string, { readonly kind: string }>>;
}

export function evaluateCandidate(candidate: SemanticCandidate): AnalyzerInvariantResult[] {
	const fail = (id: 'BQA-I4-WIRING-MISSING' | 'BQA-I4-UNCLASSIFIED', detail: string) => [
		{ id, status: 'fail' as const, details: [`${candidate.identity}: ${detail}`] },
	];
	if (candidate.classification === 'unknown-focusable')
		return fail(
			'BQA-I4-UNCLASSIFIED',
			'focusable element has no recognized native or ARIA semantics',
		);
	if (candidate.classification === 'aria-widget' && candidate.expectedEvents.length === 0)
		return fail('BQA-I4-UNCLASSIFIED', 'ARIA widget has no matrix-declared event');
	if (candidate.classification === 'invalid-anchor')
		return fail('BQA-I4-WIRING-MISSING', 'anchor destination is empty or unparsable');
	const requiredEvents =
		candidate.classification === 'button' || candidate.classification === 'markless-link'
			? ['click']
			: candidate.expectedEvents;
	for (const eventName of requiredEvents) {
		const kind = candidate.explanations[eventName]?.kind ?? 'none';
		if (candidate.classification === 'markless-link' && kind !== 'router-delegation')
			return fail(
				'BQA-I4-WIRING-MISSING',
				`${eventName} requires router-delegation; received ${kind}`,
			);
		if (kind === 'none')
			return fail('BQA-I4-WIRING-MISSING', `${eventName} has no framework registration`);
	}
	return [];
}

export function candidateInvariantReport(
	candidates: readonly {
		readonly knownAuditId?: string;
		readonly violations: readonly AnalyzerInvariantResult[];
	}[],
): { results: AnalyzerInvariantResult[]; knownAudit: AnalyzerKnownAuditResult[] } {
	const ids = ['BQA-I4-WIRING-MISSING', 'BQA-I4-UNCLASSIFIED'] as const;
	const knownAudit: AnalyzerKnownAuditResult[] = [];
	const results = ids.map((id): AnalyzerInvariantResult => {
		const details: string[] = [];
		let blocking = false;
		for (const candidate of candidates)
			for (const entry of candidate.violations.filter((item) => item.id === id)) {
				if (!candidate.knownAuditId) {
					blocking = true;
					details.push(...entry.details);
					continue;
				}
				const tagged = entry.details.map(
					(detail) => `[known-audit:${candidate.knownAuditId}] ${detail}`,
				);
				details.push(...tagged);
				knownAudit.push({ id: candidate.knownAuditId, invariantId: id, details: tagged });
			}
		return { id, status: blocking ? 'fail' : 'pass', details };
	});
	return { results, knownAudit };
}

export interface AnalyzerBudgets {
	readonly bootstrapCeilingBytes: number;
	readonly actionCeilingBytes: number;
}

export function compareExecutedBytes(
	actionId: string,
	executedBytes: number,
	budgets: AnalyzerBudgets,
): AnalyzerInvariantResult {
	const bootstrap = actionId === 'bootstrap';
	const ceiling = bootstrap ? budgets.bootstrapCeilingBytes : budgets.actionCeilingBytes;
	return {
		id: bootstrap ? 'BQA-I5-BOOTSTRAP-BUDGET' : 'BQA-I5-ACTION-BUDGET',
		status: executedBytes <= ceiling ? 'pass' : 'fail',
		details: [`${executedBytes} executed bytes; QA-build regression ceiling ${ceiling}`],
	};
}

export function evaluateActionInvariants(input: {
	readonly actionId: string;
	readonly consoleEntries: readonly { source: string; text: string }[];
	readonly requests: AnalyzerCandidateActionReport['requests'];
	readonly executedBytes: number;
	readonly boundaryResults: readonly AnalyzerInvariantResult[];
	readonly candidates: AnalyzerCandidateActionReport['candidates'];
	readonly budgets: AnalyzerBudgets;
	readonly networkDetails?: readonly string[];
}): Pick<AnalyzerCandidateActionReport, 'invariants' | 'knownAudit'> {
	const result = (
		id: AnalyzerInvariantResult['id'],
		details: readonly string[],
	): AnalyzerInvariantResult => ({ id, status: details.length ? 'fail' : 'pass', details });
	const boundaryDetails = (id: AnalyzerInvariantResult['id']) =>
		input.boundaryResults.filter((entry) => entry.id === id).flatMap((entry) => entry.details);
	const requestFailures = input.requests.filter(
		(entry) => entry.classification === 'violation' || entry.classification === 'leaked',
	);
	const candidateReport = candidateInvariantReport(input.candidates);
	return {
		knownAudit: candidateReport.knownAudit,
		invariants: [
			result(
				'BQA-I1-CONSOLE',
				input.consoleEntries.map((entry) => `${entry.source}: ${entry.text}`),
			),
			result('BQA-I2-NETWORK', [
				...(input.networkDetails ?? []),
				...requestFailures.map(
					(entry) =>
						`${entry.classification}: ${entry.method} ${entry.url} (${entry.status ?? 'no response'})`,
				),
			]),
			result('BQA-I3-BOUNDARY-MISSING', boundaryDetails('BQA-I3-BOUNDARY-MISSING')),
			result('BQA-I3-PENDING-TIMEOUT', boundaryDetails('BQA-I3-PENDING-TIMEOUT')),
			result('BQA-I3-REJECTED', boundaryDetails('BQA-I3-REJECTED')),
			...candidateReport.results,
			compareExecutedBytes(input.actionId, input.executedBytes, input.budgets),
		],
	};
}

const POLICY_WIDGET_ROLES = [
	'button',
	'checkbox',
	'radio',
	'switch',
	'tab',
	'menuitem',
	'option',
	'slider',
	'spinbutton',
	'combobox',
];
export function classifyAnchorWithoutHref(
	hasHref: boolean,
	tabIndex: number,
	role: string | null,
): string | null {
	if (hasHref) return null;
	if (POLICY_WIDGET_ROLES.includes(role ?? '')) return 'aria-widget';
	return tabIndex >= 0 ? 'unknown-focusable' : 'excluded';
}

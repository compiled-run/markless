import type {
	MatrixAction,
	MatrixApiContract,
	MatrixRoute,
	PendingPolicy,
	RouteActionMatrix,
} from './contracts.ts';

const idPattern = /^[a-z0-9][a-z0-9-]*$/;
const routePattern = /^pages\/.+\.(?:tsrx|mdx)$/;
const methods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'];
const fail = (path: string, message: string): never => {
	throw new Error(`Route/action matrix schema violation at ${path}: ${message}`);
};
const record = (value: unknown, path: string): Record<string, unknown> => {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		fail(path, 'must be an object');
	return value as Record<string, unknown>;
};
const exactKeys = (
	value: Record<string, unknown>,
	path: string,
	required: readonly string[],
	optional: readonly string[] = [],
) => {
	for (const key of required) if (!(key in value)) fail(path, `missing required property ${key}`);
	const allowed = new Set([...required, ...optional]);
	for (const key of Object.keys(value))
		if (!allowed.has(key)) fail(path, `unknown property ${key}`);
};
const stringValue = (value: unknown, path: string, pattern?: RegExp): string => {
	if (typeof value !== 'string' || !value || (pattern && !pattern.test(value)))
		fail(path, 'must be a nonempty string matching its schema pattern');
	return value as string;
};
const array = (value: unknown, path: string, min = 0): unknown[] => {
	if (!Array.isArray(value) || value.length < min)
		fail(path, `must be an array with at least ${min} item(s)`);
	return value as unknown[];
};
const strings = (value: unknown, path: string, unique = true): string[] => {
	const result = array(value, path).map((entry, index) =>
		stringValue(entry, `${path}[${index}]`),
	);
	if (unique && new Set(result).size !== result.length) fail(path, 'must contain unique values');
	return result;
};
const oneOf = (value: unknown, choices: readonly unknown[], path: string) => {
	if (!choices.includes(value)) fail(path, `must be one of ${choices.join(', ')}`);
};

function pending(value: unknown, path: string): PendingPolicy {
	const item = record(value, path);
	if (item.allow === false) {
		exactKeys(item, path, ['allow']);
		return item as unknown as PendingPolicy;
	}
	exactKeys(item, path, ['allow', 'boundaryIds', 'maxAgeMs', 'reason']);
	if (item.allow !== true) fail(`${path}.allow`, 'must be boolean false or true');
	if (strings(item.boundaryIds, `${path}.boundaryIds`).length === 0)
		fail(`${path}.boundaryIds`, 'must not be empty');
	if (
		!Number.isInteger(item.maxAgeMs) ||
		Number(item.maxAgeMs) < 1 ||
		Number(item.maxAgeMs) > 5_000
	)
		fail(`${path}.maxAgeMs`, 'must be an integer from 1 through 5000');
	stringValue(item.reason, `${path}.reason`);
	return item as unknown as PendingPolicy;
}

function apiContract(value: unknown, path: string): MatrixApiContract {
	const item = record(value, path);
	exactKeys(item, path, ['id', 'phase', 'method', 'path'], ['actionId', 'required']);
	stringValue(item.id, `${path}.id`, idPattern);
	oneOf(item.phase, ['bootstrap', 'action'], `${path}.phase`);
	oneOf(item.method, methods, `${path}.method`);
	stringValue(item.path, `${path}.path`, /^\//);
	if (item.required !== undefined && typeof item.required !== 'boolean')
		fail(`${path}.required`, 'must be boolean');
	if (item.phase === 'action') stringValue(item.actionId, `${path}.actionId`, idPattern);
	return item as unknown as MatrixApiContract;
}

function action(value: unknown, path: string): MatrixAction {
	const item = record(value, path);
	exactKeys(
		item,
		path,
		[
			'id',
			'fixtureUrlId',
			'safety',
			'defaultCrawl',
			'locator',
			'operation',
			'expectedEventTypes',
			'expectedInteraction',
			'apiContractIds',
			'pendingPolicy',
			'expectedRejectedBoundaryIds',
			'reset',
		],
		['value', 'setupActionIds'],
	);
	stringValue(item.id, `${path}.id`, idPattern);
	stringValue(item.fixtureUrlId, `${path}.fixtureUrlId`);
	oneOf(item.safety, ['safe', 'mutating'], `${path}.safety`);
	if (typeof item.defaultCrawl !== 'boolean') fail(`${path}.defaultCrawl`, 'must be boolean');
	const locator = record(item.locator, `${path}.locator`);
	exactKeys(locator, `${path}.locator`, ['kind', 'value'], ['name']);
	oneOf(locator.kind, ['testId', 'role', 'css'], `${path}.locator.kind`);
	stringValue(locator.value, `${path}.locator.value`);
	if (locator.name !== undefined && typeof locator.name !== 'string')
		fail(`${path}.locator.name`, 'must be string');
	oneOf(item.operation, ['click', 'fill', 'select', 'press'], `${path}.operation`);
	if (
		['fill', 'select', 'press'].includes(String(item.operation)) &&
		typeof item.value !== 'string'
	)
		fail(`${path}.value`, `is required for ${item.operation}`);
	if (strings(item.expectedEventTypes, `${path}.expectedEventTypes`).length === 0)
		fail(`${path}.expectedEventTypes`, 'must not be empty');
	oneOf(
		item.expectedInteraction,
		[
			'inline-resumer',
			'resume-record',
			'row-record',
			'direct-csr',
			'router-delegation',
			'native',
		],
		`${path}.expectedInteraction`,
	);
	strings(item.apiContractIds, `${path}.apiContractIds`);
	if (item.setupActionIds !== undefined) strings(item.setupActionIds, `${path}.setupActionIds`);
	pending(item.pendingPolicy, `${path}.pendingPolicy`);
	strings(item.expectedRejectedBoundaryIds, `${path}.expectedRejectedBoundaryIds`);
	const reset = record(item.reset, `${path}.reset`);
	exactKeys(reset, `${path}.reset`, ['mode'], ['reason']);
	oneOf(reset.mode, ['none', 'fresh-fixture'], `${path}.reset.mode`);
	if (reset.reason !== undefined && typeof reset.reason !== 'string')
		fail(`${path}.reset.reason`, 'must be string');
	if (
		item.safety === 'mutating' &&
		(item.defaultCrawl !== false ||
			reset.mode !== 'fresh-fixture' ||
			typeof reset.reason !== 'string' ||
			!reset.reason)
	)
		fail(
			path,
			'mutating actions require defaultCrawl:false and fresh-fixture reset with a reason',
		);
	if (item.safety === 'safe' && item.defaultCrawl !== true)
		fail(path, 'safe seed actions must use defaultCrawl:true');
	return item as unknown as MatrixAction;
}

function route(value: unknown, path: string): MatrixRoute {
	const item = record(value, path);
	exactKeys(
		item,
		path,
		[
			'routeFile',
			'fixtureUrls',
			'apiContracts',
			'actions',
			'bootstrapPendingPolicy',
			'bootstrapExpectedRejectedBoundaryIds',
			'resetRequirements',
		],
		['ownerNotes'],
	);
	stringValue(item.routeFile, `${path}.routeFile`, routePattern);
	const fixtures = array(item.fixtureUrls, `${path}.fixtureUrls`, 1).map((entry, index) => {
		const fixture = record(entry, `${path}.fixtureUrls[${index}]`);
		exactKeys(fixture, `${path}.fixtureUrls[${index}]`, ['id', 'url']);
		stringValue(fixture.id, `${path}.fixtureUrls[${index}].id`, idPattern);
		stringValue(fixture.url, `${path}.fixtureUrls[${index}].url`, /^(?:\/#\/.*|\/$)/);
		return fixture as { id: string; url: string };
	});
	const contracts = array(item.apiContracts, `${path}.apiContracts`).map((entry, index) =>
		apiContract(entry, `${path}.apiContracts[${index}]`),
	);
	const actions = array(item.actions, `${path}.actions`).map((entry, index) =>
		action(entry, `${path}.actions[${index}]`),
	);
	for (const [items, name] of [
		[fixtures, 'fixtureUrls'],
		[contracts, 'apiContracts'],
		[actions, 'actions'],
	] as const)
		if (new Set(items.map(({ id }) => id)).size !== items.length)
			fail(`${path}.${name}`, 'contains duplicate IDs');
	const fixtureIds = new Set(fixtures.map(({ id }) => id));
	const contractById = new Map(contracts.map((entry) => [entry.id, entry]));
	const actionById = new Map(actions.map((entry) => [entry.id, entry]));
	for (const contract of contracts)
		if (contract.phase === 'action' && !actionById.has(contract.actionId ?? ''))
			fail(
				`${path}.apiContracts.${contract.id}.actionId`,
				`references missing action ${contract.actionId}`,
			);
	for (const entry of actions) {
		if (!fixtureIds.has(entry.fixtureUrlId))
			fail(
				`${path}.actions.${entry.id}.fixtureUrlId`,
				`references missing fixtureUrlId ${entry.fixtureUrlId}`,
			);
		for (const id of entry.apiContractIds) {
			const contract = contractById.get(id);
			if (!contract || contract.phase !== 'action' || contract.actionId !== entry.id)
				fail(
					`${path}.actions.${entry.id}.apiContractIds`,
					`invalid contract reference ${id}`,
				);
		}
		for (const id of entry.setupActionIds ?? [])
			if (!actionById.has(id))
				fail(`${path}.actions.${entry.id}.setupActionIds`, `missing action ${id}`);
	}
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (id: string): void => {
		if (visiting.has(id)) fail(`${path}.actions.${id}.setupActionIds`, 'contains a cycle');
		if (visited.has(id)) return;
		visiting.add(id);
		for (const dependency of actionById.get(id)?.setupActionIds ?? []) visit(dependency);
		visiting.delete(id);
		visited.add(id);
	};
	for (const id of actionById.keys()) visit(id);
	pending(item.bootstrapPendingPolicy, `${path}.bootstrapPendingPolicy`);
	strings(
		item.bootstrapExpectedRejectedBoundaryIds,
		`${path}.bootstrapExpectedRejectedBoundaryIds`,
	);
	const reset = record(item.resetRequirements, `${path}.resetRequirements`);
	exactKeys(reset, `${path}.resetRequirements`, [
		'beforeRoute',
		'beforeEachAction',
		'afterMutatingAction',
	]);
	oneOf(
		reset.beforeRoute,
		['fresh-fixture', 'reuse-read-only-fixture'],
		`${path}.resetRequirements.beforeRoute`,
	);
	oneOf(
		reset.beforeEachAction,
		['fresh-browser-context', 'fresh-fixture'],
		`${path}.resetRequirements.beforeEachAction`,
	);
	if (reset.afterMutatingAction !== 'discard-fixture')
		fail(`${path}.resetRequirements.afterMutatingAction`, 'must be discard-fixture');
	if (item.ownerNotes !== undefined) strings(item.ownerNotes, `${path}.ownerNotes`, false);
	return item as unknown as MatrixRoute;
}

export function validateMatrixDocument(value: unknown): RouteActionMatrix {
	const matrix = record(value, '$matrix');
	exactKeys(matrix, '$matrix', ['schemaVersion', 'routes']);
	if (matrix.schemaVersion !== 1) fail('$matrix.schemaVersion', 'must equal 1');
	const routes = array(matrix.routes, '$matrix.routes', 1).map((entry, index) =>
		route(entry, `$matrix.routes[${index}]`),
	);
	if (new Set(routes.map((entry) => entry.routeFile)).size !== routes.length)
		fail('$matrix.routes', 'contains duplicate routeFile values');
	return matrix as unknown as RouteActionMatrix;
}

export function assertMatrixFileSetEquality(
	matrix: RouteActionMatrix,
	routeFiles: readonly string[],
): void {
	const matrixFiles = matrix.routes.map((entry) => entry.routeFile).toSorted();
	const runtimeFiles = [...routeFiles].toSorted();
	if (JSON.stringify(matrixFiles) !== JSON.stringify(runtimeFiles)) {
		const missing = runtimeFiles.filter((file) => !matrixFiles.includes(file));
		const stale = matrixFiles.filter((file) => !runtimeFiles.includes(file));
		throw new Error(
			`Route/action matrix route-file mismatch; missing=[${missing.join(', ')}], stale=[${stale.join(', ')}]`,
		);
	}
}

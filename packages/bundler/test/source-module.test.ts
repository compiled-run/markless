import { expect, test } from 'vitest';
import { emitResumeModule, emitSourceModule } from '../src/source-module.ts';

const baseInput = {
	filename: '/workspace/app/src/App.tsrx',
	payloadId: 'virtual:markless:payload',
	resolverId: 'virtual:markless:resolver',
	environment: 'client' as const,
	clientOutput: 'full' as const,
	publicRenderModuleSource: '',
	publicRenderRootExportName: null,
	publicCsrModuleSource: '',
	publicRenderCsrExportName: null,
	publicSsrModuleSource: '',
	publicRenderSsrExportName: null,
	symbols: [{ id: 'symbol:click', chunk: './click.js', exportName: 'onClick' }],
	symbolRoutes: [],
};

test('emitSourceModule keeps full resume behind a dynamic handoff', () => {
	const code = emitSourceModule({
		...baseInput,
		needsFullResume: true,
	});

	expect(code).not.toContain(
		"import { resumeEventOnlyFromPayloadDocument } from '@markless/core/web/event-only-resume';",
	);
	expect(code).not.toContain('export async function resumeContainerEvent');
	expect(code).not.toContain("import('@markless/core/web/resume')");
	const resumeCode = emitResumeModule({
		...baseInput,
		needsFullResume: true,
	});
	expect(resumeCode).toContain('export async function resumeContainerEvent');
	expect(resumeCode).toContain("import('@markless/core/web/resume')");
	expect(code).not.toMatch(/^\s*const\s+marklessFullResumeModule\s*=\s*import\(/m);
	expect(code).not.toContain(
		"import { resumeFromPayloadDocument } from '@markless/core/web/resume';",
	);
});

test('emitResumeModule routes non-lean event-only entries through the full handoff', () => {
	const code = emitSourceModule({
		...baseInput,
		needsFullResume: false,
	});
	const resumeCode = emitResumeModule({
		...baseInput,
		needsFullResume: false,
	});

	expect(code).not.toContain('resumeEventOnlyFromPayloadDocument');
	expect(code).not.toContain('export async function resumeContainerEvent');
	expect(resumeCode).not.toContain('resumeEventOnlyFromPayloadDocument');
	expect(resumeCode).toContain("import('@markless/core/web/resume')");
	expect(resumeCode).toContain('export async function resumeContainerEvent');
	expect(code).not.toContain('loadFullResume: marklessFullResumeHandoff');
	expect(code).not.toContain("import('@markless/core/web/resume')");
	expect(code).not.toMatch(/^\s*const\s+marklessFullResumeModule\s*=\s*import\(/m);
	expect(code).not.toContain(
		"import { resumeFromPayloadDocument } from '@markless/core/web/resume';",
	);
});

test('emitResumeModule emits a specialized scalar dispatcher with resolved constants', () => {
	const resumeCode = emitResumeModule(scalarResumeInput());

	expect(resumeCode).toContain("from '@markless/web/fns/scalar-specialized';");
	expect(resumeCode).toContain("from '@markless/web/fns/write-scalar';");
	expect(resumeCode).toContain("from '@markless/web/fns/update-text';");
	expect(resumeCode).toContain('marklessScalarEventMatches(input, marklessFindElementAtDomOrderIndex(input.root, 3), "button", "click", "host:button")');
	expect(resumeCode).toContain('const eventTarget = input.event?.target;');
	expect(resumeCode).toContain('input.event?.type === eventName');
	expect(resumeCode).toContain('marklessFindElementAtDomOrderIndex(input.root, 3)');
	expect(resumeCode).toContain('marklessFindElementAtDomOrderIndex(input.root, 5)');
	expect(resumeCode).not.toContain('?? input.element ?? input.event.target');
	expect(resumeCode).toContain('payloadState.cells[0]');
	expect(resumeCode).toContain('marklessDecodeScalarCell(payloadState.cells[0], "state:count", "markless/state cell[0]")');
	expect(resumeCode).toContain('graphNodeId === "state:count"');
	expect(resumeCode).toContain('marklessUpdateText({ domUpdate: { hostNodeId: "host:label" }, value: "Count: " + (state.value == null ? \'\' : String(state.value)) }, "host:label").value');
	expect(resumeCode).toContain('loadSymbol("symbol:click")');
	expect(resumeCode).not.toContain('input.loadSymbol("symbol:click")');
	expect(resumeCode).not.toContain('@markless/web/event-only-lean/scalar-core');
	expect(resumeCode).not.toContain('@markless/web/event-only-lean/lean-shared');
	expect(resumeCode).not.toContain('@markless/web/event-only-lean/row');
	expect(resumeCode).not.toContain('@markless/web/inline/sync-policy-core');
	expect(resumeCode).not.toContain('payloadRuntimeDemandMap.actions.find');
	expect(resumeCode).not.toContain('payloadView.domUpdates.find');
	expect(resumeCode).not.toContain('resumeEventOnlyFromPayloadDocument');
	expect(resumeCode).not.toContain("import('@markless/core/web/resume')");
	expect(resumeCode).toContain('marklessScalarSpecializedHostMiss');
});

test('specialized scalar dispatcher accepts the real raw event entry shape', () => {
	const resumeCode = emitResumeModule(scalarResumeInput());

	expect(resumeCode).toContain('const eventTarget = input.event?.target;');
	expect(resumeCode).toContain('host === eventTarget');
	expect(resumeCode).toContain('host.contains(eventTarget)');
	expect(resumeCode).toContain('input.event?.type === eventName');
	expect(resumeCode).toContain('host.tagName.toLowerCase() !== tagName');
	expect(resumeCode).not.toContain('input.eventRecord');
});

test('emitResumeModule keeps row actions behind the row lean entry', () => {
	const resumeCode = emitResumeModule({
		...baseInput,
		runtimeDemandMap: {
			recordKinds: [
				{ kind: 'keyed-repeat', replaced: true },
				{ kind: 'dom-update', replaced: true },
			],
		},
	});

	expect(resumeCode).toContain(
		"const { resumeScalarRowEventFromPayloadDocument } = await import('@markless/web/event-only-lean/row');",
	);
	expect(resumeCode).not.toContain('@markless/web/event-only-lean/scalar-core');
	expect(resumeCode).not.toContain('resumeEventOnlyFromPayloadDocument');
});

test('emitResumeModule branches only for mixed scalar and row lean routes', () => {
	const resumeCode = emitResumeModule({
		...baseInput,
		runtimeDemandMap: {
			recordKinds: [
				{ kind: 'event', replaced: true },
				{ kind: 'keyed-repeat', replaced: true },
				{ kind: 'dom-update', replaced: true },
			],
		},
	});

	expect(resumeCode).toContain('if (marklessScalarSpecializedAction(input))');
	expect(resumeCode).toContain('marklessResumeSpecializedScalarEvent(input)');
	expect(resumeCode).not.toContain('@markless/web/event-only-lean/scalar-core');
	expect(resumeCode).toContain('@markless/web/event-only-lean/row');
	expect(resumeCode).not.toContain('resumeEventOnlyFromPayloadDocument');
});

test('emitResumeModule emits the execution log loader only when logging is enabled', () => {
	expect(emitResumeModule({ ...baseInput, executionLog: 'auto' })).toContain(
		'globalThis.__mxLoadLog ||= () => import("virtual:markless:dev-log");',
	);
	expect(emitResumeModule({ ...baseInput, executionLog: 'never' })).not.toContain(
		'virtual:markless:dev-log',
	);
});

test('emitSourceModule emits the CSR execution log loader only when logging is enabled', () => {
	expect(emitSourceModule({ ...baseInput, executionLog: 'auto' })).toContain(
		'globalThis.__mxLoadLog ||= () => import("virtual:markless:dev-log");',
	);
	expect(emitSourceModule({ ...baseInput, executionLog: 'never' })).not.toContain(
		'virtual:markless:dev-log',
	);
});

function scalarResumeInput() {
	return {
		...baseInput,
		payloadState: {
			cells: [{
				graphNodeId: 'state:count',
				name: 'count',
				valueKind: 'scalar',
				value: { version: 1, root: 0, records: [] },
			}],
			computed: [],
		},
		payloadView: {
			locators: [
				{ hostNodeId: 'host:button', index: 3, tagName: 'button' },
				{ hostNodeId: 'host:label', index: 5, tagName: 'output' },
			],
			events: [{ hostNodeId: 'host:button', eventName: 'click', symbolIds: ['symbol:click'] }],
			domUpdates: [{
				hostNodeId: 'host:label',
				graphNodeId: 'state:count',
				symbolId: 'symbol:text',
				target: { kind: 'text', prefix: 'Count: ' },
			}],
		},
		runtimeDemandMap: {
			recordKinds: [
				{ kind: 'event', replaced: true },
				{ kind: 'dom-update', replaced: true },
			],
			actions: [{
				hostNodeId: 'host:button',
				eventName: 'click',
				recordKind: 'event',
				recordKinds: ['event', 'dom-update'],
				payloadRecordIds: [],
				runtimeModuleIds: [],
				plan: {
					version: 1,
					kind: 'scalar',
					symbolId: 'symbol:click',
					cell: 'state:count',
					write: { kind: 'update', updateOperator: '++' },
					textUpdates: [{
						hostNodeId: 'host:label',
						graphNodeId: 'state:count',
						symbolId: 'symbol:text',
						prefix: 'Count: ',
					}],
				},
			}],
		},
	};
}

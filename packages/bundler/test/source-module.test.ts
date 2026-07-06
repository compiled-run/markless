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

test('emitResumeModule routes replaced scalar actions through the scalar resume entry', () => {
	const resumeCode = emitResumeModule({
		...baseInput,
		runtimeDemandMap: {
			recordKinds: [
				{ kind: 'event', replaced: true },
				{ kind: 'dom-update', replaced: true },
			],
		},
	});

	expect(resumeCode).toContain(
		"const { resumeScalarCoreEventFromPayloadDocument } = await import('@markless/web/event-only-lean/scalar-core');",
	);
	expect(resumeCode).not.toContain('@markless/web/event-only-lean/row');
	expect(resumeCode).not.toContain('resumeEventOnlyFromPayloadDocument');
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

	expect(resumeCode).toContain('if (input.eventRecord)');
	expect(resumeCode).toContain('@markless/web/event-only-lean/scalar-core');
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

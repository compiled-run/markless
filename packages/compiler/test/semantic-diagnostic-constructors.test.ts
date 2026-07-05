import { expect, test } from 'vitest';
import {
	asyncBoundaryRequiredDiagnostic,
	elementHandleRequiredDiagnostic,
	helperStateReturnUnsupportedDiagnostic,
} from '../src/passes/semantic-graph/diagnostics.ts';

test('semantic diagnostic constructors stay owned by the semantic graph pass', () => {
	expect(
		asyncBoundaryRequiredDiagnostic(
			{
				hostNodeId: 'h0',
				source: 'details.title',
				sourceSpan: {
					filename: 'src/App.tsrx',
					start: 10,
					end: 23,
				},
			},
			{
				id: 'computed:details',
				name: 'details',
				kind: 'computed',
				writable: false,
				async: true,
				asyncCapable: true,
			},
		),
	).toEqual(
		expect.objectContaining({
			code: 'MARKLESS_ASYNC_BOUNDARY_REQUIRED',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
		}),
	);

	expect(
		elementHandleRequiredDiagnostic(
			{
				hostNodeId: 'h1',
				handleName: 'input',
			},
			undefined,
		),
	).toEqual(
		expect.objectContaining({
			code: 'MARKLESS_ELEMENT_HANDLE_REQUIRED',
			elementLocator: 'h1',
		}),
	);
});

test('helper return gate wording describes only residual unsupported helper shapes', () => {
	const diagnostic = helperStateReturnUnsupportedDiagnostic({
		name: 'result',
		apiName: 'state',
		filename: 'src/App.tsrx',
		init: { type: 'CallExpression', start: 25, end: 33 } as never,
	});

	expect(diagnostic).toEqual(
		expect.objectContaining({
			code: 'MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED',
			title: 'Helper-created state return shape is not supported',
			message: expect.stringContaining('cannot connect this helper return shape'),
			why: expect.stringContaining('same-module direct helper returns and compiled imported helpers'),
		}),
	);
	expect(diagnostic.message).not.toContain('helper-created state is coming');
	expect(diagnostic.title).not.toContain('not supported yet');
});

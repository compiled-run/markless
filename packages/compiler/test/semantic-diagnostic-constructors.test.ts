import { expect, test } from 'vitest';
import {
	asyncBoundaryRequiredDiagnostic,
	elementHandleRequiredDiagnostic,
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
			code: 'ARCADE_ASYNC_BOUNDARY_REQUIRED',
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
			code: 'ARCADE_ELEMENT_HANDLE_REQUIRED',
			elementLocator: 'h1',
		}),
	);
});

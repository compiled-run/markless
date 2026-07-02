import { expect, test } from 'vitest';
import {
	collectAsyncBoundary,
	collectAsyncBoundaryDiagnostics,
	collectGraphDependencies,
	propagateAsyncComputedCapability,
} from '../src/passes/semantic-graph/collect-async.ts';
import { collectComponentProps } from '../src/passes/semantic-graph/collect-components.ts';
import { getComponentFunction } from '../src/ast/tsrx.ts';
import {
	collectElement,
	collectElementHandleDiagnostics,
	collectTemplateExpression,
} from '../src/passes/semantic-graph/collect-elements.ts';
import { collectVariableDeclaration } from '../src/passes/semantic-graph/collect-state.ts';

test('semantic graph collector modules expose their owning domains', () => {
	expect(typeof collectAsyncBoundary).toBe('function');
	expect(typeof collectAsyncBoundaryDiagnostics).toBe('function');
	expect(typeof collectGraphDependencies).toBe('function');
	expect(typeof propagateAsyncComputedCapability).toBe('function');
	expect(typeof collectComponentProps).toBe('function');
	expect(typeof getComponentFunction).toBe('function');
	expect(typeof collectElement).toBe('function');
	expect(typeof collectElementHandleDiagnostics).toBe('function');
	expect(typeof collectTemplateExpression).toBe('function');
	expect(typeof collectVariableDeclaration).toBe('function');
});

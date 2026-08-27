import { expect, test } from 'vitest';
import {
	KEYED_REPEAT_ROW_MINT_UNSUPPORTED_CODE,
	KEYED_REPEAT_ROW_MINT_UNSUPPORTED_SEVERITY,
	keyedRepeatRowMintUnsupportedDiagnostic,
} from '../src/passes/public-render/diagnostics.ts';

const node = { type: 'JSXForExpression', start: 0, end: 10 } as never;

function messageFor(
	refusal: Parameters<typeof keyedRepeatRowMintUnsupportedDiagnostic>[0]['refusal'],
): string {
	return keyedRepeatRowMintUnsupportedDiagnostic({
		itemName: 'item',
		refusal,
		node,
		filename: 'page.tsrx',
	}).message;
}

test('every refusal clause names itself in the author’s own words', () => {
	// A component row is minted now, so the clause names the reason this one was
	// not: what the child reaches, not the mere presence of a component.
	expect(messageFor({ kind: 'component', componentName: 'Row' })).toContain(
		'what <Row> renders either reaches a branch or an async boundary or could not be seen from here',
	);
	expect(messageFor({ kind: 'nested-construct', label: 'an @if or @switch' })).toContain(
		'holds an @if or @switch',
	);
	expect(messageFor({ kind: 'attribute', attributeName: 'data-row' })).toContain(
		'sets the data-row attribute from a value',
	);
	expect(messageFor({ kind: 'outside-read' })).toContain(
		'reads a value that is not a property of item',
	);
});

test('every clause says the consequence: the list renders and reorders but never grows', () => {
	for (const message of [
		messageFor({ kind: 'component', componentName: 'Row' }),
		messageFor({ kind: 'nested-construct', label: 'a nested @for' }),
		messageFor({ kind: 'attribute', attributeName: 'href' }),
		messageFor({ kind: 'outside-read' }),
	]) {
		expect(message).toContain('silently ignore every new one');
	}
});

// The severity is one constant on purpose: it is the owner's call, and this
// pins that the diagnostic reads it rather than spelling a literal per clause.
test('the diagnostic carries the single owner-adjustable severity and its own code', () => {
	const diagnostic = keyedRepeatRowMintUnsupportedDiagnostic({
		itemName: 'item',
		refusal: { kind: 'outside-read' },
		node,
		filename: 'page.tsrx',
	});
	expect(diagnostic.code).toBe(KEYED_REPEAT_ROW_MINT_UNSUPPORTED_CODE);
	expect(diagnostic.severity).toBe(KEYED_REPEAT_ROW_MINT_UNSUPPORTED_SEVERITY);
	expect(diagnostic.docsUrl).toContain(KEYED_REPEAT_ROW_MINT_UNSUPPORTED_CODE);
	expect(diagnostic.suggestions?.[0]?.message).toBeTruthy();
});

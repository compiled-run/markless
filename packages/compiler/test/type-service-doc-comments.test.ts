import { expect, test } from 'vitest';
import ts from 'typescript';
import { compileTsrxForTypeService } from '../src/type-service.ts';

const source = `import { state } from '@markless/core';

/**
 * Props accepted by the widget.
 */
export type WidgetProps = {
	/** The label shown to the user. */
	label: string;
};

// a plain line comment

/** A locally declared helper type. */
type Tone = 'quiet' | 'loud';

/**
 * Renders a widget.
 */
export default function Widget({ label }: WidgetProps) @{
	let count = state(0);
	<button onClick={() => count++}>{label}</button>
}
`;

test('doc comments on top-level declarations reach the type-service output', () => {
	const result = compileTsrxForTypeService(source, 'Widget.tsrx', { loose: true });

	expect(result.errors).toEqual([]);
	expect(result.code).toContain(' * Renders a widget.');
	expect(result.code).toContain(' * Props accepted by the widget.');
	expect(result.code).toContain('/** A locally declared helper type. */');
	expect(result.code).toContain('/** The label shown to the user. */');
	expect(result.code.indexOf(' * Renders a widget.')).toBeLessThan(
		result.code.indexOf('export default function Widget'),
	);
	expect(result.code.indexOf(' * Props accepted by the widget.')).toBeLessThan(
		result.code.indexOf('export type WidgetProps'),
	);
	expect(result.code.indexOf('/** A locally declared helper type. */')).toBeLessThan(
		result.code.indexOf('type Tone'),
	);
});

test('carried doc comments leave the emitted module parseable and correctly mapped', () => {
	const result = compileTsrxForTypeService(source, 'Widget.tsrx', { loose: true });

	expect(parseDiagnostics(result.code)).toEqual([]);
	expectExactMapping(result, 'count++');
	expectExactMapping(result, 'label', 'last');
	expectExactMapping(result, 'WidgetProps');
});

test('a file without doc comments emits exactly what it emitted before', () => {
	const plain = `import { state } from '@markless/core';
type Tone = 'quiet' | 'loud';
export default function Widget({ label }: { label: string; tone: Tone }) @{
	let count = state(0);
	<button onClick={() => count++}>{label}</button>
}
`;

	const result = compileTsrxForTypeService(plain, 'Widget.tsrx', { loose: true });

	expect(result.code).toBe(
		`/** @jsxImportSource @markless/typescript-plugin */
import { state } from '@markless/core';
type Tone = 'quiet' | 'loud';
export default function Widget({ label }: { label: string; tone: Tone }) {
let count = state(0);
return <button onClick={() => count++}>{label}</button>;
}`,
	);
});

function expectExactMapping(
	result: ReturnType<typeof compileTsrxForTypeService>,
	text: string,
	occurrence: 'first' | 'last' = 'first',
): void {
	const sourceOffset =
		occurrence === 'last' ? source.lastIndexOf(text) : source.indexOf(text);
	const generatedOffset =
		occurrence === 'last' ? result.code.lastIndexOf(text) : result.code.indexOf(text);
	expect(sourceOffset, `source offset for ${text}`).toBeGreaterThanOrEqual(0);
	expect(generatedOffset, `generated offset for ${text}`).toBeGreaterThanOrEqual(0);
	expect(
		result.mappings.find(
			(mapping) =>
				mapping.sourceOffsets[0] === sourceOffset &&
				mapping.generatedOffsets[0] === generatedOffset &&
				mapping.lengths[0] === text.length &&
				mapping.generatedLengths[0] === text.length,
		),
		`exact mapping for ${text}`,
	).toBeDefined();
}

function parseDiagnostics(code: string): string[] {
	return ts
		.createSourceFile('virtual.tsx', code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX)
		.parseDiagnostics.map((diagnostic) =>
			ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
		);
}

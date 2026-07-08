import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// D2-class defect (T115): the CSR module guarded an @if arm's HTML with a
// ternary, but the out-of-band child-component render statements
// (marklessCsrRenderChild + replace + registration) ran UNCONDITIONALLY.
// A component inside a falsy arm executed client-side and evaluated prop
// expressions over absent data (`info.owner.name` with info undefined),
// throwing during render/settle. Child renders must be gated by the owning
// branch test exactly like the arm's HTML.

async function compileFrame(source: string) {
	return await compileTsrxModule({
		filename: 'components/frame.tsrx',
		source,
		symbols: [],
	});
}

test('CSR module renders an @if arm child component only when the arm test holds', async () => {
	const result = await compileFrame(`import { Badge } from './badge.tsrx';

export function Frame({ info, children }) @{
	<div data-frame>
		<div data-frame-context>
			@if (info) {
				<span data-frame-owner><Badge label={info.owner.name} /></span>
			} @else {
				<em data-frame-anonymous>anonymous</em>
			}
		</div>
		<main>{children}</main>
	</div>
}`);
	const csrModule = result.publicRenderModule.csrModuleSource;

	// The child render exists and is reached through the arm gate…
	expect(csrModule).toContain('marklessCsrRenderChild(__marklessCsrComponent0');
	const gate = csrModule.indexOf('if ((info)) {');
	expect(gate).toBeGreaterThan(-1);
	const renderChild = csrModule.indexOf('marklessCsrRenderChild(__marklessCsrComponent0');
	expect(renderChild).toBeGreaterThan(gate);
	// …and every child render/replace/registration statement is inside a gate:
	// no marklessCsrChild statement may execute when the arm test is falsy.
	const gatedBlock = csrModule.slice(gate, csrModule.indexOf('\t}', renderChild));
	expect(gatedBlock).toContain('marklessCsrReplaceChild(root,');
	expect(gatedBlock).toContain('marklessCsrChildren.push(');
	expect(ungatedChildStatements(csrModule)).toEqual([]);
});

test('CSR module renders a @switch case child component only for the matching case', async () => {
	const result = await compileFrame(`import { Badge } from './badge.tsrx';

export function Frame({ kind, info }) @{
	<div data-frame>
		@switch (kind) {
			@case 'owner': { <span data-frame-owner><Badge label={info.owner.name} /></span> }
			@default: { <em data-frame-anonymous>anonymous</em> }
		}
	</div>
}`);
	const csrModule = result.publicRenderModule.csrModuleSource;

	expect(csrModule).toContain('marklessCsrRenderChild(__marklessCsrComponent0');
	expect(csrModule).toContain("if (((kind)) === ('owner')) {");
	expect(ungatedChildStatements(csrModule)).toEqual([]);
});

// Every marklessCsrChild… statement line must sit under at least one gate
// (deeper indentation than the ungated single-tab body statements).
function ungatedChildStatements(csrModule: string): string[] {
	return csrModule
		.split('\n')
		.filter(
			(line) =>
				(line.includes('marklessCsrRenderChild(') ||
					line.includes('marklessCsrReplaceChild(') ||
					line.includes('marklessCsrChildren.push(')) &&
				!line.startsWith('\t\t'),
		);
}

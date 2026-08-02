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

	expect(csrModule).toContain('branch:branch-site:0:arm:0');
	expect(csrModule).toContain('"kind":"child-component"');
	expect(csrModule).toContain('"testSource":"info"');
	expect(csrModule).not.toContain('marklessCsrRenderChild');
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

	expect(csrModule).toContain('branch:branch-site:0:arm:0');
	expect(csrModule).toContain('"kind":"child-component"');
	expect(csrModule).toContain('"testSource":"kind"');
	expect(csrModule).not.toContain('marklessCsrRenderChild');
});

// Every marklessCsrChild… statement line must sit under at least one gate
// (deeper indentation than the ungated single-tab body statements).

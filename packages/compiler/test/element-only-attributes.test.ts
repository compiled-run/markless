import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';
import type { ElementOnlyAttribute } from '../src/index.ts';
import { ELEMENT_ONLY_ATTRIBUTE_MISPLACED_CODE } from '../src/passes/semantic-graph/element-only-attributes.ts';

const PREFETCH: ElementOnlyAttribute = {
	name: 'data-router-prefetch',
	tagName: 'a',
	authored: 'prefetch={false}',
};

async function misplaced(
	source: string,
	importedModuleInterfaces?: Parameters<typeof compileTsrxModule>[0]['importedModuleInterfaces'],
) {
	const compiled = await compileTsrxModule({
		filename: 'header.tsrx',
		source,
		symbols: [],
		elementOnlyAttributes: [PREFETCH],
		...(importedModuleInterfaces ? { importedModuleInterfaces } : {}),
	});
	return collectTsrxModuleDiagnostics(compiled).filter(
		(diagnostic) => diagnostic.code === ELEMENT_ONLY_ATTRIBUTE_MISPLACED_CODE,
	);
}

async function moduleInterface(source: string) {
	const compiled = await compileTsrxModule({ filename: 'parts.tsrx', source, symbols: [] });
	return compiled.semanticGraph.moduleGraphInterface;
}

const parts = `
export function NavLink({ current, children, ...rest }: { current?: boolean; children?: unknown; href: string }) @{
	<a {...rest} aria-current={current === true ? 'page' : false}>{children}</a>
}

export function NavButton({ children, ...rest }: { children?: unknown }) @{
	<button {...rest} type="button">{children}</button>
}

export function NavLabel({ children }: { children?: unknown }) @{
	<span>{children}</span>
}
`;

test('a component that spreads its props onto an <a> may take the attribute', async () => {
	const diagnostics = await misplaced(
		`import { NavLink } from './parts.tsrx';
export default function Header() @{
	<nav><NavLink href="/" data-router-prefetch="none">Home</NavLink></nav>
}`,
		{ './parts.tsrx': await moduleInterface(parts) },
	);
	expect(diagnostics).toEqual([]);
});

test('a component in the same module that spreads onto an <a> may take it too', async () => {
	const diagnostics = await misplaced(`
function HomeLink({ children, ...rest }: { children?: unknown; href: string }) @{
	<a {...rest}>{children}</a>
}
export default function Header() @{
	<nav><HomeLink href="/" data-router-prefetch="none">Home</HomeLink></nav>
}`);
	expect(diagnostics).toEqual([]);
});

test('a component that spreads onto another element is refused', async () => {
	const diagnostics = await misplaced(
		`import { NavButton } from './parts.tsrx';
export default function Header() @{
	<nav><NavButton data-router-prefetch="none">Theme</NavButton></nav>
}`,
		{ './parts.tsrx': await moduleInterface(parts) },
	);
	expect(diagnostics).toHaveLength(1);
	expect(diagnostics[0]).toMatchObject({
		severity: 'error',
		message: expect.stringContaining('`prefetch={false}` on <NavButton> does nothing'),
	});
});

test('a component that spreads nothing is refused', async () => {
	const diagnostics = await misplaced(
		`import { NavLabel } from './parts.tsrx';
export default function Header() @{
	<nav><NavLabel data-router-prefetch="none">Docs</NavLabel></nav>
}`,
		{ './parts.tsrx': await moduleInterface(parts) },
	);
	expect(diagnostics).toHaveLength(1);
});

test('a component this build cannot see is refused rather than trusted', async () => {
	const diagnostics = await misplaced(`import { Mystery } from './mystery.tsrx';
export default function Header() @{
	<nav><Mystery data-router-prefetch="none">Docs</Mystery></nav>
}`);
	expect(diagnostics).toHaveLength(1);
	expect(diagnostics[0]?.message).toContain('cannot be checked');
});

test('a component that sets the attribute itself on its <a> cannot take it from outside', async () => {
	const diagnostics = await misplaced(`
function FixedLink({ children, ...rest }: { children?: unknown; href: string }) @{
	<a {...rest} data-router-prefetch="auto">{children}</a>
}
export default function Header() @{
	<nav><FixedLink href="/" data-router-prefetch="none">Home</FixedLink></nav>
}`);
	expect(diagnostics).toHaveLength(1);
});

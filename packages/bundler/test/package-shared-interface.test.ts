import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'pathe';
import { expect, test, vi } from 'vitest';
import { marklessClient } from '../src/rolldown.ts';
import { callBuildStart, callTransform } from './helpers.ts';

// A consuming app writes `fam.state()` against a family it installed, so the
// shared() definition it names lives in a different package. The barrel walk
// that resolves a same-package call has to reach across that boundary too — but
// only into a package that declares its tarball is source this build compiles.

const fixtures = resolve(import.meta.dirname, 'fixtures/package-shared-interface');
const appFilename = `${fixtures}/consumer/App.tsrx`;

const packageRoots: Record<string, string> = {
	'@fixture/ships-source': `${fixtures}/ships-source/src/index.ts`,
	'@fixture/no-declaration': `${fixtures}/no-declaration/src/index.ts`,
};

// Stands in for the app's resolver: package specifiers answer from the exports
// map above, everything relative from disk.
function packageResolve() {
	return vi.fn(async (specifier: string, importer?: string) => {
		const packageEntry = packageRoots[specifier];
		if (packageEntry) return { id: packageEntry };
		if (!specifier.startsWith('.')) return null;
		const id = resolve(dirname(importer ?? appFilename), specifier);
		return existsSync(id) ? { id } : null;
	});
}

function consumerSource(packageName: string) {
	return `import { fam } from '${packageName}';
export function App() @{
	<main><fam.root><Rows /></fam.root></main>
}
function Rows() @{
	const rows = fam.state();
	<div data-rows>{rows.rows.length}</div>
}`;
}

async function transformConsumer(packageName: string) {
	const plugin = marklessClient({ dev: true });
	const resolveId = packageResolve();
	callBuildStart(plugin, { cwd: fixtures });
	const dependency = `${dirname(packageRoots[packageName]!)}/fam/fam.tsrx`;
	await callTransform(plugin, readFileSync(dependency, 'utf8'), dependency, {
		resolve: resolveId,
	});
	const result = await callTransform(plugin, consumerSource(packageName), appFilename, {
		resolve: resolveId,
	});
	return (result as { readonly code: string }).code;
}

test('a consumer resolves a dependency package shared() through its package barrel', async () => {
	const code = await transformConsumer('@fixture/ships-source');

	// The call reached the declaring module, not the barrel that names it.
	expect(code).toContain('/ships-source/src/fam/fam.tsrx');
	expect(code).not.toContain("'@fixture/ships-source'");
});

test('a dependency that declares no source shipping keeps the call fail-closed', async () => {
	await expect(transformConsumer('@fixture/no-declaration')).rejects.toThrow(
		'MARKLESS_SHARED_CALL_UNRESOLVED',
	);
});

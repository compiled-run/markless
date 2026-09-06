import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IconifyJSON } from '@iconify/types';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const collectionDirectory = resolve(
	dirname(createRequire(import.meta.url).resolve('@iconify/json/package.json')),
	'json',
);
const generatedDirectory = resolve(packageDirectory, 'generated');
const sourceDirectory = resolve(packageDirectory, 'src');
const prefixes = readdirSync(collectionDirectory)
	.filter((file) => file.endsWith('.json'))
	.map((file) => file.slice(0, -'.json'.length))
	.sort();

// The props type stays structural: these declarations are read by plain .ts consumers too,
// where the type service's global namespace does not exist.
const propsDeclaration = [
	'export type IconProps = {',
	'\treadonly title?: string;',
	'\treadonly description?: string;',
	'\treadonly [attribute: string]: unknown;',
	'};',
	'export type Icon = (props: IconProps) => unknown;',
];
const declarations = [...propsDeclaration, 'export declare function packs(): readonly string[];'];
const runtime = [
	"import type { Icon } from './index.ts';",
	'',
	'const missingPlugin = (pack: string) => new Proxy({} as Record<string, Icon>, {',
	"\tget(_target, property) { throw new Error(`@markless/icons: <${pack}.${String(property)} /> reached runtime. Add ui() from '@markless/ui/vite' before markless() in vite.config, or icons() from '@markless/icons/vite' when you use icons without @markless/ui.`); },",
	'});',
	'',
];

for (const prefix of prefixes) {
	const collection = JSON.parse(readFileSync(resolve(collectionDirectory, `${prefix}.json`), 'utf8')) as IconifyJSON;
	const pack = normalizePack(prefix);
	if (!pack || /^\d/.test(pack)) continue;
	const properties = [...new Set([...Object.keys(collection.icons), ...Object.keys(collection.aliases ?? {})].map(normalizeIcon))].sort();
	declarations.push(`export declare const ${pack}: {`);
	for (const property of properties) declarations.push(`\treadonly ${property}: Icon;`);
	declarations.push('};');
	runtime.push(`export const ${pack}: Record<string, Icon> = missingPlugin(${JSON.stringify(pack)});`);
}

runtime.push('', `const installedPacks = ${JSON.stringify(prefixes.map(normalizePack).filter((name) => name && !/^\d/.test(name)).sort())} as const;`);
runtime.push('export function packs(): readonly string[] { return installedPacks; }', '');
mkdirSync(generatedDirectory, { recursive: true });
writeFileSync(resolve(generatedDirectory, 'packs.d.ts'), `${declarations.join('\n')}\n`);
writeFileSync(resolve(sourceDirectory, 'generated-runtime.ts'), `${runtime.join('\n')}\n`);

function normalizePack(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeIcon(value: string): string {
	const name = value.toLowerCase().replace(/-/g, '');
	return /^\d/.test(name) ? `icon${name}` : name;
}

// Counts the signature-sheet declarations each task's code references, using the TypeScript checker
// over the TSX that the Markless type service generates (the same TSX markless-tsc checks).
// usage: node check/names.mjs <work-dir-name...>   (dirs made by check/run.mjs)
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';
import { compileToVolarMappingsWithoutRecovery } from '../../../../../packages/typescript-plugin/src/volar.ts';

const here = dirname(new URL(import.meta.url).pathname);
const root = resolve(here, '../../../../..');
const out = {};
for (const name of process.argv.slice(2)) {
	const work = join(here, 'work', name);
	const sheet = join(work, 'device', 'index.d.ts');
	out[name] = {};
	for (const t of ['1', '2', '3', '4', '5', '6', '7', '8']) {
		const dir = join(work, `task${t}`);
		if (!existsSync(dir)) continue;
		const gen = join(work, `gen${t}`);
		rmSync(gen, { recursive: true, force: true });
		mkdirSync(gen, { recursive: true });
		const roots = [];
		for (const file of readdirSync(dir)) {
			const source = readFileSync(join(dir, file), 'utf8');
			if (file.endsWith('.tsrx')) {
				try {
					const result = compileToVolarMappingsWithoutRecovery(source, join(dir, file));
					writeFileSync(join(gen, `${file}.tsx`), result.code);
					roots.push(join(gen, `${file}.tsx`));
				} catch {}
			} else if (file.endsWith('.ts')) {
				writeFileSync(join(gen, file), source);
				roots.push(join(gen, file));
			}
		}
		const program = ts.createProgram(roots, {
			jsx: ts.JsxEmit.Preserve, allowImportingTsExtensions: true, noEmit: true, module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2022, strict: true, skipLibCheck: true,
			lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'], types: [],
			paths: { '@markless/device': [sheet], '@markless/core': [join(root, 'packages/core/src/index.ts')] },
		});
		const checker = program.getTypeChecker();
		const exportsUsed = new Set();
		const surface = new Set();
		const isSheet = (decl) => resolve(decl.getSourceFile().fileName) === resolve(sheet);
		const qualified = (decl, symbol) => {
			const parts = [symbol.getName()];
			let node = decl.parent;
			while (node && !ts.isSourceFile(node)) {
				if ((ts.isInterfaceDeclaration(node) || ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) parts.unshift(node.name.getText());
				node = node.parent;
			}
			return parts.join('.');
		};
		for (const file of roots) {
			const sf = program.getSourceFile(file);
			if (!sf) continue;
			const visit = (node) => {
				if (ts.isIdentifier(node) && !ts.isImportSpecifier(node.parent) && !ts.isImportClause(node.parent)) {
					let symbol = checker.getSymbolAtLocation(node);
					if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
					const decl = symbol?.declarations?.find(isSheet);
					const typeOnly = decl && (ts.isInterfaceDeclaration(decl) || ts.isTypeAliasDeclaration(decl));
					if (decl && !typeOnly) {
						const top = ts.isSourceFile(decl.parent) || ts.isVariableDeclaration(decl) || (ts.isFunctionDeclaration(decl) && ts.isSourceFile(decl.parent)) || ts.isClassDeclaration(decl);
						const q = qualified(decl, symbol);
						surface.add(q);
						if (top) exportsUsed.add(q);
					}
				}
				ts.forEachChild(node, visit);
			};
			visit(sf);
		}
		out[name][t] = { exports: exportsUsed.size, surface: surface.size, names: [...surface].sort() };
	}
}
console.log(JSON.stringify(out));

// Lists which candidate bare tag names are already element names in TypeScript's DOM library (HTML, deprecated HTML, SVG, MathML).
import { createRequire } from 'node:module';
import { join } from 'node:path';
const require = createRequire(join(process.cwd(), 'package.json'));
const ts = require('typescript');
const lib = join(require.resolve('typescript'), '..', 'lib.dom.d.ts');
const program = ts.createProgram([lib], { noLib: true, types: [] });
const checker = program.getTypeChecker();
const file = program.getSourceFile(lib);
const maps = ['HTMLElementTagNameMap', 'HTMLElementDeprecatedTagNameMap', 'SVGElementTagNameMap', 'MathMLElementTagNameMap'];
const names = {};
for (const statement of file.statements) {
	if (ts.isInterfaceDeclaration(statement) && maps.includes(statement.name.text)) {
		const type = checker.getTypeAtLocation(statement.name);
		names[statement.name.text] = new Set(checker.getPropertiesOfType(type).map((p) => p.name));
	}
}
const candidates = process.argv.slice(2);
for (const name of candidates) {
	const hits = maps.filter((m) => names[m]?.has(name));
	console.log(`${name}\t${hits.length ? hits.join(', ') : 'none'}`);
}
console.log(`ts ${ts.version}; sizes ${maps.map((m) => `${m}=${names[m]?.size}`).join(' ')}`);

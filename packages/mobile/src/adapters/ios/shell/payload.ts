import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { compileNativeComponent } from '../../../index.ts';

const [file, page] = process.argv.slice(2);
if (!file) throw new Error('usage: node payload.ts <component.tsrx> [pages/<route>.tsrx]');
const { payload, diagnostics } = await compileNativeComponent({
	filename: `src/${basename(file)}`,
	source: readFileSync(file, 'utf8'),
	...(page ? { page } : {}),
});
if (!payload) {
	console.error(JSON.stringify(diagnostics, null, 2));
	process.exit(1);
}
process.stdout.write(`${JSON.stringify(payload)}\n`);

// Generates one code-panel module from a demo and compiles it, to check the
// literal markup parses and to see what the compiler emits for it.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const [family = 'accordion', stem = 'multiple', out] = process.argv.slice(2);
const { codePanelModule } = await import('../tooling/ui-code-panel.ts');
const source = readFileSync(`components/demos/ui/${family}/${stem}.tsrx`, 'utf8');
const block = /^[ \t]*<style>[ \t]*\n([\s\S]*?)\n[ \t]*<\/style>[ \t]*\n?/m.exec(source);
const code = block
	? `${source.slice(0, block.index).trimEnd()}\n${source.slice(block.index + block[0].length)}`.trimEnd()
	: source.trimEnd();
const css = block ? block[1].replace(/^\t+/gm, (m) => m.slice(3)).trim() : '';
const panes = [{ value: 'source', label: `${stem}.tsrx`, code, language: 'tsrx' }];
if (css) panes.push({ value: 'css', label: `${family}.css`, code: css, language: 'css' });
const module = await codePanelModule({ family, stem, panes });
if (out) writeFileSync(out, module);
console.log('module bytes', module.length);

const fromHere = createRequire(process.cwd() + '/package.json');
const compilerPath = createRequire(fromHere.resolve('@markless/core')).resolve('@markless/compiler');
const { compileTsrxModule } = await import(pathToFileURL(compilerPath).href);
const result = await compileTsrxModule({ filename: `/probe/${family}__${stem}__code.tsrx`, source: module, symbols: [] });
const diagnostics = result.semanticGraph.diagnostics ?? [];
console.log('diagnostics', JSON.stringify(diagnostics.map((d) => `${d.code}: ${d.message}`), null, 1));
const statics = result.semanticGraph.markup?.chunks?.[0]?.statics ?? [];
const html = statics.join('');
console.log('static html bytes', html.length, 'slots', statics.length - 1);
console.log('sample', html.slice(0, 1500));

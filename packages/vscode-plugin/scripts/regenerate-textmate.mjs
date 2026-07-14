#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(packageRoot, 'grammar/ripple.tmLanguage.json');
const outputPath = resolve(packageRoot, 'syntaxes/markless.tmLanguage.json');
const grammar = JSON.parse(readFileSync(sourcePath, 'utf8'));

// Vendored from Ripple's MIT grammar, whose header pins Microsoft's
// TypeScriptReact grammar at 48f608692aa6d6ad7bd65b478187906c798234a8.
grammar.name = 'Markless TSRX';
grammar.scopeName = 'source.tsrx.markless';
const generated = JSON.stringify(grammar, null, 2)
	.replaceAll('embedded.tsrx-isolated', 'embedded.markless-tsrx-isolated')
	.replaceAll('embedded.tsrx', 'embedded.markless-tsrx')
	.replaceAll('.ripple', '.markless-tsrx');

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${generated}\n`);

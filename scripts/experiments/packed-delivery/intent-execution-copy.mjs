import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';

const input = process.env.DOCS_COLD_OUTPUT;
assert.ok(input, 'DOCS_COLD_OUTPUT must name an immutable production output');
const directory = await mkdtemp('/private/tmp/markless-docs-intent-execution-');
const output = directory + '/.output';
await cp(input, output, { recursive: true });
const changes = [];
for (const file of await readdir(output + '/public/build')) {
  if (!file.endsWith('.js')) continue;
  const path = output + '/public/build/' + file;
  const source = await readFile(path, 'utf8');
  const expression = /Promise\.resolve\([\w$]+\.loadSymbol\([\w$]+\)\)\.catch\(\(\)=>\{\}\)/g;
  const matches = [...source.matchAll(expression)];
  if (!matches.length) continue;
  assert.equal(matches.length, 1);
  assert.ok(source.slice(matches[0].index - 80, matches[0].index).includes('.symbolIds'));
  const rewritten = source.replace(expression, match => 'Promise.resolve().catch(()=>{})'.padEnd(match.length));
  assert.equal(Buffer.byteLength(rewritten), Buffer.byteLength(source), 'Preserve Nitro asset response length');
  const sha256 = text => createHash('sha256').update(text).digest('hex');
  changes.push({ file, expression: matches[0][0], offset: matches[0].index, before: sha256(source), after: sha256(rewritten) });
  await writeFile(path, rewritten);
}
assert.equal(changes.length, 1, 'Expected exactly one speculative symbol loader in this docs build');
const result = { input, output, changes, limitation: 'Diagnostic compiled-output rewrite; filenames intentionally retained, HTTP cache must be disabled. This is not a production implementation.' };
await writeFile(directory + '/rewrite.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseSync } from 'rolldown/experimental';

const [input, destination] = process.argv.slice(2);
if (!input || !destination) throw Error('Usage: execution-attribution.mjs coverage.json attribution.json');
const coverage = JSON.parse(await readFile(input, 'utf8'));
const cache = new Map();
async function sourceFor(script) {
  if (cache.has(script.url)) return cache.get(script.url);
  const path = coverage.metadata.output + '/public' + script.url.replace('/markless/', '/');
  const source = await readFile(path, 'utf8');
  if (createHash('sha256').update(source).digest('hex') !== script.sha256) throw Error(`Source changed: ${path}`);
  const program = parseSync(path, source).program;
  const helpers = new Set(), aliases = new Map(), initializers = [], declarations = [];
  for (const node of program.body) {
    if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers) {
        if (specifier.imported?.name === '__esmMin') helpers.add(specifier.local.name);
      }
    }
    if (node.type === 'ExportNamedDeclaration' && !node.declaration) {
      declarations.push(node);
      for (const specifier of node.specifiers) aliases.set(specifier.local.name, specifier.exported.name);
    }
  }
  function visit(node, owner) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration') owner = node.id?.name;
    if (node.type === 'CallExpression' && helpers.has(node.callee?.name)) {
      let body = node.arguments[0];
      while (body?.type === 'ParenthesizedExpression') body = body.expression;
      if (body?.type === 'ArrowFunctionExpression' || body?.type === 'FunctionExpression') {
        initializers.push({ name: aliases.get(owner) ?? owner, start: body.start, end: body.end });
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'comments') continue;
      if (Array.isArray(value)) for (const item of value) visit(item, owner);
      else if (value && typeof value === 'object') visit(value, owner);
    }
  }
  visit(program);
  const result = { source, initializers, declarations };
  cache.set(script.url, result);
  return result;
}

const records = [];
for (const record of coverage.records) {
  const phases = [];
  for (const phase of record.phases) {
    const scripts = [];
    for (const script of phase.scripts) {
      const { source, initializers, declarations } = await sourceFor(script);
      const functions = new Map(script.functions.map(fn => [fn.ranges[0].startOffset, fn]));
      const initialized = initializers.flatMap(initializer => {
        const fn = functions.get(initializer.start);
        return fn?.ranges[0].count > 0 ? [{ ...initializer, count: fn.ranges[0].count }] : [];
      });
      const exportDeclarationBytes = declarations.reduce((bytes, node) => bytes + script.ranges.reduce((total, range) => {
        const start = Math.max(node.start, range.start), end = Math.min(node.end, range.end);
        return total + (end > start ? Buffer.byteLength(source.slice(start, end)) : 0);
      }, 0), 0);
      const containment = script.functions.filter(fn => {
        const range = fn.ranges[0];
        if (range.count === 0) return false;
        const body = source.slice(range.startOffset, range.endOffset);
        return body.length < 250 && body.includes('.childNodes??[]') && body.includes('.nodeType===1') && body.endsWith('return!1}');
      }).map(fn => ({ name: fn.functionName, count: fn.ranges[0].count }));
      scripts.push({ url: script.url, sourceBytes: script.sourceBytes, executedBytes: script.executedBytes, exportDeclarationBytes, initializerBodiesInFile: initializers.length, initialized, containment });
    }
    phases.push({ name: phase.name, scripts });
  }
  records.push({ test: record.test, sample: record.sample, variant: record.variant, phases });
}
await writeFile(destination, JSON.stringify({ input, limitation: 'Rolldown __esmMin callback inventory and lexical export declarations, not CPU time. Containment counts use the emitted helper shape; verify their source before interpreting them.', records }, null, 2));
for (const record of records) console.log(JSON.stringify({ test: record.test, phases: record.phases.map(phase => ({ name: phase.name, initialized: phase.scripts.reduce((sum, script) => sum + script.initialized.length, 0), exports: phase.scripts.reduce((sum, script) => sum + script.exportDeclarationBytes, 0), containmentCalls: phase.scripts.flatMap(script => script.containment).reduce((sum, fn) => sum + fn.count, 0) })) }));

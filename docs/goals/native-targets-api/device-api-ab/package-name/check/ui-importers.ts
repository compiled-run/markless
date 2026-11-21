// usage: node check/ui-importers.ts   (run from package-name/) — every import record whose specifier is @markless/ui or a subpath, from the yuku module graph over tracked files
import { loadProjectGraph } from '../../../../../../packages/analyzer/test-support/project-graph.ts';
const root = new URL('../../../../../../', import.meta.url).pathname;
const { graph, fileCount } = await loadProjectGraph(root);
const rows: string[] = [];
for (const [path, module] of graph.analyzer.modules)
	for (const record of module.imports)
		if (record.specifier === '@markless/ui' || record.specifier.startsWith('@markless/ui/'))
			rows.push(`${path}\t${record.specifier}\t${record.typeOnly ? 'type' : 'value'}`);
console.log(`modules ${graph.analyzer.modules.size} files ${fileCount} opaque ${graph.opaque.size} unresolved ${graph.unresolved.size}`);
console.log(rows.join('\n'));

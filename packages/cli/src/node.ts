#!/usr/bin/env node
import { CreateProgram } from './index.ts';
import { createNodeRuntime } from './node-runtime.ts';
import { unsupportedNode } from './node-version.ts';

const unsupported = unsupportedNode(process.versions);
if (unsupported) {
	process.stderr.write(`${unsupported}\n`);
	process.exitCode = 1;
} else {
	try {
		await new CreateProgram().run(process.argv.slice(2), createNodeRuntime());
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}

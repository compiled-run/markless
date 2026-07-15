#!/usr/bin/env node
import { CreateProgram } from './index.ts';
import { createNodeRuntime } from './node-runtime.ts';

try {
	await new CreateProgram().run(process.argv.slice(2), createNodeRuntime());
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
}

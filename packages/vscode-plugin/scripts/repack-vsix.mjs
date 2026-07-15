#!/usr/bin/env node

import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vsixPath = resolve(packageRoot, 'dist/markless.vsix');
const extractRoot = resolve(packageRoot, 'dist/vsix-repack');
if (!existsSync(vsixPath)) throw new Error(`VSIX not found: ${vsixPath}`);
rmSync(extractRoot, { recursive: true, force: true });
mkdirSync(extractRoot, { recursive: true });
new AdmZip(vsixPath).extractAllTo(extractRoot, true);
const extensionRoot = resolve(extractRoot, 'extension');
renameSync(resolve(extensionRoot, 'dist/node_modules'), resolve(extensionRoot, 'node_modules'));

const output = new AdmZip({ noSort: true });
const manifest = resolve(extractRoot, 'extension.vsixmanifest');
output.addFile('extension.vsixmanifest', readFileSync(manifest));
addDirectory(extractRoot, '');
output.writeZip(vsixPath);
rmSync(extractRoot, { recursive: true, force: true });

function addDirectory(directory, prefix) {
	for (const entry of readdirSync(directory)) {
		if (!prefix && entry === 'extension.vsixmanifest') continue;
		const path = resolve(directory, entry);
		const archivePath = prefix ? `${prefix}/${entry}` : entry;
		if (statSync(path).isDirectory()) addDirectory(path, archivePath);
		else output.addFile(archivePath, readFileSync(path));
	}
}

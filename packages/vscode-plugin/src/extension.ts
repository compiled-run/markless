import * as vscode from 'vscode';
import { getTagClosingInsertion } from './tag-closing.ts';

const pendingChanges = new Map<string, ReturnType<typeof setTimeout>>();

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	// The tsserver plugins only run once VS Code's built-in TypeScript extension
	// is active, and nothing activates it in a window that only ever opens .tsrx
	// files. Wake it explicitly (the same dependency Vue's extension declares).
	await vscode.extensions.getExtension('vscode.typescript-language-features')?.activate();

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((event) => {
			if (event.document.languageId !== 'markless-tsrx' || event.contentChanges.length !== 1) {
				return;
			}
			if (
				!vscode.workspace
					.getConfiguration('markless', event.document.uri)
					.get('autoClosingTags', true)
			) {
				return;
			}

			const change = event.contentChanges[0];
			const documentText = event.document.getText();
			const documentVersion = event.document.version;
			const key = event.document.uri.toString();
			const previous = pendingChanges.get(key);
			if (previous) clearTimeout(previous);

			pendingChanges.set(
				key,
				setTimeout(() => {
					pendingChanges.delete(key);
					if (event.document.version !== documentVersion) return;
					const insertion = getTagClosingInsertion(
						documentText,
						change.rangeOffset,
						change.text,
					);
					if (!insertion) return;
					void insertClosingTag(event.document, insertion);
				}, 0),
			);
		}),
		{
			dispose() {
				for (const timeout of pendingChanges.values()) clearTimeout(timeout);
				pendingChanges.clear();
			},
		},
	);
}

async function insertClosingTag(
	document: vscode.TextDocument,
	insertion: { insert: string; at: number },
): Promise<void> {
	const position = document.positionAt(insertion.at);
	const editor = vscode.window.visibleTextEditors.find(
		(candidate) => candidate.document.uri.toString() === document.uri.toString(),
	);
	if (editor) {
		const cursor = editor.selection.active;
		if (document.offsetAt(cursor) !== insertion.at) return;
		await editor.insertSnippet(
			new vscode.SnippetString(`$0${escapeSnippetText(insertion.insert)}`),
			position,
		);
		return;
	}

	const edit = new vscode.WorkspaceEdit();
	edit.insert(document.uri, position, insertion.insert);
	await vscode.workspace.applyEdit(edit);
}

function escapeSnippetText(text: string): string {
	return text.replace(/[\\$}]/g, '\\$&');
}

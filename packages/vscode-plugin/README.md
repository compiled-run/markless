# Markless TSRX for VS Code

This extension registers `.tsrx` files, supplies the Markless TextMate grammar, and loads the core and router TypeScript server plugins for completions, hover, navigation, and diagnostics.

Build a sideloadable extension with:

```sh
pnpm --dir packages/vscode-plugin package:vsix
```

Then install it with `code --install-extension packages/vscode-plugin/dist/markless-tsrx.vsix`.

The publisher (`markless-dev`), package name (`markless-tsrx`), and display name (`Markless TSRX`) are provisional pending owner confirmation.

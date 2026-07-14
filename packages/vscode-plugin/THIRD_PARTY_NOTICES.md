# Third-party notices

`grammar/upstream.tmLanguage.json` is the vendored upstream source for the derived Markless grammar. It is adapted from the Ripple TSRX TextMate grammar, copyright the Ripple contributors, licensed under the MIT License.

Ripple's grammar derives from Microsoft's TypeScriptReact TextMate grammar at commit `48f608692aa6d6ad7bd65b478187906c798234a8`, copyright Microsoft Corporation, licensed under the MIT License.

`syntaxes/markless.tmLanguage.json` is generated from `grammar/upstream.tmLanguage.json` by `scripts/regenerate-textmate.mjs`; the renamed vendored source records the upstream Ripple and Microsoft provenance of the derived grammar. The generator changes the language name and Markless-specific scope names while retaining the recursive component statements, TSRX directive repositories, JSX nesting, and embedded CSS rules.

The MIT License permits use, modification, distribution, and sublicensing provided the copyright and permission notice are retained. The upstream license texts are available in the Ripple and Microsoft TypeScript-TmLanguage repositories identified by the grammar header and pinned commit.

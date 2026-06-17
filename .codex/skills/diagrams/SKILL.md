---
name: diagrams
description: Create Arcade's hand-crafted SVG diagrams — GitHub-Primer flat cards with theme-adaptive colors, sparkle accents, and headless-Chrome verification on both themes. Use when adding or editing diagrams in the README, CONTRIBUTING, or docs. Never use mermaid in committed markdown.
---

# Diagrams

Diagrams in this repo are hand-crafted SVGs committed under `assets/` and embedded as images.
**Never add mermaid blocks to committed markdown**: GitHub overlays zoom controls on the
top-right of every mermaid diagram (covering content), its renderer can't match the repo's
look, and its container fills fight the dark theme.

## Style: GitHub Primer + banner sparkles

Flat cards in GitHub's own palette so diagrams read as native UI, with the banner's sparkles
as the only brand flourish. Colors are CSS classes with a `prefers-color-scheme` media query
inside the SVG — one file adapts to both GitHub themes.

| Token        | Light             | Dark      |
| ------------ | ----------------- | --------- |
| card fill    | `#f6f8fa`         | `#161b22` |
| card stroke  | `#d0d7de` (1.5px) | `#3d444d` |
| title text   | `#1f2328` (600)   | `#e6edf2` |
| muted text   | `#59636e`         | `#9198a1` |
| success text | `#1a7f37`         | `#3fb950` |
| arrows       | `#818b98`         | `#767e89` |

Sparkles (theme-independent): pink `#F9A8D4` and orange `#FB923C` four-point stars, pink
`#EC4899` dots at 0.75 opacity. Two or three stars plus two dots per diagram, scattered near
edges — never overlapping cards or text.

## Template

Start every diagram from this skeleton (geometry from `assets/box-flow.svg`,
`assets/contrib-*.svg` are working examples):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1560 250"
     font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif">
  <style>
    .card { fill: #f6f8fa; stroke: #d0d7de; stroke-width: 1.5; }
    .title { fill: #1f2328; font-size: 25px; font-weight: 600; }
    .muted { fill: #59636e; font-size: 21px; }
    .mono { font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace; }
    .ok { fill: #1a7f37; }
    .arrow { stroke: #818b98; fill: none; }
    .arrowhead { fill: #818b98; }
    @media (prefers-color-scheme: dark) {
      .card { fill: #161b22; stroke: #3d444d; }
      .title { fill: #e6edf2; }
      .muted { fill: #9198a1; }
      .ok { fill: #3fb950; }
      .arrow { stroke: #767e89; }
      .arrowhead { fill: #767e89; }
    }
  </style>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7"
            orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 Z" class="arrowhead"/>
    </marker>
  </defs>
  <!-- sparkle: <path d="M{x} {y} l4.5 13 13 4.5 -13 4.5 -4.5 13 -4.5 -13 -13 -4.5 13 -4.5 Z"/> -->
  <!-- card: <rect x=".." y=".." width=".." height="112" rx="12" class="card"/> -->
  <!-- arrow: <line ... class="arrow" stroke-width="2.5" stroke-linecap="round" marker-end="url(#arrow)"/> -->
</svg>
```

Conventions: 1560-wide viewBox; cards 96–136 tall, `rx="12"` (small cards 64 tall, `rx="10"`);
balanced node heights (a tall node beside short ones looks lopsided); file/code text in
`.mono`; emojis (📦 ⚡ 🧾 ✏️) are fine; fan-out/fan-in uses gentle cubic beziers
(`C` curves, see `contrib-code-map.svg`).

## Verify on BOTH themes before committing

Render with headless Chrome and actually look at the output — sparkles overlapping cards and
unbalanced nodes are only visible rendered:

```sh
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# light (media query inactive)
"$CHROME" --headless=new --screenshot=/tmp/d-light.png --window-size=1560,250 \
  --default-background-color=ffffffff --hide-scrollbars "file://$PWD/assets/<name>.svg"
# dark (force the media query on, render on GitHub's dark canvas)
sed 's/@media (prefers-color-scheme: dark)/@media all/' assets/<name>.svg > /tmp/d.svg
"$CHROME" --headless=new --screenshot=/tmp/d-dark.png --window-size=1560,250 \
  --default-background-color=0d1117ff --hide-scrollbars "file:///tmp/d.svg"
```

Match `--window-size` height to the viewBox height.

## Embed

```html
<p align="center">
	<img src="./assets/<name>.svg" alt="<describe the full flow in words>" width="820" />
</p>
```

Width 780–860 in markdown; always write a complete alt text (the flow spelled out, not
"diagram").

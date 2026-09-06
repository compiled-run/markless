# UI sidebar illustrations

Component-specific illustrations for the 46 family exports in
`packages/headless/components/src/index.ts`, plus Overview and Styling.
The existing UI sidebar has 28 entries; the other family crops are retained for
future documentation pages. The framework sidebar uses its existing artwork.

The visual references are the owner's light/dark sidebar sheet and Joy Elia
brand image: loose black ink, warm cream sticker bodies, crayon texture, and
pink, purple, yellow, and green decoration. Source sheets use a four-column,
four-row grid. Each cell has one isolated illustration, without a label.

`manifest.json` records the source implementation, behavior behind each drawing,
grid position, and decoration color. `prompts/` preserves the exact generation
prompts. Images are generated with the built-in image generation tool.

The forms light sheet used `forms-light.txt`, followed by
`forms-light-background-edit.txt` to replace the generated checkerboard with
blue. The other light sheets requested blue directly. Each dark prompt edits
its corresponding light sheet while retaining the subjects and grid.

The source sheets use blue only as a cutting background. The cutter removes it,
unmixes edge pixels, finds clear gutters, and centers the drawings on transparent
128px squares. `preview-light.png` and `preview-dark.png` show the final crops.

The component review examined family state, exported parts, rendered controls
and ARIA roles, and the input, click, pointer, and keyboard handlers in the
listed implementations. This is a review for visual metaphors, not a component
correctness or accessibility audit. The base family review includes button,
label, separator, and visually-hidden.

Regenerate the crops with:

```sh
node website/tooling/cut-ui-sprites.ts
```

The output lives in `website/public/sidebar/ui/`. Source sheets remain here so
the crop coordinates and original artwork can be reviewed and reproduced.

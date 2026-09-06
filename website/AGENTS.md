# Agent notes for the compiled.run docs site

## Styling components

TSRX supports a co-located `<style>` tag inside `.tsrx` components, and its
selectors are scoped to the component. Component-specific styles belong there,
not in `styles/global.css`. Reach for `global.css` only for genuinely
site-wide rules: tokens, the type ramp, the prose column, the paper grain,
code-fence surfaces, and the header/sidebar chrome.

`components/demos/hero-card.tsrx` and `components/docs/opener-line.tsrx` are
the pattern to copy. Global tokens (`var(--ink)`, `var(--step--1)`, the space
scale) resolve inside scoped styles as usual.

Inside a scoped `<style>`, prefer the simplest selectors that work: bare
elements (`p`, `button img`, `article > div`) and short single-purpose classes
(`.photo`, `.hot`). Scoping is what makes them safe, and it keeps the styles
modular and readable. Owner preference, stated 2026-08-19. Two cautions: a
class name that also exists in `global.css` still receives those global rules
(scoping fences your selectors in, not global ones out), and prose-column
globals (`.prose h3` and friends) can still reach elements inside a component,
so reset what they set when it shows.

## Demo code panels

When a demo renders a code panel that claims to be a `.tsrx` file (the front
page's `mug-card.tsrx`, for instance), the panel shows the smallest honest
version of that file. The demo component's own `<style>` tag is deliberately
omitted from the displayed code: the panel teaches the feature under
discussion, not the demo's cosmetics. Keep displayed code truthful about
behaviour (every line shown must do what it says on the card), but do not
show the styling machinery.

type DiagnosticsProps = {
  count: number;
  label: string;
  settings: {
    x: number;
    nested: {
      title: string;
    };
  };
  items: string[];
};

export function InvalidComputedWrites() @{
  let count = state(0);
  let doubled = computed(() => count * 2);
  let computedAlias = doubled;

  <button
    type="button"
    onClick={() => {
      count++;

      // expected diagnostic: computed bindings are read-only in v1.
      doubled = 10;

      // expected diagnostic: computed aliases are read-only in v1.
      computedAlias++;
    }}
  >
    Invalid computed writes {doubled} and {computedAlias}
  </button>
}

export function InvalidPropWrites(props: DiagnosticsProps) @{
  let { count: propCount, settings, items } = props; // oxlint-disable-line no-unused-vars -- written illegally below

  <section>
    <button
      type="button"
      onClick={() => {
        // expected diagnostic: props are read-only in v1.
        props.count = 1;

        // expected diagnostic: destructured prop aliases are read-only in v1.
        propCount++;

        // expected diagnostic: nested prop paths are read-only in v1.
        settings.x = 2;
        settings.nested.title = "changed";

        // expected diagnostic: prop array aliases are read-only in v1.
        items.push("changed");
      }}
    >
      Invalid prop writes {props.label}
    </button>
  </section>
}

export function InvalidStateAliases() @{
  const obj = state({
    x: 1,
    nested: {
      title: "Initial",
    },
    items: ["alpha", "beta"],
  });
  let key = state("x");
  let { x: xAlias } = obj; // oxlint-disable-line no-unused-vars -- written illegally below
  let { [key]: dynamicAlias } = obj; // oxlint-disable-line no-unused-vars -- written illegally below
  let [firstItem] = obj.items; // oxlint-disable-line no-unused-vars -- written illegally below

  <section>
    <button
      type="button"
      onClick={() => {
        // expected diagnostic: reassigning a destructured state alias would
        // change normal JavaScript semantics instead of writing obj.x.
        xAlias = 2;

        // expected diagnostic: computed-property destructuring from state is
        // ambiguous until a fixture proves a supported dynamic-key contract.
        dynamicAlias = 3;

        // expected diagnostic: array element destructuring produces a local
        // binding here, not an assignable graph path.
        firstItem = "changed";
      }}
    >
      Invalid state aliases {obj.nested.title}
    </button>
  </section>
}

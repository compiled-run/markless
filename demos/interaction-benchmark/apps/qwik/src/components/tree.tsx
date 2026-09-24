import { component$, useSignal } from "@qwik.dev/core";
import { SIDEBAR_TREE, type TreeNode } from "~/shared/data";

const TreeItems = component$<{ nodes: readonly TreeNode[] }>(({ nodes }) => (
  <>
    {nodes.map((node) =>
      node.children ? (
        <TreeGroup key={node.id} node={node} />
      ) : (
        <li key={node.id}>
          <span class="tree-leaf" data-testid={`tree-leaf-${node.id}`}>
            {node.label}
          </span>
        </li>
      ),
    )}
  </>
));

const TreeGroup = component$<{ node: TreeNode }>(({ node }) => {
  const open = useSignal(false);
  const panelId = `disclosure-panel-${node.id}`;
  return (
    <li>
      <button
        type="button"
        class="tree-toggle"
        data-testid={`disclosure-${node.id}`}
        aria-expanded={open.value ? "true" : "false"}
        aria-controls={panelId}
        onClick$={() => (open.value = !open.value)}
      >
        {node.label}
      </button>
      <ul
        class="tree-panel"
        id={panelId}
        data-testid={panelId}
        hidden={!open.value}
      >
        <TreeItems nodes={node.children ?? []} />
      </ul>
    </li>
  );
});

export const Tree = component$(() => (
  <ul class="tree">
    <TreeItems nodes={SIDEBAR_TREE} />
  </ul>
));

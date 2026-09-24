import { createSignal, For, Show } from "solid-js";
import type { TreeNode } from "../shared/data";

export function SidebarTree(props: { nodes: readonly TreeNode[] }) {
  return (
    <ul class="tree">
      <TreeItems nodes={props.nodes} />
    </ul>
  );
}

function TreeItems(props: { nodes: readonly TreeNode[] }) {
  return (
    <For each={props.nodes}>
      {(node) => (
        <Show
          when={node.children}
          fallback={
            <li>
              <span class="tree-leaf" data-testid={`tree-leaf-${node.id}`}>{node.label}</span>
            </li>
          }
        >
          {(nested) => <TreeGroup node={node} nested={nested()} />}
        </Show>
      )}
    </For>
  );
}

function TreeGroup(props: { node: TreeNode; nested: readonly TreeNode[] }) {
  const [open, setOpen] = createSignal(false);
  const panelId = () => `disclosure-panel-${props.node.id}`;
  return (
    <li>
      <button
        type="button"
        class="tree-toggle"
        data-testid={`disclosure-${props.node.id}`}
        aria-expanded={open() ? "true" : "false"}
        aria-controls={panelId()}
        onClick={() => setOpen((v) => !v)}
      >
        {props.node.label}
      </button>
      <ul class="tree-panel" id={panelId()} data-testid={panelId()} hidden={!open()}>
        <TreeItems nodes={props.nested} />
      </ul>
    </li>
  );
}

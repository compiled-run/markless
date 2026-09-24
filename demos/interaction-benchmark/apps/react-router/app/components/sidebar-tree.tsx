import { useState } from "react";
import { SIDEBAR_TREE, type TreeNode } from "../shared/data";

function TreeItem({ node }: { node: TreeNode }) {
  if (!node.children) {
    return (
      <li>
        <span className="tree-leaf" data-testid={`tree-leaf-${node.id}`}>
          {node.label}
        </span>
      </li>
    );
  }
  return <TreeGroup node={node} items={node.children} />;
}

function TreeGroup({ node, items }: { node: TreeNode; items: readonly TreeNode[] }) {
  const [open, setOpen] = useState(false);
  const panelId = `disclosure-panel-${node.id}`;
  return (
    <li>
      <button
        type="button"
        className="tree-toggle"
        data-testid={`disclosure-${node.id}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        {node.label}
      </button>
      <ul className="tree-panel" id={panelId} data-testid={panelId} hidden={!open}>
        {items.map((child) => (
          <TreeItem key={child.id} node={child} />
        ))}
      </ul>
    </li>
  );
}

export function SidebarTree() {
  return (
    <ul className="tree">
      {SIDEBAR_TREE.map((node) => (
        <TreeItem key={node.id} node={node} />
      ))}
    </ul>
  );
}

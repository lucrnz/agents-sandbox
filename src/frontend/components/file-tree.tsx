import * as React from "react";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";

export type FileTreeFile = {
  path: string;
  size: number;
};

type TreeNode =
  | { kind: "dir"; name: string; path: string; children: Map<string, TreeNode> }
  | { kind: "file"; name: string; path: string; size: number };

function buildTree(files: FileTreeFile[]): TreeNode {
  const root: TreeNode = { kind: "dir", name: "", path: "", children: new Map() };

  for (const f of files) {
    const parts = f.path.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (i === parts.length - 1) {
        current.children.set(part, { kind: "file", name: part, path: f.path, size: f.size });
      } else {
        const existing = current.children.get(part);
        if (existing && existing.kind === "dir") {
          current = existing;
        } else {
          const dir: TreeNode = { kind: "dir", name: part, path: currentPath, children: new Map() };
          current.children.set(part, dir);
          current = dir;
        }
      }
    }
  }

  return root;
}

function sortChildren(children: Map<string, TreeNode>): TreeNode[] {
  const arr = Array.from(children.values());
  arr.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return arr;
}

export function FileTree({
  files,
  onSelectFile,
  selectedPath,
}: {
  files: FileTreeFile[];
  onSelectFile: (path: string) => void;
  selectedPath?: string;
}) {
  const tree = React.useMemo(() => buildTree(files), [files]);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const indent = { paddingLeft: `${depth * 12}px` };

    if (node.kind === "dir") {
      const isOpen = node.path === "" ? true : expanded.has(node.path);
      const children = sortChildren(node.children);

      return (
        <div key={`dir:${node.path || "root"}`}>
          {node.path !== "" && (
            <button
              type="button"
              onClick={() => toggleDir(node.path)}
              className="hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm"
              style={indent}
            >
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <Folder className="h-4 w-4 text-amber-500" />
              <span className="truncate">{node.name}</span>
            </button>
          )}

          {(node.path === "" || isOpen) &&
            children.map((child) => renderNode(child, node.path === "" ? depth : depth + 1))}
        </div>
      );
    }

    const isSelected = node.path === selectedPath;
    return (
      <Button
        key={`file:${node.path}`}
        variant={isSelected ? "secondary" : "ghost"}
        className="h-8 w-full justify-start gap-2 px-2 text-left text-sm"
        style={indent}
        onClick={() => onSelectFile(node.path)}
      >
        <FileText className="h-4 w-4" />
        <span className="truncate">{node.name}</span>
        <span className="text-muted-foreground ml-auto text-xs">{node.size}b</span>
      </Button>
    );
  };

  return <div className="space-y-0.5">{renderNode(tree, 0)}</div>;
}

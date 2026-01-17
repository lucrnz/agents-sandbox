import * as React from "react";
import { ChevronDown, ChevronRight, FileText, Folder, Trash2 } from "lucide-react";
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
  onDeletePath,
  selectedPath,
}: {
  files: FileTreeFile[];
  onSelectFile: (path: string) => void;
  onDeletePath?: (input: { path: string; kind: "file" | "dir" }) => void;
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
            <div
              className="group hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm"
              style={indent}
            >
              <button
                type="button"
                onClick={() => toggleDir(node.path)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <Folder className="h-4 w-4 text-amber-500" />
                <span className="truncate">{node.name}</span>
              </button>
              {onDeletePath && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeletePath({ path: node.path, kind: "dir" });
                  }}
                  title="Delete folder"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {(node.path === "" || isOpen) &&
            children.map((child) => renderNode(child, node.path === "" ? depth : depth + 1))}
        </div>
      );
    }

    const isSelected = node.path === selectedPath;
    return (
      <div key={`file:${node.path}`} className="group relative" style={indent}>
        <Button
          variant={isSelected ? "secondary" : "ghost"}
          className="h-8 w-full justify-start gap-2 px-2 pr-8 text-left text-sm"
          onClick={() => onSelectFile(node.path)}
        >
          <FileText className="h-4 w-4" />
          <span className="truncate">{node.name}</span>
          <span className="text-muted-foreground ml-auto text-xs">{node.size}b</span>
        </Button>
        {onDeletePath && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onDeletePath({ path: node.path, kind: "file" });
            }}
            title="Delete file"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  };

  return <div className="space-y-0.5">{renderNode(tree, 0)}</div>;
}

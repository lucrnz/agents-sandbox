import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FolderPlus,
  Trash2,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Textarea } from "@/frontend/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/frontend/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import { FileTree, type FileTreeFile } from "@/frontend/components/file-tree";
import {
  CreateProject,
  DeleteProject,
  DeleteProjectPath,
  ExportProject,
  GetProjectFiles,
  GetProjects,
  ReadProjectFile,
  SelectProjectForConversation,
  SetPermissionMode,
  type Project,
  type ProjectPermissionMode,
} from "@/shared/commands";
import type { CommandDef } from "@/shared/command-system";

type SendFn = <TReq, TRes>(command: CommandDef<TReq, TRes>, payload: TReq) => Promise<TRes>;

function downloadBase64File(input: { filename: string; mimeType: string; base64: string }) {
  const bytes = Uint8Array.from(atob(input.base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: input.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = input.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ProjectsSidebar({
  isConnected,
  conversationId,
  send,
}: {
  isConnected: boolean;
  conversationId?: string;
  send: SendFn;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string>("");
  const [files, setFiles] = React.useState<FileTreeFile[]>([]);
  const [selectedFilePath, setSelectedFilePath] = React.useState<string>();
  const [selectedFileContent, setSelectedFileContent] = React.useState<string>("");
  const [pendingDelete, setPendingDelete] = React.useState<
    { path: string; kind: "file" | "dir" } | undefined
  >();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);

  const [permissionMode, setPermissionMode] = React.useState<ProjectPermissionMode>("ask");

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [newProjectName, setNewProjectName] = React.useState("");
  const [newProjectDescription, setNewProjectDescription] = React.useState("");

  const refreshProjects = React.useCallback(async () => {
    const res = await send(GetProjects, {});
    setProjects(res.projects);
    if (!selectedProjectId && res.projects.length) {
      setSelectedProjectId(res.projects[0]!.id);
    }
  }, [send, selectedProjectId]);

  const refreshFiles = React.useCallback(
    async (projectId: string) => {
      const res = await send(GetProjectFiles, { projectId });
      setFiles(res.files.map((f) => ({ path: f.path, size: f.size })));
    },
    [send],
  );

  React.useEffect(() => {
    if (!isOpen || !isConnected) return;
    refreshProjects().catch(() => {});
  }, [isOpen, isConnected, refreshProjects]);

  React.useEffect(() => {
    if (!isOpen || !isConnected || !selectedProjectId) return;
    refreshFiles(selectedProjectId).catch(() => {});
  }, [isOpen, isConnected, selectedProjectId, refreshFiles]);

  const handleSelectProject = async (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedFilePath(undefined);
    setSelectedFileContent("");

    if (conversationId) {
      const res = await send(SelectProjectForConversation, { conversationId, projectId });
      setPermissionMode(res.permissionMode);
    }
  };

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;

    const res = await send(CreateProject, {
      name,
      description: newProjectDescription.trim() || undefined,
    });

    setIsCreateOpen(false);
    setNewProjectName("");
    setNewProjectDescription("");
    await refreshProjects();
    await handleSelectProject(res.project.id);
  };

  const handleDeleteProject = async () => {
    if (!selectedProjectId) return;
    await send(DeleteProject, { projectId: selectedProjectId });
    setSelectedProjectId("");
    setFiles([]);
    setSelectedFilePath(undefined);
    setSelectedFileContent("");
    await refreshProjects();
  };

  const handleExportProject = async (format: "zip" | "tar.gz") => {
    if (!selectedProjectId) return;
    const res = await send(ExportProject, { projectId: selectedProjectId, format });
    downloadBase64File(res);
  };

  const handleSelectFile = async (path: string) => {
    if (!selectedProjectId) return;
    setSelectedFilePath(path);
    const res = await send(ReadProjectFile, { projectId: selectedProjectId, path });
    setSelectedFileContent(res.content);
  };

  const handlePermissionModeChange = async (mode: ProjectPermissionMode) => {
    setPermissionMode(mode);
    if (!conversationId) return;
    const res = await send(SetPermissionMode, { conversationId, permissionMode: mode });
    setPermissionMode(res.permissionMode);
  };

  const getDeleteCount = React.useCallback(
    (path: string, kind: "file" | "dir") => {
      if (kind === "file") return 1;
      const prefix = `${path}/`;
      return files.filter((file) => file.path === path || file.path.startsWith(prefix)).length;
    },
    [files],
  );

  const handleRequestDelete = (input: { path: string; kind: "file" | "dir" }) => {
    setPendingDelete(input);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || !selectedProjectId) return;
    const target = pendingDelete;
    setIsDeleteDialogOpen(false);

    await send(DeleteProjectPath, {
      projectId: selectedProjectId,
      path: target.path,
      kind: target.kind,
    });

    if (selectedFilePath) {
      if (target.kind === "file" && selectedFilePath === target.path) {
        setSelectedFilePath(undefined);
        setSelectedFileContent("");
      }
      if (target.kind === "dir") {
        const prefix = `${target.path}/`;
        if (selectedFilePath === target.path || selectedFilePath.startsWith(prefix)) {
          setSelectedFilePath(undefined);
          setSelectedFileContent("");
        }
      }
    }

    setPendingDelete(undefined);
    await refreshFiles(selectedProjectId);
  };

  return (
    <div className="relative h-screen">
      {/* Toggle button */}
      <div className="absolute top-20 right-0 z-20">
        <Button
          variant="outline"
          size="icon"
          className="rounded-l-lg rounded-r-none"
          onClick={() => setIsOpen((v) => !v)}
          title={isOpen ? "Close Projects" : "Open Projects"}
        >
          {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Sidebar */}
      {isOpen && (
        <aside
          className={`bg-card border-muted-foreground/20 fixed top-0 right-0 z-10 flex h-screen flex-col border-l shadow-lg transition-all duration-300 ${
            isExpanded ? "w-[75Okayvw]" : "w-[420px]"
          }`}
        >
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-foreground text-lg font-semibold">Projects</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsExpanded((v) => !v)}
                  title={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsCreateOpen(true)}
                  title="New project"
                >
                  <FolderPlus className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleExportProject("zip")}
                  disabled={!selectedProjectId}
                  title="Export as zip"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleDeleteProject}
                  disabled={!selectedProjectId}
                  title="Delete project"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <Select value={selectedProjectId} onValueChange={handleSelectProject}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">Permission mode</span>
                <Select
                  value={permissionMode}
                  onValueChange={(v) => handlePermissionModeChange(v as ProjectPermissionMode)}
                >
                  <SelectTrigger size="sm" className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ask">Ask</SelectItem>
                    <SelectItem value="yolo">YOLO</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={!selectedProjectId}
                  onClick={() => handleExportProject("tar.gz")}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export tar.gz
                </Button>
              </div>
            </div>
          </div>

          <div
            className={`grid min-h-0 flex-1 gap-0 ${
              isExpanded ? "grid-cols-[300px_1fr]" : "grid-cols-2"
            }`}
          >
            <div className="min-h-0 overflow-auto border-r p-3">
              <FileTree
                files={files}
                onSelectFile={handleSelectFile}
                onDeletePath={handleRequestDelete}
                selectedPath={selectedFilePath}
              />
            </div>
            <div className="min-h-0 overflow-auto p-3">
              <div className="text-muted-foreground mb-2 text-xs">
                {selectedFilePath ? selectedFilePath : "Select a file to preview"}
              </div>
              {selectedFilePath ? (
                <pre className="bg-muted/50 overflow-auto rounded-md p-3 text-xs leading-relaxed">
                  {selectedFileContent}
                </pre>
              ) : (
                <div className="text-muted-foreground text-sm">No file selected.</div>
              )}
            </div>
          </div>
        </aside>
      )}

      {/* Create project dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>Create a new project to store generated files.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Name</div>
              <Input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="My project"
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Description (optional)</div>
              <Textarea
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                placeholder="What is this project for?"
                className="min-h-[90px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateProject} disabled={!newProjectName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          setIsDeleteDialogOpen(open);
          if (!open) setPendingDelete(undefined);
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              {pendingDelete?.kind === "dir" ? "Delete Folder" : "Delete File"}
            </DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? pendingDelete.kind === "dir"
                  ? "This will permanently remove the folder and its contents from the project."
                  : "This will permanently remove the file from the project."
                : ""}
            </DialogDescription>
          </DialogHeader>
          {pendingDelete && (
            <div className="space-y-3 py-2 text-sm">
              <div className="rounded-md border px-3 py-2">
                <div className="text-muted-foreground text-xs tracking-wide uppercase">Path</div>
                <div className="mt-1 font-medium break-all">{pendingDelete.path}</div>
              </div>
              <div className="rounded-md border px-3 py-2">
                <div className="text-muted-foreground text-xs tracking-wide uppercase">
                  Files to delete
                </div>
                <div className="mt-1 font-medium">
                  {getDeleteCount(pendingDelete.path, pendingDelete.kind)}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

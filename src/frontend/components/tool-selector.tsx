import * as React from "react";
import { Telescope, Plus, FolderCode, Container } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/frontend/components/ui/dropdown-menu";
import type { ToolName } from "@/shared/commands";

interface ToolSelectorProps {
  selectedTools: ToolName[];
  onToolsChange: (tools: ToolName[]) => void;
  disabled?: boolean;
}

export function ToolSelector({ selectedTools, onToolsChange, disabled }: ToolSelectorProps) {
  const isDeepResearchEnabled = selectedTools.includes("deep_research");
  const isFilesystemEnabled = selectedTools.includes("filesystem");
  const isContainerEnabled = selectedTools.includes("container");

  const handleToolToggle = (toolName: ToolName, checked: boolean) => {
    if (checked) {
      // Container implies filesystem
      if (toolName === "container") {
        const next = new Set<ToolName>([...selectedTools, "container", "filesystem"]);
        onToolsChange(Array.from(next));
        return;
      }
      onToolsChange([...selectedTools, toolName]);
    } else {
      // If filesystem is turned off, container must also be turned off
      if (toolName === "filesystem") {
        onToolsChange(selectedTools.filter((t) => t !== "filesystem" && t !== "container"));
        return;
      }
      onToolsChange(selectedTools.filter((t) => t !== toolName));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full"
          disabled={disabled}
        >
          {isContainerEnabled ? (
            <Container className="h-4 w-4 text-emerald-500" />
          ) : isFilesystemEnabled ? (
            <FolderCode className="h-4 w-4 text-amber-500" />
          ) : isDeepResearchEnabled ? (
            <Telescope className="h-4 w-4 text-blue-500" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          <span className="sr-only">Toggle tools</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Available Tools</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={isDeepResearchEnabled}
          onCheckedChange={(checked) => handleToolToggle("deep_research", checked)}
        >
          <div className="flex items-center gap-2">
            <Telescope className="h-4 w-4" />
            <span>Deep Research</span>
          </div>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={isFilesystemEnabled}
          onCheckedChange={(checked) => handleToolToggle("filesystem", checked)}
        >
          <div className="flex items-center gap-2">
            <FolderCode className="h-4 w-4" />
            <span>Filesystem</span>
          </div>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={isContainerEnabled}
          onCheckedChange={(checked) => handleToolToggle("container", checked)}
        >
          <div className="flex items-center gap-2">
            <Container className="h-4 w-4" />
            <span>Container</span>
          </div>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

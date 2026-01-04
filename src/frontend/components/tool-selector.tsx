import * as React from "react";
import { Telescope, Plus } from "lucide-react";
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
  const isDeepResearchEnabled = selectedTools.includes("agentic_fetch");

  const handleToolToggle = (toolName: ToolName, checked: boolean) => {
    if (checked) {
      onToolsChange([...selectedTools, toolName]);
    } else {
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
          {isDeepResearchEnabled ? (
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
          onCheckedChange={(checked) => handleToolToggle("agentic_fetch", checked)}
        >
          <div className="flex items-center gap-2">
            <Telescope className="h-4 w-4" />
            <span>Deep Research</span>
          </div>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

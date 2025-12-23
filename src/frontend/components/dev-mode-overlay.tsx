import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { X, ChevronDown } from "lucide-react";
import { Rnd } from "react-rnd";
import { Button } from "@/frontend/components/ui/button";
import { Checkbox } from "@/frontend/components/ui/checkbox";
import { Label } from "@/frontend/components/ui/label";
import { useDevMode } from "@/frontend/contexts/dev-mode-context";

export function DevModeOverlay() {
  const [location] = useLocation();
  const { isOverlayOpen, setIsOverlayOpen, allowSendingMessages, setAllowSendingMessages } =
    useDevMode();
  const [position, setPosition] = useState({ x: 0, y: 16 });
  const [size, setSize] = useState({ width: 320, height: 40 });
  const contentRef = useRef<HTMLDivElement>(null);

  const isChatPage = location === "/chat";

  // Initialize position on mount
  useEffect(() => {
    setPosition({ x: window.innerWidth - 320 - 16, y: 16 });
  }, []);

  // Update size based on content when expanded/collapsed
  useEffect(() => {
    if (contentRef.current) {
      const height = contentRef.current.scrollHeight;
      setSize((prev) => ({ ...prev, height }));
    } else {
      // Collapsed state - just header height
      setSize((prev) => ({ ...prev, height: 40 }));
    }
  }, [isOverlayOpen, isChatPage]);

  return (
    <Rnd
      size={size}
      position={position}
      onDragStop={(e, d) => setPosition({ x: d.x, y: d.y })}
      minWidth={280}
      bounds="window"
      enableResizing={isOverlayOpen ? { bottom: true, right: true } : false}
      style={{
        zIndex: 50,
      }}
      className="bg-card/95 border-border rounded-lg border shadow-lg backdrop-blur-sm"
    >
      <div ref={contentRef} className="flex flex-col">
        {/* Window Header */}
        <div className="bg-muted/50 border-b-border flex flex-row items-center justify-between border-b px-3 py-2">
          <h3 className="text-sm font-semibold">Dev Mode Tools</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOverlayOpen(!isOverlayOpen)}
            className="h-6 w-6 p-0"
            aria-label={isOverlayOpen ? "Collapse overlay" : "Expand overlay"}
          >
            {isOverlayOpen ? <X className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        {/* Window Content */}
        {isOverlayOpen && (
          <div className="space-y-4 p-4">
            {isChatPage && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="allow-sending-messages"
                  checked={allowSendingMessages}
                  onCheckedChange={(checked) => setAllowSendingMessages(checked === true)}
                />
                <Label
                  htmlFor="allow-sending-messages"
                  className="cursor-pointer text-sm font-normal"
                >
                  Allow sending messages
                  <span className="text-muted-foreground mt-1 block text-xs">
                    Overrides send button disabled status. Useful for automation environments (e.g.,
                    Playwright, Cursor Browser tab).
                  </span>
                </Label>
              </div>
            )}
            {!isChatPage && (
              <p className="text-muted-foreground text-sm">
                No dev controls available for this page.
              </p>
            )}
          </div>
        )}
      </div>
    </Rnd>
  );
}

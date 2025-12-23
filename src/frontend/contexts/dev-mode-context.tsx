import { createContext, useContext, useState, type ReactNode } from "react";

interface DevModeContextValue {
  isOverlayOpen: boolean;
  setIsOverlayOpen: (open: boolean) => void;
  allowSendingMessages: boolean;
  setAllowSendingMessages: (allow: boolean) => void;
}

const DevModeContext = createContext<DevModeContextValue | undefined>(undefined);

export function DevModeProvider({ children }: { children: ReactNode }) {
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [allowSendingMessages, setAllowSendingMessages] = useState(false);

  return (
    <DevModeContext.Provider
      value={{
        isOverlayOpen,
        setIsOverlayOpen,
        allowSendingMessages,
        setAllowSendingMessages,
      }}
    >
      {children}
    </DevModeContext.Provider>
  );
}

export function useDevMode() {
  const context = useContext(DevModeContext);
  // Return default values if not in provider (production mode)
  if (context === undefined) {
    return {
      isOverlayOpen: false,
      setIsOverlayOpen: () => {},
      allowSendingMessages: false,
      setAllowSendingMessages: () => {},
    };
  }
  return context;
}

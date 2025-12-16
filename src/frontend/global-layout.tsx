import { useLayoutEffect } from "react";
import "./index.css";

/**
 * Do not place providers here.
 * This is mostly for importing global styles.
 */
export function GlobalLayout({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    const applySystemTheme = () => {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    // Apply theme immediately
    applySystemTheme();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', applySystemTheme);

    return () => {
      mediaQuery.removeEventListener('change', applySystemTheme);
    };
  }, []);

  return <>{children}</>;
}

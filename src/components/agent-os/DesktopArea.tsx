import { useState, useEffect } from 'react';
import WindowManager from './WindowManager';

// ── Constants ────────────────────────────────────────────────────

const LS_WALLPAPER_KEY = 'agent-os-wallpaper';
const DEFAULT_WALLPAPER = '#1a1a1f';

// ── Wallpaper state & helpers ────────────────────────────────────

interface WallpaperState {
  type: 'color' | 'image';
  value: string;
}

function loadWallpaper(): WallpaperState {
  try {
    const raw = localStorage.getItem(LS_WALLPAPER_KEY);
    if (raw) {
      if (raw.startsWith('data:')) {
        return { type: 'image', value: raw };
      }
      return { type: 'color', value: raw };
    }
  } catch {
    // Corrupted
  }
  return { type: 'color', value: DEFAULT_WALLPAPER };
}

type DockState = 'show' | 'hide' | 'float';

/**
 * Desktop canvas with wallpaper support and window management.
 *
 * Always fills the full container — wallpaper covers the entire area
 * including behind the dock bar (which overlays with glassmorphism).
 * Window maximize dimensions are handled by WindowManager based on
 * dockState so maximized windows leave room for the dock in "show" mode.
 */
export default function DesktopArea({
  settingsVersion,
  dockState,
}: {
  settingsVersion?: number;
  dockState?: DockState;
}) {
  const [wallpaper, setWallpaper] = useState<WallpaperState>(loadWallpaper);

  // Re-read wallpaper when settings modal closes (settingsVersion increments)
  useEffect(() => {
    if (settingsVersion !== undefined && settingsVersion > 0) {
      setWallpaper(loadWallpaper());
    }
  }, [settingsVersion]);

  // Listen for wallpaper-changed event for instant apply
  useEffect(() => {
    const handler = () => setWallpaper(loadWallpaper());
    window.addEventListener('agent-os-wallpaper-changed', handler);
    return () => window.removeEventListener('agent-os-wallpaper-changed', handler);
  }, []);

  // Auto-switch wallpaper when theme (dark/light) changes — only if no custom wallpaper set
  useEffect(() => {
    const checkTheme = () => {
      const current = loadWallpaper();
      // Only auto-switch if no custom wallpaper was set by user
      const stored = localStorage.getItem(LS_WALLPAPER_KEY);
      if (stored) return; // user has custom wallpaper, respect it
      const isDark = document.documentElement.classList.contains('dark');
      const autoWallpaper = isDark ? '#1a1a1f' : '#e8e6e1';
      setWallpaper({ type: 'color', value: autoWallpaper });
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const bgStyle =
    wallpaper.type === 'image'
      ? {
          backgroundImage: `url(${wallpaper.value})`,
          backgroundSize: 'cover' as const,
          backgroundPosition: 'center' as const,
        }
      : { background: wallpaper.value };

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={bgStyle}
    >
      <WindowManager dockState={dockState} />
    </div>
  );
}

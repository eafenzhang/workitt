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

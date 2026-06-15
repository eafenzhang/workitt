import { useEffect, useRef, useCallback } from 'react';
import type { OSWindow, WebviewTier, BrowserSnapshot } from '../types/agent-os';
import { HOT_MAX, WARM_MAX, HOT_TO_WARM_MS, WARM_TO_COLD_MS } from '../types/agent-os';

interface UseWebviewTierOptions {
  windows: OSWindow[];
  activeWindowId: string | null;
  previousActiveId: React.RefObject<string | null>;
  setWindowTier: (id: string, tier: WebviewTier, snapshot?: BrowserSnapshot) => void;
}

/**
 * Manages three-tier webview cache for desktop-mode browser windows.
 *
 * Hot (≤2): fully active rendering — focused + last-focused browser windows.
 * Warm (≤3): frozen DOM — non-active but recently used.
 * Cold (unlimited): destroyed webview, only metadata snapshot kept.
 *
 * Only applies to windows with type === 'browser'.
 */
export function useWebviewTier({ windows, activeWindowId, previousActiveId, setWindowTier }: UseWebviewTierOptions) {
  const hotIdsRef = useRef<Set<string>>(new Set());

  // ── Refs to avoid interval recreation ───────────────────────────
  const windowsRef = useRef(windows);
  windowsRef.current = windows;
  const activeWindowIdRef = useRef(activeWindowId);
  activeWindowIdRef.current = activeWindowId;

  // ── Derive hot set from active + previous ──────────────────────
  const computeHot = useCallback(() => {
    const hot: string[] = [];
    const aid = activeWindowIdRef.current;
    if (aid) hot.push(aid);
    const prev = previousActiveId.current;
    if (prev && prev !== aid) hot.push(prev);
    return new Set(hot.slice(0, HOT_MAX));
  }, []);

  // ── Periodic tier rebalancing ──────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const browserWindows = windowsRef.current.filter(w => w.type === 'browser');
      const hotSet = computeHot();
      hotIdsRef.current = hotSet;

      // Upgrade: hot-set windows that aren't hot → hot tier
      for (const win of browserWindows) {
        if (hotSet.has(win.id) && win.webviewTier !== 'hot') {
          console.log(`[WebviewTier] ${win.id} → hot`);
          setWindowTier(win.id, 'hot');
        }
      }

      // Downgrade: hot windows not in hotSet → warm (if inactive > HOT_TO_WARM_MS)
      for (const win of browserWindows) {
        if (win.webviewTier === 'hot' && !hotSet.has(win.id)) {
          const inactiveMs = now - (win.lastActiveTime ?? 0);
          if (inactiveMs >= HOT_TO_WARM_MS) {
            console.log(`[WebviewTier] ${win.id} → warm (inactive ${(inactiveMs / 1000).toFixed(0)}s)`);
            setWindowTier(win.id, 'warm');
          }
        }
      }

      // Downgrade: warm windows inactive > WARM_TO_COLD_MS → cold
      for (const win of browserWindows) {
        if (win.webviewTier === 'warm') {
          const inactiveMs = now - (win.lastActiveTime ?? 0);
          if (inactiveMs >= WARM_TO_COLD_MS) {
            const snapshot: BrowserSnapshot = {
              url: win.snapshot?.url ?? win.initialUrl ?? 'about:blank',
              title: win.snapshot?.title ?? win.title,
            };
            console.log(`[WebviewTier] ${win.id} → cold (inactive ${(inactiveMs / 1000).toFixed(0)}s)`);
            setWindowTier(win.id, 'cold', snapshot);
          }
        }
      }

      // Enforce WARM_MAX: extra warm → cold
      const warmWindows = browserWindows.filter(w => w.webviewTier === 'warm');
      if (warmWindows.length > WARM_MAX) {
        const toDemote = warmWindows
          .sort((a, b) => (a.lastActiveTime ?? 0) - (b.lastActiveTime ?? 0))
          .slice(0, warmWindows.length - WARM_MAX);
        for (const win of toDemote) {
          const snapshot: BrowserSnapshot = {
            url: win.snapshot?.url ?? win.initialUrl ?? 'about:blank',
            title: win.snapshot?.title ?? win.title,
          };
          console.log(`[WebviewTier] ${win.id} → cold (warm pool full)`);
          setWindowTier(win.id, 'cold', snapshot);
        }
      }
    }, 2000); // Check every 2s for responsive tier transitions

    return () => clearInterval(interval);
  }, []);

  // ── Initialize tiers on first mount ────────────────────────────
  useEffect(() => {
    const hotSet = computeHot();
    hotIdsRef.current = hotSet;
    const now = Date.now();
    for (const win of windows) {
      if (win.type !== 'browser') continue;
      if (!win.webviewTier) {
        const tier: WebviewTier = hotSet.has(win.id) ? 'hot' : 'cold';
        setWindowTier(win.id, tier, tier === 'cold' ? {
          url: win.initialUrl ?? 'about:blank',
          title: win.title,
        } : undefined);
      }
      if (!win.lastActiveTime && hotSet.has(win.id)) {
        // Set initial active time for hot windows
        setWindowTier(win.id, 'hot');
      }
    }
  }, []); // Run once on mount

  return { hotIdsRef };
}

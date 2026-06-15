import { useState, useEffect, useRef, useCallback } from 'react';
import { XIcon, UploadIcon, ImageIcon } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────

interface DesktopSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type WallpaperType = 'color' | 'image';
type DockFullscreenBehavior = 'show' | 'hide' | 'float';
type IconStyle = 'gradient' | 'linear';

interface WallpaperState {
  type: WallpaperType;
  value: string;
}

// ── Constants ────────────────────────────────────────────────────

const LS_WALLPAPER_KEY = 'agent-os-wallpaper';
const LS_DOCK_FS_KEY = 'agent-os-dock-fullscreen';
const LS_ICON_STYLE_KEY = 'agent-os-icon-style';

const COLOR_PRESETS = [
  { id: 'dark-1', bg: '#1a1a1f', label: '暗色' },
  { id: 'navy', bg: '#2d2d44', label: '深蓝灰' },
  { id: 'forest', bg: '#1a2a1a', label: '暗绿' },
  { id: 'plum', bg: '#2a1a1a', label: '暗红' },
  { id: 'deep-blue', bg: '#1a1a2a', label: '深蓝' },
  { id: 'olive', bg: '#2a2a1a', label: '暗金' },
  { id: 'light-blue', bg: '#dceefb', label: '浅蓝' },
  { id: 'light-green', bg: '#e8f5e9', label: '浅绿' },
  { id: 'light-gray', bg: '#f0f0f0', label: '浅灰' },
  { id: 'cream', bg: '#faf8f5', label: '米白' },
];

const DOCK_OPTIONS: { value: DockFullscreenBehavior; label: string }[] = [
  { value: 'show', label: '始终显示' },
  { value: 'hide', label: '自动隐藏' },
  { value: 'float', label: '悬浮显示' },
];

// ── Helpers ──────────────────────────────────────────────────────

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
  return { type: 'color', value: COLOR_PRESETS[0].bg };
}

function saveWallpaper(state: WallpaperState) {
  try {
    localStorage.setItem(LS_WALLPAPER_KEY, state.value);
    window.dispatchEvent(new CustomEvent('agent-os-wallpaper-changed'));
  } catch {
    // Storage quota exceeded
  }
}

function loadDockBehavior(): DockFullscreenBehavior {
  try {
    const raw = localStorage.getItem(LS_DOCK_FS_KEY);
    if (raw === 'show' || raw === 'hide' || raw === 'float') return raw;
  } catch {
    // Corrupted
  }
  return 'show';
}

function saveDockBehavior(behavior: DockFullscreenBehavior) {
  try {
    localStorage.setItem(LS_DOCK_FS_KEY, behavior);
    window.dispatchEvent(new CustomEvent('agent-os-dock-changed'));
  } catch {
    // Storage quota exceeded
  }
}

function loadIconStyle(): IconStyle {
  try {
    const raw = localStorage.getItem(LS_ICON_STYLE_KEY);
    if (raw === 'gradient' || raw === 'linear') return raw;
  } catch {}
  return 'linear';
}

function saveIconStyle(style: IconStyle) {
  try {
    localStorage.setItem(LS_ICON_STYLE_KEY, style);
    window.dispatchEvent(new CustomEvent('agent-os-icon-style-changed'));
  } catch {
    // Storage quota exceeded
  }
}

// ── Component ────────────────────────────────────────────────────

export default function DesktopSettingsModal({ isOpen, onClose }: DesktopSettingsModalProps) {
  const [wallpaper, setWallpaper] = useState<WallpaperState>(loadWallpaper);
  const [dockBehavior, setDockBehavior] = useState<DockFullscreenBehavior>(loadDockBehavior);
  const [iconStyle, setIconStyle] = useState<IconStyle>(loadIconStyle);
  const [animating, setAnimating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fade animation
  useEffect(() => {
    if (isOpen) {
      setWallpaper(loadWallpaper());
      setDockBehavior(loadDockBehavior());
      setIconStyle(loadIconStyle());
      requestAnimationFrame(() => setAnimating(true));
    } else {
      setAnimating(false);
    }
  }, [isOpen]);

  const animateClose = useCallback(() => {
    setAnimating(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  // ── Keyboard: Escape to close ──
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') animateClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, animateClose]);

  // ── Handlers ──

  const selectColor = useCallback((color: string) => {
    const next: WallpaperState = { type: 'color', value: color };
    setWallpaper(next);
    saveWallpaper(next);
  }, []);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const next: WallpaperState = { type: 'image', value: dataUrl };
      setWallpaper(next);
      saveWallpaper(next);
    };
    reader.readAsDataURL(file);

    // Reset input so the same file can be re-uploaded
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleDockChange = useCallback((behavior: DockFullscreenBehavior) => {
    setDockBehavior(behavior);
    saveDockBehavior(behavior);
  }, []);

  const handleIconStyleChange = useCallback((style: IconStyle) => {
    setIconStyle(style);
    saveIconStyle(style);
  }, []);

  const isCurrentColor = (color: string) =>
    wallpaper.type === 'color' && wallpaper.value === color;

  if (!isOpen && !animating) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center"
      style={{
        background: 'rgba(0,0,0,0.45)',
        opacity: animating ? 1 : 0,
        transition: 'opacity 0.2s ease-out',
      }}
      onClick={animateClose}
    >
      <div
        className="rounded-xl overflow-hidden w-[420px] max-h-[560px] flex flex-col mx-4"
        style={{
          background: 'var(--wiki-surface)',
          border: '1px solid var(--wiki-border)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
          opacity: animating ? 1 : 0,
          transform: animating ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(8px)',
          transition: 'opacity 0.2s ease-out, transform 0.2s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--wiki-border)' }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--wiki-text)' }}>
            桌面设置
          </span>
          <button
            onClick={animateClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-wiki-surface2 transition-colors"
            aria-label="关闭"
          >
            <XIcon size={14} style={{ color: 'var(--wiki-text3)' }} />
          </button>
        </div>

        {/* ── Body (scrollable) ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* ── Wallpaper: Color presets ── */}
          <section>
            <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--wiki-text2)' }}>
              桌面壁纸
            </h3>
            <div className="grid grid-cols-6 gap-2">
              {COLOR_PRESETS.map(cp => (
                <button
                  key={cp.id}
                  onClick={() => selectColor(cp.bg)}
                  className="relative w-full aspect-square rounded-lg transition-all hover:scale-105"
                  style={{
                    background: cp.bg,
                    border: isCurrentColor(cp.bg)
                      ? '2px solid var(--wiki-accent)'
                      : '1px solid var(--wiki-border)',
                  }}
                  title={cp.label}
                >
                  {isCurrentColor(cp.bg) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ background: 'var(--wiki-accent)' }}
                      />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* ── Wallpaper: Image upload ── */}
          <section>
            <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--wiki-text2)' }}>
              自定义图片
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs transition-colors hover:bg-wiki-surface2"
                style={{
                  background: 'var(--wiki-surface2)',
                  color: 'var(--wiki-text2)',
                  border: '1px solid var(--wiki-border)',
                }}
              >
                <UploadIcon size={14} />
                上传图片
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
              {wallpaper.type === 'image' && (
                <div className="flex items-center gap-1.5">
                  <ImageIcon size={12} style={{ color: 'var(--wiki-accent)' }} />
                  <span className="text-xs" style={{ color: 'var(--wiki-accent)' }}>
                    已设置
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* ── Divider ── */}
          <div style={{ borderTop: '1px solid var(--wiki-border)' }} />

          {/* ── Dock behavior ── */}
          <section>
            <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--wiki-text2)' }}>
              Dock栏行为
            </h3>
            <div
              className="rounded-lg p-1 flex gap-1"
              style={{
                background: 'var(--wiki-surface2)',
                border: '1px solid var(--wiki-border)',
              }}
            >
              {DOCK_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleDockChange(opt.value)}
                  className="flex-1 py-1.5 rounded-md text-xs transition-colors"
                  style={{
                    background:
                      dockBehavior === opt.value
                        ? 'var(--wiki-surface)'
                        : 'transparent',
                    color:
                      dockBehavior === opt.value
                        ? 'var(--wiki-text)'
                        : 'var(--wiki-text3)',
                    boxShadow:
                      dockBehavior === opt.value
                        ? '0 1px 3px rgba(0,0,0,0.12)'
                        : 'none',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--wiki-text3)' }}>
              Dock 栏的显示方式
            </p>
          </section>

          {/* ── Divider ── */}
          <div style={{ borderTop: '1px solid var(--wiki-border)' }} />

          {/* ── Icon style ── */}
          <section>
            <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--wiki-text2)' }}>
              Dock 图标风格
            </h3>
            <div
              className="rounded-lg p-1 flex gap-1"
              style={{
                background: 'var(--wiki-surface2)',
                border: '1px solid var(--wiki-border)',
              }}
            >
              <button
                onClick={() => handleIconStyleChange('linear')}
                className="flex-1 py-1.5 rounded-md text-xs transition-colors"
                style={{
                  background:
                    iconStyle === 'linear'
                      ? 'var(--wiki-surface)'
                      : 'transparent',
                  color:
                    iconStyle === 'linear'
                      ? 'var(--wiki-text)'
                      : 'var(--wiki-text3)',
                  boxShadow:
                    iconStyle === 'linear'
                      ? '0 1px 3px rgba(0,0,0,0.12)'
                      : 'none',
                }}
              >
                线性图标
              </button>
              <button
                onClick={() => handleIconStyleChange('gradient')}
                className="flex-1 py-1.5 rounded-md text-xs transition-colors"
                style={{
                  background:
                    iconStyle === 'gradient'
                      ? 'var(--wiki-surface)'
                      : 'transparent',
                  color:
                    iconStyle === 'gradient'
                      ? 'var(--wiki-text)'
                      : 'var(--wiki-text3)',
                  boxShadow:
                    iconStyle === 'gradient'
                      ? '0 1px 3px rgba(0,0,0,0.12)'
                      : 'none',
                }}
              >
                渐变图标
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--wiki-text3)' }}>
              默认线性图标，勾选后显示 macOS 风格渐变背景图标
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

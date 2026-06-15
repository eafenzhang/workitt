import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface PortalDropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  open: boolean;
  onClose: () => void;
  alignX?: 'left' | 'right';
  alignY?: 'above' | 'below';
  gap?: number;
}

export default function PortalDropdown({
  trigger,
  children,
  open,
  onClose,
  alignX = 'left',
  alignY = 'below',
  gap = 4,
}: PortalDropdownProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePos = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({
        top: alignY === 'above' ? rect.top - gap : rect.bottom + gap,
        left: alignX === 'left' ? rect.left : rect.right,
      });
    }
  };

  useEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  const portalRoot = document.getElementById('portal-root');
  if (!portalRoot) return null;

  return (
    <>
      <div ref={triggerRef} style={{ display: 'inline-block' }}>
        {trigger}
      </div>
      {open &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: pos.top,
              left: alignX === 'left' ? pos.left : 'auto',
              right: alignX === 'right' ? 0 : 'auto',
              transform:
                alignX === 'right'
                  ? `translateX(${window.innerWidth - pos.left}px)`
                  : 'none',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>,
          portalRoot,
        )}
    </>
  );
}

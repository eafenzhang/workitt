import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';

interface LightboxProps {
  /** Array of image URLs to navigate through */
  images: string[];
  /** Initial image index to display */
  index: number;
  /** Called when the lightbox is dismissed */
  onClose: () => void;
  /** Alt text for the current image */
  altText?: string;
}

/**
 * Shared image preview lightbox with keyboard navigation.
 * Handles prev/next navigation, Escape-to-close, and backdrop click-to-close.
 *
 * Used by Requirements detail, QuickCapture, and ContentBlockRenderer.
 */
export default function Lightbox({ images, index, onClose, altText }: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(index);

  // Sync with external index changes
  useEffect(() => {
    setCurrentIndex(index);
  }, [index]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i < images.length - 1 ? i + 1 : i));
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, goPrev, goNext]);

  if (images.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'var(--wiki-overlay-heavy)' }}
      onClick={onClose}
    >
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
        {currentIndex + 1} / {images.length}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl"
        aria-label="关闭预览"
      >
        ×
      </button>
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          aria-label="上一张"
        >
          <ChevronLeftIcon size={24} />
        </button>
      )}
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          aria-label="下一张"
        >
          <ChevronRightIcon size={24} />
        </button>
      )}
      <img
        src={images[currentIndex]}
        className="max-w-[85vw] max-h-[85vh] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
        alt={altText || '预览图片'}
      />
    </div>
  );
}

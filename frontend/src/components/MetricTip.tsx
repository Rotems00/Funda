import React, { useState, useRef, useEffect } from 'react';
import { METRIC_GLOSSARY } from '../data/metricGlossary';

interface MetricTipProps {
  metric: string;            // key into METRIC_GLOSSARY
  className?: string;        // extra class on the wrapper
  children?: React.ReactNode; // optional custom trigger (defaults to an “i” dot)
}

/**
 * Hover- or click-to-open explainer for a financial metric. Shows a small
 * popover with a static, ticker-agnostic definition so users can learn what
 * each number means. Works on desktop (hover/focus) and touch (tap toggles).
 */
export const MetricTip: React.FC<MetricTipProps> = ({ metric, className, children }) => {
  const def = METRIC_GLOSSARY[metric];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Close when tapping/clicking elsewhere (so a pinned tip dismisses on touch)
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (!def) return <>{children}</>;

  return (
    <span
      ref={ref}
      className={`mtip ${className || ''}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); }
        if (e.key === 'Escape') setOpen(false);
      }}
      role="button"
      tabIndex={0}
      aria-label={`What is ${def.title}?`}
      aria-expanded={open}
    >
      {children ?? <span className="mtip-dot" aria-hidden="true">i</span>}
      {open && (
        <span className="mtip-pop" role="tooltip" onClick={(e) => e.stopPropagation()}>
          <span className="mtip-title">{def.title}</span>
          <span className="mtip-body">{def.body}</span>
          {def.rule && <span className="mtip-rule">{def.rule}</span>}
        </span>
      )}
    </span>
  );
};

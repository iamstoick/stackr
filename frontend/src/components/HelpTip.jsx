import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { GLOSSARY } from '../utils/glossary.js';

const WIDTH = 272;
const EDGE_MARGIN = 10;
const GAP = 8;

/**
 * A beginner-facing explanation attached to a chart element or column header.
 *
 * Rendered through a portal into document.body on purpose: these triggers sit
 * inside chart panels and scrolling tables that clip their own overflow and
 * create stacking contexts, so an absolutely positioned bubble would be cut off
 * or painted underneath the next panel. A portal escapes both, at the cost of
 * having to position the bubble manually against the trigger's viewport rect.
 *
 * Opens on hover, focus, or tap, and closes on Escape, outside click, or scroll
 * of an ancestor — since a fixed bubble would otherwise drift away from its
 * trigger.
 */
export function HelpTip({ term, title, body, note, label, children, className = '' }) {
  const entry = term ? GLOSSARY[term] : null;
  const heading = title ?? entry?.title ?? 'About this';
  const text = body ?? entry?.body ?? '';
  const footnote = note ?? entry?.note ?? null;

  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const bubbleRef = useRef(null);
  const tooltipId = useId();
  // Escape returns focus to the trigger, and hover may still be over it, so
  // without this the open-on-focus/hover handler would immediately reopen what
  // the reader just dismissed. Cleared as soon as they move or tab away.
  const dismissedRef = useRef(false);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const height = bubbleRef.current?.offsetHeight ?? 108;

    // Prefer above; flip below when there is not room, so the bubble never
    // covers the value the reader is asking about.
    const fitsAbove = rect.top > height + GAP + EDGE_MARGIN;
    const top = fitsAbove ? rect.top - height - GAP : rect.bottom + GAP;

    const centred = rect.left + rect.width / 2 - WIDTH / 2;
    const left = Math.min(
      Math.max(EDGE_MARGIN, centred),
      Math.max(EDGE_MARGIN, window.innerWidth - WIDTH - EDGE_MARGIN),
    );

    setPosition({
      top,
      left,
      above: fitsAbove,
      arrowLeft: Math.min(Math.max(14, rect.left + rect.width / 2 - left), WIDTH - 14),
    });
  }, []);

  // Measure after the bubble exists, so the flip decision uses its real height.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;

    const close = () => setOpen(false);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        dismissedRef.current = true;
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event) => {
      if (!triggerRef.current?.contains(event.target) && !bubbleRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    // Capture phase catches scrolling inside any ancestor, not just the window.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', place);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  const triggerProps = {
    ref: triggerRef,
    type: 'button',
    'aria-describedby': open ? tooltipId : undefined,
    'aria-expanded': open,
    onMouseEnter: () => {
      if (!dismissedRef.current) setOpen(true);
    },
    onMouseLeave: () => {
      dismissedRef.current = false;
      setOpen(false);
    },
    onFocus: () => {
      if (!dismissedRef.current) setOpen(true);
    },
    onBlur: () => {
      dismissedRef.current = false;
      setOpen(false);
    },
    onClick: (event) => {
      // Touch devices get no hover, so the tap has to toggle it. An explicit tap
      // also overrides a previous dismissal.
      event.preventDefault();
      event.stopPropagation();
      dismissedRef.current = false;
      setOpen((current) => !current);
    },
  };

  return (
    <>
      {children ? (
        <button
          {...triggerProps}
          aria-label={label ?? `What is ${heading}?`}
          className={`cursor-help border-b border-dotted border-faint/60 text-left ${className}`}
        >
          {children}
        </button>
      ) : (
        <button
          {...triggerProps}
          aria-label={label ?? `What is ${heading}?`}
          className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border border-ink-700 text-[9px] leading-none font-semibold text-faint transition hover:border-signal hover:text-signal ${className}`}
        >
          ?
        </button>
      )}

      {open &&
        position &&
        createPortal(
          <div
            ref={bubbleRef}
            id={tooltipId}
            role="tooltip"
            style={{ top: position.top, left: position.left, width: WIDTH }}
            className="pointer-events-none fixed z-[100] rounded-lg border border-ink-700 bg-ink-850 p-3 shadow-2xl shadow-black/70"
          >
            <p className="mb-1 text-[13px] font-semibold text-paper">{heading}</p>
            <p className="text-xs leading-relaxed text-muted">{text}</p>
            {footnote && (
              <p className="mt-2 border-t border-ink-800 pt-2 text-xs leading-relaxed text-faint">
                {footnote}
              </p>
            )}

            {/* Arrow, aligned to the trigger rather than the bubble's centre. */}
            <span
              aria-hidden="true"
              style={{ left: position.arrowLeft }}
              className={`absolute size-2 -translate-x-1/2 rotate-45 border-ink-700 bg-ink-850 ${
                position.above
                  ? '-bottom-1 border-r border-b'
                  : '-top-1 border-t border-l'
              }`}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

export default HelpTip;

import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

/** Native modal dialogs make the application behind them inert, including keyboard actions. */
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className = 'max-w-xl' }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-modal="true"
      onKeyDown={(event) => {
        if (event.key !== 'Tab' || event.defaultPrevented) return;
        const dialog = event.currentTarget;
        const controls = [...dialog.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]',
        )].filter((element) => element.tabIndex >= 0
          && !element.matches(':disabled')
          && !element.closest('[inert]')
          && getComputedStyle(element).visibility !== 'hidden'
          && getComputedStyle(element).visibility !== 'collapse'
          && element.getClientRects().length > 0);
        if (controls.length === 0) {
          event.preventDefault();
          dialog.focus();
          return;
        }
        const activeIndex = controls.indexOf(document.activeElement as HTMLElement);
        if (event.shiftKey && activeIndex <= 0) {
          event.preventDefault();
          controls[controls.length - 1].focus();
        } else if (!event.shiftKey && (activeIndex < 0 || activeIndex === controls.length - 1)) {
          event.preventDefault();
          controls[0].focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={`m-auto p-0 w-[calc(100%_-_2rem)] max-h-[90vh] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-200 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-xs ${className}`}
    >
      <div className="flex max-h-[90vh] flex-col">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-950/60 shrink-0">
          <h2 id={titleId} className="text-sm font-semibold text-white">{title}</h2>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
};

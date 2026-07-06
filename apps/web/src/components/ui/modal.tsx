/** Centered modal shell: a dimmed backdrop that dismisses on click + an a11y
 * alertdialog card. Callers supply their own title/body/footer as children. */
import type { ReactNode } from 'react';
import { Card } from './card.js';

export function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40"
      />
      <Card className="relative w-full max-w-md shadow-lg" role="alertdialog" aria-modal="true">
        {children}
      </Card>
    </div>
  );
}

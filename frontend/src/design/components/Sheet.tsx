import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | undefined;
  children: ReactNode;
}

/** Bottom sheet for quick mobile flows; focus moves to the first field when it opens. */
export function Sheet({ open, onOpenChange, title, description, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
          {...(description === undefined && { 'aria-describedby': undefined })}
        >
          <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          {description !== undefined && (
            <Dialog.Description className="mt-1 text-text-muted">{description}</Dialog.Description>
          )}
          <div className="mt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

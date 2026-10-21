import { useSyncExternalStore } from 'react';

export interface Notice {
  id: number;
  tone: 'info' | 'success' | 'warning' | 'danger';
  text: string;
  action?: { label: string; to: string };
  autoDismissMs?: number;
}

let notices: Notice[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

export function pushNotice(notice: Omit<Notice, 'id'>): void {
  const id = nextId++;
  notices = [...notices.filter((n) => n.text !== notice.text), { ...notice, id }];
  emit();
  if (notice.autoDismissMs !== undefined) {
    setTimeout(() => {
      dismissNotice(id);
    }, notice.autoDismissMs);
  }
}

export function dismissNotice(id: number): void {
  notices = notices.filter((n) => n.id !== id);
  emit();
}

export function useNotices(): Notice[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => notices,
  );
}

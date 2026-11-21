import { useSyncExternalStore } from 'react';
import { useAuth } from '../../context/AuthContext';

interface Favorite { id: string; title: string; location: string }
const eventName = 'stayhub:favorites-change';
const subscribe = (notify: () => void) => {
  window.addEventListener('storage', notify);
  window.addEventListener(eventName, notify);
  return () => { window.removeEventListener('storage', notify); window.removeEventListener(eventName, notify); };
};
function decode(value: string): Favorite[] {
  try {
    const rows: unknown = JSON.parse(value);
    return Array.isArray(rows) ? rows.filter(row => row && typeof row.id === 'string' && typeof row.title === 'string' && typeof row.location === 'string') : [];
  } catch { return []; }
}
const memory = new Map<string, string>();
function read(key: string) {
  if (memory.has(key)) return memory.get(key)!;
  try { return localStorage.getItem(key) ?? '[]'; } catch { return '[]'; }
}
export function useFavorites() {
  const { currentUser } = useAuth();
  const key = 'stayhub:favorites:' + (currentUser?.id ?? 'visitor');
  const raw = useSyncExternalStore(subscribe, () => read(key), () => '[]');
  function toggle(item: Favorite) {
    const rows = decode(read(key));
    const next = JSON.stringify(rows.some(row => row.id === item.id) ? rows.filter(row => row.id !== item.id) : [...rows, item]);
    try { localStorage.setItem(key, next); memory.delete(key); } catch { memory.set(key, next); }
    window.dispatchEvent(new Event(eventName));
  }
  return { favorites: decode(raw), toggle };
}

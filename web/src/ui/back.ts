// "Back" handling shared by Android's back button and Escape: the most recently
// opened layer (sheet → editor → screen) closes first.
import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { isNative } from '../update';

const stack: { current: () => void }[] = [];

/** While `active`, a back press calls `onBack` (innermost layer wins). */
export function useBack(active: boolean, onBack: () => void) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return;
    const entry = { current: () => ref.current() };
    stack.push(entry);
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}

export function goBack() {
  const top = stack[stack.length - 1];
  if (top) {
    top.current();
    return true;
  }
  return false;
}

export function installBackHandlers() {
  if (isNative) {
    void CapApp.addListener('backButton', () => {
      if (!goBack()) void CapApp.exitApp();
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') goBack();
  });
}

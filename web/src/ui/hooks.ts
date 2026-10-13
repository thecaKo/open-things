import { useEffect, useState } from 'react';

const WIDE = '(min-width: 760px)';

/** Wide layout (sidebar + list) vs. phone layout (stacked screens). */
export function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

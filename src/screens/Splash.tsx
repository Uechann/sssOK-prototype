import { useEffect } from 'react';
import { Wordmark } from '../components/Mascot';
import './entry.css';

export function Splash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, 1300);
    return () => window.clearTimeout(id);
  }, [onDone]);

  return (
    <div className="splash">
      <Wordmark />
    </div>
  );
}

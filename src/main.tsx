import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as amplitude from '@amplitude/unified';
import { App } from './App';
import { StoreProvider } from './store/store';
import './styles/global.css';

const amplitudeApiKey = import.meta.env.VITE_AMPLITUDE_API_KEY;
if (!amplitudeApiKey) console.warn('Amplitude API key missing — analytics disabled');
amplitude.initAll(amplitudeApiKey, {
  analytics: { autocapture: true },
  sessionReplay: { sampleRate: 1 },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as amplitude from '@amplitude/unified';
import { App } from './App';
import { StoreProvider } from './store/store';
import { APP_ENV, environmentPlugin, identifyEnvironment } from './lib/amplitudeEvents';
import './styles/global.css';

const amplitudeApiKey = import.meta.env.VITE_AMPLITUDE_API_KEY;
if (!amplitudeApiKey) console.warn('Amplitude API key missing — analytics disabled');
// 이벤트마다 environment(development/production)를 붙입니다 — init 전에 등록해야 오토캡처까지 덮습니다
amplitude.add(environmentPlugin);
amplitude.initAll(amplitudeApiKey, {
  analytics: { autocapture: true },
  // 개발 중 세션 리플레이까지 다 녹화하면 쿼터만 먹습니다
  sessionReplay: { sampleRate: APP_ENV === 'production' ? 1 : 0 },
});
identifyEnvironment();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);

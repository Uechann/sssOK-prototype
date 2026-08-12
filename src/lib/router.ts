import { useCallback, useEffect, useState } from 'react';

export type Route =
  | { name: 'onboarding' }
  | { name: 'create' }
  | { name: 'join'; code?: string }
  | { name: 'room'; code: string }
  | { name: 'settings'; code: string }
  | { name: 'badLink' };

function readHash(): Route {
  const raw = window.location.hash.replace(/^#/, '');
  const [path, query] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query ?? '');

  if (parts.length === 0) return { name: 'onboarding' };
  if (parts[0] === 'create') return { name: 'create' };
  if (parts[0] === 'join') return { name: 'join', code: params.get('code') ?? undefined };
  if (parts[0] === 'r' && parts[1]) {
    if (parts[2] === 'settings') return { name: 'settings', code: parts[1].toUpperCase() };
    if (parts[2]) return { name: 'badLink' };
    return { name: 'room', code: parts[1].toUpperCase() };
  }
  return { name: 'badLink' };
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'onboarding':
      return '#/';
    case 'create':
      return '#/create';
    case 'join':
      return route.code ? `#/join?code=${route.code}` : '#/join';
    case 'room':
      return `#/r/${route.code}`;
    case 'settings':
      return `#/r/${route.code}/settings`;
    case 'badLink':
      return '#/bad-link';
  }
}

/** 링크·코드·QR 세 경로가 모두 같은 URL로 모이고, 브라우저 뒤로가기를 그대로 씁니다. */
export function useRouter() {
  const [route, setRoute] = useState<Route>(readHash);

  useEffect(() => {
    const onChange = () => setRoute(readHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((next: Route, options?: { replace?: boolean }) => {
    const href = hrefFor(next);
    if (options?.replace) {
      window.history.replaceState(null, '', href);
      setRoute(readHash());
    } else if (window.location.hash !== href) {
      window.location.hash = href;
    }
  }, []);

  const back = useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else window.location.hash = '#/';
  }, []);

  return { route, navigate, back };
}

export function inviteUrl(code: string): string {
  return `${window.location.origin}${window.location.pathname}#/r/${code}`;
}

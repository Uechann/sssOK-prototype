import * as amplitude from '@amplitude/unified';

/** Amplitude 이벤트명 상수 — docs/analytics-naming-convention.md 컨벤션을 따릅니다.
 * (Title Case + 공백, [명사] + [과거형 동사]) */
export const AMPLITUDE_EVENTS = {
  HOME_PAGE_VIEWED: 'Home Page Viewed',
  ROOM_CREATE_STARTED: 'Room Create Started',
  ROOM_CREATED: 'Room Created',
  ROOM_JOIN_STARTED: 'Room Join Started',
  ROOM_JOINED: 'Room Joined',
  ROOM_JOIN_FAILED: 'Room Join Failed',
  ROOM_DELETED: 'Room Deleted',
  ROOM_SCREEN_VIEWED: 'Room Screen Viewed',
  ROOM_SETTINGS_VIEWED: 'Room Settings Viewed',
  PHOTO_UPLOADED: 'Photo Uploaded',
  PHOTO_UPLOAD_FAILED: 'Photo Upload Failed',
  PHOTO_DOWNLOADED: 'Photo Downloaded',
  PHOTO_DOWNLOAD_FAILED: 'Photo Download Failed',
  PHOTO_DELETED: 'Photo Deleted',
  INVITE_LINK_COPIED: 'Invite Link Copied',
  INVITE_CODE_COPIED: 'Invite Code Copied',
} as const;

/** 유입 경로(?src=)를 유저 속성으로 한 번만 기록 — 이후 모든 차트를 채널별로 나눠 볼 수 있습니다.
 * setOnce라 재방문해도 최초 유입 경로가 유지됩니다(퍼스트 터치 어트리뷰션). */
export function identifyEntrySrc(src: string) {
  const identify = new amplitude.Identify();
  identify.setOnce('entry_src', src);
  amplitude.identify(identify);
}

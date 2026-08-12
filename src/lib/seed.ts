import type { Photo, Room } from '../types';
import { uid } from './format';

/** 시안의 플랫 일러스트 톤을 그대로 흉내낸 더미 썸네일.
 * 실제 파일이 아니라 SVG data URL이라 저장 용량 걱정 없이 시드로 쓸 수 있습니다. */
type Scene = (i: number) => string;

const scenes: Scene[] = [
  // 하늘 + 흙길 + 야자수
  (i) => `
    <rect width="300" height="200" fill="#A8D6F0"/>
    <rect y="112" width="300" height="88" fill="#47633D"/>
    <rect x="${88 + (i % 3) * 8}" y="112" width="60" height="88" fill="#D1C7A8"/>
    ${[46, 118, 190]
      .map(
        (x) => `<rect x="${x}" y="46" width="5" height="96" fill="#3B2A1E"/>
      <path d="M${x - 22} 52 L${x + 2} 40 L${x + 26} 52 L${x + 2} 48 Z" fill="#386940"/>`,
      )
      .join('')}
  `,
  // 바다 수평선
  () => `
    <rect width="300" height="200" fill="#B8E0F7"/>
    <rect y="96" width="300" height="22" fill="#249EC7"/>
    <rect y="118" width="300" height="10" fill="#FFFFFF"/>
    <rect y="128" width="300" height="16" fill="#61ADDE"/>
    <rect y="144" width="300" height="56" fill="#C2B299"/>
  `,
  // 밤 들판
  () => `
    <rect width="300" height="200" fill="#5FA8DC"/>
    <rect y="74" width="300" height="46" fill="#47633D"/>
    <rect y="120" width="300" height="80" fill="#2E2E29"/>
    <rect x="146" y="128" width="9" height="66" fill="#FFFFFF"/>
    ${[54, 214].map((x) => `<rect x="${x}" y="42" width="5" height="120" fill="#3B2A1E"/>`).join('')}
  `,
  // 흐린 바다 + 유리창
  () => `
    <rect width="300" height="200" fill="#809CA6"/>
    <rect y="106" width="300" height="94" fill="#D4CCBA"/>
    <rect x="126" y="74" width="48" height="86" rx="10" fill="#CBE5C6"/>
    <rect x="149" y="26" width="2" height="52" fill="#8B4A32"/>
  `,
  // 노을
  () => `
    <rect width="300" height="200" fill="#F6C99B"/>
    <circle cx="196" cy="86" r="34" fill="#F66D3B"/>
    <rect y="126" width="300" height="74" fill="#7C5A4A"/>
    <rect y="118" width="300" height="8" fill="#E8A06B"/>
  `,
  // 숲길
  () => `
    <rect width="300" height="200" fill="#CDE7EF"/>
    <rect y="130" width="300" height="70" fill="#3F5B34"/>
    <path d="M150 130 L110 200 L190 200 Z" fill="#D1C7A8"/>
    ${[30, 76, 224, 270]
      .map((x) => `<ellipse cx="${x}" cy="118" rx="34" ry="44" fill="#386940"/>`)
      .join('')}
  `,
];

function sceneUrl(i: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="300" height="200">${scenes[i % scenes.length](i)}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

interface SeedSpec {
  uploaderId: string;
  uploaderName: string;
  kind?: 'image' | 'video';
  place?: string;
  minutesAgo: number;
}

export function makeSeedPhotos(
  meId: string,
  meName: string,
  folderId: string,
): Photo[] {
  const specs: SeedSpec[] = [
    { uploaderId: meId, uploaderName: meName, minutesAgo: 12, place: '제주 협재해수욕장' },
    { uploaderId: 'u_rosie', uploaderName: '로지', minutesAgo: 34, place: '제주 금능' },
    { uploaderId: 'u_jun', uploaderName: '준', minutesAgo: 51, place: '제주 애월' },
    { uploaderId: meId, uploaderName: meName, minutesAgo: 66, place: '제주 한림' },
    { uploaderId: 'u_rosie', uploaderName: '로지', kind: 'video', minutesAgo: 92, place: '제주 곽지' },
    { uploaderId: 'u_jun', uploaderName: '준', minutesAgo: 120, place: '제주 새별오름' },
    { uploaderId: meId, uploaderName: meName, minutesAgo: 143, place: '제주 성산' },
    { uploaderId: 'u_rosie', uploaderName: '로지', minutesAgo: 170, place: '제주 우도' },
    { uploaderId: 'u_jun', uploaderName: '준', minutesAgo: 205, place: '제주 표선' },
    { uploaderId: meId, uploaderName: meName, minutesAgo: 240, place: '제주 중문' },
    { uploaderId: 'u_rosie', uploaderName: '로지', minutesAgo: 288, place: '제주 서귀포' },
    { uploaderId: 'u_jun', uploaderName: '준', kind: 'video', minutesAgo: 330, place: '제주 사려니숲' },
    { uploaderId: meId, uploaderName: meName, minutesAgo: 372, place: '제주 함덕' },
  ];

  return specs.map((spec, i) => {
    const kind = spec.kind ?? 'image';
    const src = sceneUrl(i);
    return {
      id: uid('p_'),
      name: kind === 'video' ? `clip_04${21 + i}.mp4` : `jeju_04${21 + i}.jpg`,
      kind,
      src,
      poster: src,
      width: 300,
      height: 200,
      size: 820_000 + i * 31_000,
      originalSize: 3_400_000 + i * 120_000,
      durationSec: kind === 'video' ? 38 : undefined,
      uploaderId: spec.uploaderId,
      uploaderName: spec.uploaderName,
      createdAt: Date.now() - spec.minutesAgo * 60_000,
      // 앞의 두 장만 기본 폴더에 담아 시안의 "뉴폴더 2" 상태를 재현합니다
      folderIds: i < 2 ? [folderId] : [],
      place: spec.place,
    };
  });
}

/** 데모용 방 — 처음 접속했을 때 갤러리가 채워져 있도록 */
export function makeDemoRoom(meId: string, meName: string): Room {
  const folderId = uid('f_');
  return {
    code: '7K93QX2S',
    name: '제주도 3박 4일',
    hostId: meId,
    hostName: meName,
    createdAt: Date.now() - 50 * 60_000,
    expiresAt: Date.now() + (23 * 60 + 10) * 60_000,
    uploadPolicy: 'everyone',
    folders: [{ id: folderId, name: '뉴폴더', createdAt: Date.now() - 40 * 60_000 }],
    photos: makeSeedPhotos(meId, meName, folderId),
    members: [
      { id: meId, name: meName },
      { id: 'u_rosie', name: '로지' },
      { id: 'u_jun', name: '준' },
    ],
  };
}

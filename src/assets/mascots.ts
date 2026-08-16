/** 쏙 마스코트 이미지 — /img 에 있는 원본 파일을 의미 있는 이름으로 묶어둔 곳.
 * 파일명은 피그마에서 내보낸 그대로 두고 여기서만 매핑합니다. */

import cheer from '../../img/Group 29.png';
import sorted from '../../img/Group 30.png';
import photo from '../../img/image 1.png';
import close from '../../img/image 22.png';
import trash from '../../img/image 16.png';
import alert from '../../img/image 15.png';
import sad from '../../img/image 15 (1).png';
import downloadFail from '../../img/image 15 download.png';
import thumbsUp from '../../img/image 69.png';
import waveWithPhoto from '../../img/image 70.png';
import wave from '../../img/image 71.png';
import peek from '../../img/image 72.png';
import emptyRoom from '../../img/image 10.png';
import folderDelete from '../../img/Group 6.png';

export interface MascotArt {
  src: string;
  /** 원본 비율 — 레이아웃이 흔들리지 않도록 고정합니다 */
  ratio: number;
  alt: string;
}

const art = (src: string, w: number, h: number, alt: string): MascotArt => ({
  src,
  ratio: w / h,
  alt,
});

export const mascots = {
  /** 사진 여러 장을 번쩍 들어올린 두더지 */
  cheer: art(cheer, 220, 227, '사진을 번쩍 들어올린 두더지'),
  /** 사진을 정리해 체크한 두더지 */
  sorted: art(sorted, 221, 193, '사진을 정리하는 두더지'),
  /** 구멍에서 사진 한 장을 들고 있는 두더지 */
  photo: art(photo, 192, 143, '사진을 들고 있는 두더지'),
  /** 엄지척 하는 두더지 */
  thumbsUp: art(thumbsUp, 206, 168, '사진을 들고 엄지척 하는 두더지'),
  /** 사진 옆에서 손 흔드는 두더지 */
  waveWithPhoto: art(waveWithPhoto, 241, 114, '사진 옆에서 손 흔드는 두더지'),
  /** 손 흔드는 두더지 */
  wave: art(wave, 222, 168, '손 흔드는 두더지'),
  /** 구멍에서 빼꼼 내다보는 두더지 */
  peek: art(peek, 235, 104, '구멍에서 빼꼼 내다보는 두더지'),
  /** 빈 방에 놓인 사진 */
  emptyRoom: art(emptyRoom, 230, 54, '빈 방에 놓인 사진'),
  /** 폴더 삭제 안내를 든 두더지 */
  folderDelete: art(folderDelete, 97, 74, '삭제할 사진을 든 두더지'),
  /** CLOSE 팻말을 든 두더지 */
  close: art(close, 135, 77, 'CLOSE 팻말을 든 두더지'),
  /** 사진을 휴지통에 버리는 두더지 */
  trash: art(trash, 100, 67, '사진을 휴지통에 버리는 두더지'),
  /** 경고 팻말을 든 두더지 */
  alert: art(alert, 96, 82, '경고 팻말을 든 두더지'),
  /** 놀라 당황한 두더지 */
  sad: art(sad, 106, 74, '놀라 당황한 두더지'),
  /** 다운로드 실패 안내를 든 두더지 */
  downloadFail: art(downloadFail, 106, 74, '느낌표 안내를 든 두더지'),
} satisfies Record<string, MascotArt>;

export type MascotName = keyof typeof mascots;

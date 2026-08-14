import type { ReactNode } from 'react';
import { Mascot } from '../components/Mascot';
import { Button, MenuButton } from '../components/ui';
import { IconBrokenLink, IconWifiOff } from '../components/Icons';
import './entry.css';

function Result({
  art,
  title,
  desc,
  actions,
  className = '',
}: {
  art: ReactNode;
  title: string;
  desc: ReactNode;
  actions: ReactNode;
  className?: string;
}) {
  return (
    <div className={`result ${className}`}>
      <div className="result__body">
        {art}
        <h1 className="result__title">{title}</h1>
        <p className="result__desc">{desc}</p>
      </div>
      <div className="result__actions">{actions}</div>
    </div>
  );
}

/** 02b · 잘못된 QR·링크 */
export function InvalidLinkScreen({ onJoinByCode }: { onJoinByCode: () => void }) {
  return (
    <Result
      art={
        <span className="result__badge">
          <IconBrokenLink size={40} />
        </span>
      }
      title="링크가 올바르지 않아요"
      desc={
        <>
          QR 코드나 초대 링크가
          <br />
          잘못된 주소일 수 있어요
        </>
      }
      actions={<Button onClick={onJoinByCode}>코드로 입장하기</Button>}
    />
  );
}

/** 02c · 방 만료 (전체 화면 전환) */
export function ExpiredRoomScreen({
  hours = 24,
  onCreate,
  onHome,
}: {
  hours?: number;
  onCreate: () => void;
  onHome: () => void;
}) {
  return (
    <Result
      className="result--expired"
      art={<Mascot pose="close" size={150} />}
      title="이 방은 사라졌어요"
      desc={
        <>
          {hours}시간이 지나 사진과 영상이
          <br />
          자동으로 삭제됐어요
        </>
      }
      actions={
        <>
          <MenuButton onClick={onCreate}>새 방 만들기</MenuButton>
          <MenuButton variant="secondary" onClick={onHome}>
            홈으로
          </MenuButton>
        </>
      }
    />
  );
}

/** 3f · 네트워크 연결 끊김 (전체 화면) */
export function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <Result
      art={
        <span className="result__badge">
          <IconWifiOff size={40} />
        </span>
      }
      title="인터넷 연결이 끊겼어요"
      desc={
        <>
          네트워크 상태를 확인한 뒤
          <br />
          다시 시도해 주세요
        </>
      }
      actions={
        <Button className="btn--pill" onClick={onRetry}>
          다시 시도
        </Button>
      }
    />
  );
}

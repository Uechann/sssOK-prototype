import { Mascot } from '../components/Mascot';
import { MenuButton } from '../components/ui';
import './entry.css';

export function Onboarding({
  onCreate,
  onJoin,
}: {
  onCreate: () => void;
  onJoin: () => void;
}) {
  return (
    <div className="onboarding">
      <div className="onboarding__body">
        <Mascot pose="photo" size={150} className="onboarding__art" />
        <h1 className="t-display">
          사진 모으고
          <br />
          바로 <span className="accent">쏙</span> 나누기
        </h1>
        <p className="onboarding__desc">
          링크 하나로 사진, 영상을 모으고
          <br />
          필요한 것만 쏙 빼가요.
        </p>
      </div>
      <div className="onboarding__actions">
        <MenuButton onClick={onCreate}>방 만들기</MenuButton>
        <MenuButton variant="secondary" onClick={onJoin}>
          코드로 입장
        </MenuButton>
      </div>
    </div>
  );
}

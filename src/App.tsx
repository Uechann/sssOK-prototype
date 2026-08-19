import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Room } from './types';
import { useRouter } from './lib/router';
import { makeRoomCode } from './lib/format';
import { useOnline } from './lib/hooks';
import { useStore, useRemoteRoomSync, useRoomActions } from './store/store';
import { firebaseEnabled } from './lib/firebase';
import { createRoomRemote, fetchRoomOnce } from './store/remote';
import { action, endScreen, fail, screen, setRole, setRoom, startAnalytics } from './lib/analytics';
import { recordEvent } from './store/events';
import { ToastLayer } from './components/ui';
import { Onboarding } from './screens/Onboarding';
import { EXPIRY_OPTIONS, RoomForm, type RoomFormValue } from './screens/RoomForm';
import { JoinByCode } from './screens/JoinByCode';
import { ExpiredRoomScreen, InvalidLinkScreen, OfflineScreen } from './screens/Result';
import { RoomScreen } from './features/room/RoomScreen';
import { NameSheet } from './features/room/dialogs';
import { Admin } from './screens/Admin';

const HOUR = 60 * 60 * 1000;

/** 남은 시간을 만료 옵션(6·12·24시간) 중 가장 가까운 값으로 맞춥니다 */
function nearestExpiryOption(hours: number): number {
  return EXPIRY_OPTIONS.reduce((best, option) =>
    Math.abs(option - hours) < Math.abs(best - hours) ? option : best,
  );
}

export function App() {
  const { me, rooms, hydrated, dispatch, deleteRoom, setName, toasts, toast, dismissToast } =
    useStore();
  const { route, navigate, back } = useRouter();
  const online = useOnline();
  const [newRoomCode, setNewRoomCode] = useState<string | null>(null);

  // 지금 보고 있는 방 코드 — Firebase 모드에서는 이 방만 실시간 구독합니다
  const currentCode =
    route.name === 'room' || route.name === 'settings' ? route.code : undefined;
  /** 첫 스냅샷이 도착했는지. 도착 전에는 `rooms[code]`가 비어 있어도
   * "잘못된 링크"로 단정하면 안 됩니다 — 정상 링크에서도 잠깐 비어 있습니다. */
  const roomResolved = useRemoteRoomSync(currentCode);
  const actions = useRoomActions(currentCode ?? '');

  useEffect(() => startAnalytics(recordEvent), []);

  // 방 컨텍스트 — 이후 모든 이벤트에 방(해시)과 호스트/게스트 구분이 함께 붙습니다
  const currentRoom = currentCode ? rooms[currentCode] : undefined;
  useEffect(() => {
    setRoom(currentCode ?? null);
    if (!currentRoom) return;
    setRole(currentRoom.hostId === me.id ? 'host' : 'guest');
  }, [currentCode, currentRoom, me.id]);

  const isExpired = useCallback(
    (room: Room) => Boolean(room.deletedAt) || room.expiresAt <= Date.now(),
    [],
  );

  const createRoom = useCallback(
    async (value: RoomFormValue) => {
      const hostName = '';
      const room: Room = {
        code: makeRoomCode(),
        name: value.name,
        hostId: me.id,
        hostName,
        createdAt: Date.now(),
        expiresAt: Date.now() + value.expiryHours * HOUR,
        uploadPolicy: value.uploadPolicy,
        passcode: value.passcode || undefined,
        folders: [],
        photos: [],
        members: [{ id: me.id, name: hostName }],
      };
      if (firebaseEnabled) {
        await createRoomRemote(room);
      } else {
        dispatch({ type: 'upsertRoom', room });
      }
      action('room_create', {
        expiryHours: value.expiryHours,
        uploadPolicy: value.uploadPolicy,
        passcode: Boolean(value.passcode),
      });
      setNewRoomCode(room.code);
      navigate({ name: 'room', code: room.code });
    },
    [dispatch, me.id, navigate],
  );

  /** 지금 보고 있는 화면 이름 — 방 안(갤러리·라이트박스·시트)은 RoomScreen이 직접 남깁니다.
   * 여기서 null이면 "방 내부라 자식이 담당" 이라는 뜻입니다. */
  const screenName = useMemo(() => {
    if (!hydrated) return null;
    switch (route.name) {
      case 'onboarding':
        return 'onboarding';
      case 'create':
        return 'room_create_form';
      case 'join':
        return 'join';
      case 'settings':
        if (rooms[route.code]) return 'room.settings';
        return roomResolved ? 'invalid_link' : null;
      case 'badLink':
        return 'invalid_link';
      case 'admin':
        return null; // 개발자 화면은 계측하지 않습니다
      case 'room': {
        const room = rooms[route.code];
        // 아직 불러오는 중 — 여기서 실패로 남기면 정상 링크가 전부 실패로 집계됩니다
        if (!room) {
          if (!roomResolved) return null;
          return online ? 'invalid_link' : 'offline';
        }
        if (isExpired(room)) return 'room_expired';
        const needsName = newRoomCode === room.code || !me.name;
        return needsName ? 'name_gate' : null;
      }
    }
  }, [hydrated, isExpired, me.name, newRoomCode, online, roomResolved, rooms, route]);

  useEffect(() => {
    if (screenName === 'invalid_link') fail('entry.invalid_link');
    else if (screenName === 'offline') fail('entry.offline');
  }, [screenName]);

  useEffect(() => {
    if (screenName) screen(screenName);
    // 대시보드는 계측하지 않지만, 열어둔 화면은 닫아줘야 우리가 대시보드를 본 것이
    // 사용자의 "이탈"로 기록되지 않습니다.
    else if (route.name === 'admin') endScreen();
  }, [screenName, route.name]);

  const content = useMemo(() => {
    if (!hydrated) return null;

    switch (route.name) {
      case 'onboarding':
        return (
          <Onboarding
            onCreate={() => navigate({ name: 'create' })}
            onJoin={() => navigate({ name: 'join' })}
          />
        );

      case 'create':
        return (
          <RoomForm
            mode="create"
            initial={{ name: '', uploadPolicy: 'everyone', expiryHours: 24, passcode: '' }}
            onBack={back}
            onSubmit={(value) => void createRoom(value)}
          />
        );

      case 'join':
        return (
          <JoinByCode
            initialCode={route.code}
            onBack={back}
            needsPasscode={async (code) => {
              if (firebaseEnabled) return Boolean((await fetchRoomOnce(code))?.passcode);
              return Boolean(rooms[code]?.passcode);
            }}
            onSubmit={async ({ code, passcode }) => {
              const room = firebaseEnabled ? await fetchRoomOnce(code) : rooms[code];
              if (!room) {
                fail('join.code_not_found');
                return '입력 코드를 확인해주세요';
              }
              if (isExpired(room)) {
                fail('join.expired');
                return '이미 사라진 방이에요';
              }
              if (room.passcode && room.passcode !== passcode) {
                fail('join.wrong_passcode');
                return '입장 암호가 올바르지 않아요';
              }
              action('join.ok');
              navigate({ name: 'room', code });
              return null;
            }}
          />
        );

      case 'settings': {
        const room = rooms[route.code];
        if (!room) {
          if (!roomResolved) return <div className="screen name-gate__backdrop" />;
          return <InvalidLinkScreen onJoinByCode={() => navigate({ name: 'join' })} />;
        }
        return (
          <RoomForm
            mode="edit"
            initial={{
              name: room.name,
              uploadPolicy: room.uploadPolicy,
              expiryHours: nearestExpiryOption((room.expiresAt - Date.now()) / HOUR),
              passcode: room.passcode ?? '',
            }}
            onBack={back}
            onSubmit={(value) => {
              actions.patchRoom({
                name: value.name,
                uploadPolicy: value.uploadPolicy,
                expiresAt: Date.now() + value.expiryHours * HOUR,
                passcode: value.passcode || undefined,
              });
              back();
              toast('방 설정을 저장했어요.');
            }}
          />
        );
      }

      case 'room': {
        const room = rooms[route.code];

        if (!room) {
          // 첫 스냅샷이 오기 전에는 아무것도 단정하지 않습니다.
          // 여기서 "잘못된 링크"를 보여주면 정상 링크로 들어온 사람이 잠깐 오류 화면을 봅니다.
          if (!roomResolved) return <div className="screen name-gate__backdrop" />;
          // 오프라인이라 방을 못 불러오는 경우와 잘못된 링크를 구분합니다
          if (!online) return <OfflineScreen onRetry={() => window.location.reload()} />;
          return <InvalidLinkScreen onJoinByCode={() => navigate({ name: 'join' })} />;
        }

        if (isExpired(room)) {
          return (
            <ExpiredRoomScreen
              hours={Math.max(1, Math.round((room.expiresAt - room.createdAt) / HOUR))}
              onCreate={() => {
                action('expired.create');
                navigate({ name: 'create' });
              }}
              onHome={() => {
                action('expired.home');
                navigate({ name: 'onboarding' });
              }}
            />
          );
        }

        const needsName = newRoomCode === room.code || !me.name;

        return (
          <>
            {needsName ? (
              <div className="screen name-gate__backdrop" />
            ) : (
              <RoomScreen
                key={room.code}
                room={room}
                me={me}
                onOpenSettings={() => navigate({ name: 'settings', code: room.code })}
                onLeaveHome={() => {
                  deleteRoom(room.code);
                  navigate({ name: 'onboarding' });
                  toast('방을 삭제했어요. 30일 뒤 영구 삭제돼요.', 'warn');
                }}
              />
            )}
            {needsName && (
              <NameSheet
                onSubmit={(name) => {
                  action('name_gate.submit', { length: name.length });
                  setName(name);
                  actions.patchRoom({ hostName: name });
                  actions.joinRoom({ id: me.id, name });
                  setNewRoomCode(null);
                }}
              />
            )}
          </>
        );
      }

      case 'badLink':
        return (
          <InvalidLinkScreen
            onJoinByCode={() => {
              action('invalid_link.join');
              navigate({ name: 'join' });
            }}
          />
        );

      case 'admin':
        return <Admin onHome={() => navigate({ name: 'onboarding' })} />;
    }
  }, [
    actions,
    back,
    createRoom,
    deleteRoom,
    hydrated,
    isExpired,
    me,
    navigate,
    newRoomCode,
    online,
    roomResolved,
    rooms,
    route,
    setName,
    toast,
  ]);

  return (
    <div className="app-shell">
      {content}
      <ToastLayer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

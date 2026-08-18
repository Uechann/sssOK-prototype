# Firebase 익명 인증 CONFIGURATION_NOT_FOUND 오류

## 문제 상황

브라우저 콘솔에 아래와 같은 에러 2개가 빨간색으로 뜬다.

```
POST https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=... 400 (Bad Request)

GET https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=... 400 (Bad Request)
{"error":{"code":400,"message":"CONFIGURATION_NOT_FOUND","errors":[{"message":"CONFIGURATION_NOT_FOUND","domain":"global","reason":"invalid"}]}}
```

그 바로 아래에 노란 경고도 같이 뜬다.

```
익명 인증을 사용할 수 없어 로컬 기기 ID로 폴백합니다: FirebaseError: Firebase: Error (auth/configuration-not-found).
```

**결론부터 말하면 앱 동작에는 문제가 없다.** 방 생성·업로드·다운로드 전부 정상 동작하고, 이 오류가 뜬 상태에서도 이 저장소의 다른 트러블슈팅 문서([`video-download-cors.md`](video-download-cors.md))를 포함한 모든 테스트가 다 통과했다. 콘솔이 빨갛게 뜨는 게 불안해 보일 뿐, 코드가 이미 대비해둔 정상적인 폴백 경로다.

## 원인 파악

`src/lib/firebase.ts`의 `ensureAnonymousUser()`가 방문자마다 안정적인 uid를 받으려고 `signInAnonymously()`를 호출한다.

```ts
signInAnonymously(auth)
  .then((cred) => resolve(cred.user.uid))
  .catch((error: unknown) => {
    console.warn('익명 인증을 사용할 수 없어 로컬 기기 ID로 폴백합니다:', error);
    resolve(null);
  });
```

이 요청이 내부적으로 `identitytoolkit.googleapis.com/v1/accounts:signUp`을 호출하는데, **Firebase 콘솔에서 Authentication 자체를 아직 시작하지 않은 프로젝트**라 `CONFIGURATION_NOT_FOUND`로 거절당한다. `getProjectConfig` 쪽 에러도 같은 원인이다 — `getAuth(app)`을 호출하면 Firebase Auth SDK가 내부적으로 인증용 iframe을 띄워 이 프로젝트에 어떤 로그인 방식이 켜져 있는지 확인하는데, Authentication이 아예 시작 전이라 이것도 같이 실패한다.

두 에러 모두 `.catch()`로 잡혀서 `resolve(null)`로 끝난다. 이 null은 `src/store/store.tsx`의 하이드레이션 단계에서 그대로 로컬 기기 ID로 대체된다.

```ts
const uid = await ensureAnonymousUser();
const id = uid ?? loadDeviceId(); // uid가 null이면 localStorage 기반 로컬 ID 사용
```

즉 uid를 Firebase Auth한테서 못 받아오면 브라우저별로 하나씩 만들어 `localStorage`에 저장해둔 자체 ID(`sssok.device.v1`)를 그대로 쓴다. sssOK는 로그인 기능이 없는 프로토타입이라 uid가 어디서 왔는지(Firebase Auth vs 로컬)는 방장·업로더 구분에만 쓰이고, 두 경우 모두 동일하게 동작한다.

## 해결 방법

**아무것도 안 해도 된다.** 콘솔 에러가 거슬리지 않는다면 그냥 무시해도 기능상 차이가 없다.

콘솔을 깨끗하게 하고 싶다면 Firebase Authentication을 켜면 된다.

1. [Firebase Console](https://console.firebase.google.com/) → 프로젝트 선택
2. 왼쪽 메뉴 **빌드 → Authentication** → **"시작하기"**
3. **Sign-in method** 탭 → **익명(Anonymous)** 공급자 선택 → 사용 설정 → 저장

이렇게 하면 `signInAnonymously()`가 성공해서 uid를 Firebase Auth한테서 받아오게 되고, 두 에러 모두 더 이상 뜨지 않는다. 다만 sssOK 앱 자체의 동작(방 만들기·업로드·다운로드 등)은 이 설정 전후로 아무 차이가 없다 — 순수하게 콘솔 로그를 깔끔하게 하는 용도다.

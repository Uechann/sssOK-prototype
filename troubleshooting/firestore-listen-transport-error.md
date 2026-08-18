# Firestore `Listen` 채널 transport errored

## 문제 상황

브라우저 콘솔에 아래와 같은 에러가 뜬다.

```
firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?gsessionid=...&database=projects%2Fshare-drop-621d1%2Fdatabases%2F(default)&... 400 (Bad Request)

@firebase/firestore: Firestore (12.17.0): WebChannelConnection RPC 'Listen' stream 0x... transport errored. Name: undefined Message: undefined
```

## 원인 파악

`src/store/remote.ts`의 `subscribeRoom()`이 방 문서·사진·폴더·멤버를 각각 `onSnapshot`으로 실시간 구독한다. Firestore JS SDK는 이 구독을 브라우저의 gRPC-Web/WebChannel(긴 시간 열어두는 XHR 롱폴링)로 유지하는데, 이 연결은 네트워크가 살짝 끊기거나(탭을 백그라운드로 보냈다가 복귀, Wi-Fi 전환, 방화벽·광고 차단 확장 프로그램이 롱폴링 요청을 끊는 경우 등) 원인으로 **주기적으로 끊어지는 게 정상적인 동작**이다. Firestore SDK는 이런 상황을 대비해 자체적으로 재연결 로직을 내장하고 있다.

실제로 재현해본 결과, 이 에러가 뜬 뒤에도 방 만들기 → 실시간 구독 → 방 삭제까지 전부 정상 동작했고 콘솔에 이후 추가 에러도 없었다. **한 번 뜨고 지나가는 이 로그 자체는 앱 기능에 영향을 주지 않는다.** `video-download-cors.md` 문서의 CORS 에러(계속 실패)와 달리, 이건 SDK가 스스로 복구하는 일시적 트랜스포트 오류다.

## 해결 방법

**대부분의 경우 아무 조치도 필요 없다.** 아래 상황에서만 의심해본다.

- **정말 동기화가 안 되는지 먼저 확인** — 다른 브라우저/기기에서 같은 방을 열어 사진을 올렸을 때 반대쪽 화면에 실시간으로 반영되는지 본다. 반영된다면 이 로그는 무시해도 된다.
- **계속 반복되면서 실제로 동기화가 끊긴다면**:
  - 광고 차단기·보안 확장 프로그램을 꺼보고 재현되는지 확인 (`*.googleapis.com`으로의 긴 연결을 차단하는 확장 프로그램이 흔한 원인)
  - 사내망·공유 Wi-Fi라면 방화벽이 장시간 유지되는 XHR 연결을 강제로 끊는지 확인
  - 그래도 안 되면 Firestore 콘솔의 [사용량 탭](https://console.firebase.google.com/)에서 무료(Spark) 요금제 일일 한도(동시 연결 수 등)를 초과하지 않았는지 확인

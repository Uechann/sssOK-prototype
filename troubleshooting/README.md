# 트러블슈팅

실제로 겪은 문제를 재현하고 원인을 확인해서 정리한 기록입니다. 각 문서는 **문제 상황 → 원인 파악 → 해결 방법** 순서로 씁니다.

| 문서 | 증상 | 상태 |
| --- | --- | --- |
| [`video-download-cors.md`](video-download-cors.md) | 영상 재생은 되는데 다운로드만 실패 (CORS) | ✅ 해결됨 |
| [`firebase-auth-configuration-not-found.md`](firebase-auth-configuration-not-found.md) | 콘솔에 `CONFIGURATION_NOT_FOUND` 에러 | ✅ 무해 — 기능엔 영향 없음 |
| [`firestore-listen-transport-error.md`](firestore-listen-transport-error.md) | 콘솔에 `Listen` 채널 `transport errored` | ✅ 무해 — SDK가 자동 재연결 |

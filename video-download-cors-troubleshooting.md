# 영상 다운로드 CORS 오류 트러블슈팅

## 현상

- 영상 **재생**(라이트박스에서 보기)은 정상 동작한다.
- 영상 **다운로드**(개별 저장 · `.zip` 일괄 다운로드)만 실패한다. 앱에는 "앗, 1장을 못받았어요" 실패 모달이 뜬다.
- 브라우저 콘솔에는 아래와 같은 에러가 찍힌다.

```
Access to fetch at 'https://firebasestorage.googleapis.com/v0/b/<버킷>/o/sssok%2F<방코드>%2F<사진id>%2F<파일명>?alt=media&token=...'
from origin 'https://demo.ssssok.com' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## 원인

`src/features/room/useDownload.ts`는 다운로드 시 `fetch(photo.src)`로 영상 바이트를 직접 읽어와 `.zip`으로 묶거나 원본 파일명으로 저장한다. 이건 브라우저가 **CORS 검사를 실제로 수행하는 요청**이다.

반면 라이트박스 재생은 `<video src=...>` 태그로 리소스를 불러오는 "단순 리소스 로드"라서 CORS 검사 대상이 아니다. 그래서 **재생은 되는데 다운로드만 막히는** 증상이 나타난다.

실제 응답 헤더를 직접 떠서 확인하면 원인이 드러난다.

```bash
curl -sS -D - -o /dev/null \
  -H "Origin: https://demo.ssssok.com" \
  "https://firebasestorage.googleapis.com/v0/b/<버킷>/o/<인코딩된 경로>?alt=media&token=<토큰>"
```

응답 헤더에 `access-control-allow-origin`을 포함한 CORS 관련 헤더가 **아예 없다**. Storage 업로드(PUT)는 정상 동작하는데 다운로드(GET)만 이런 상태라면, 버킷에 적용된 CORS 설정의 `method` 목록에 **`GET`이 빠져 있고 `PUT`/`POST`만 등록**돼 있는 경우다. 그러면:

- 업로드(PUT) → 프리플라이트가 CORS 규칙에 걸려 통과 → 성공
- 다운로드(GET) → CORS 규칙에 안 걸림 → `Access-Control-Allow-Origin` 자체가 응답에 안 붙음 → 브라우저가 fetch 결과를 스크립트에 넘겨주지 않고 차단

## 문제 해결

### 1. 현재 적용된 CORS 설정 확인

```bash
gsutil cors get gs://<버킷 이름>
```

또는 [Cloud Console → Cloud Storage 버킷](https://console.cloud.google.com/storage/browser) → 버킷 클릭 → **구성** 탭 → CORS.
`method` 배열에 `GET`이 있는지 확인한다.

### 2. `GET`을 포함해 CORS 재설정

저장소 루트의 [`cors.json`](cors.json)에는 이미 `GET`이 포함돼 있다. 이 파일 그대로 다시 적용한다.

```bash
gcloud storage buckets update gs://<버킷 이름> --cors-file=cors.json
# 구버전 CLI: gsutil cors set cors.json gs://<버킷 이름>
```

CLI가 없다면 Cloud Console → 버킷 → **구성** 탭 → CORS 편집에서 `cors.json` 내용을 그대로 붙여넣고 저장한다.

```json
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Content-Disposition", "..."]
  }
]
```

### 3. 재현 확인

같은 `curl` 명령을 다시 실행해 응답 헤더에 `access-control-allow-origin: *`이 뜨는지 확인한다. 뜨면 앱에서 영상 다운로드를 다시 시도한다. 반영에 지연은 거의 없지만, 브라우저 캐시 때문에 안 될 경우 강력 새로고침(캐시 무시)으로 재시도한다.

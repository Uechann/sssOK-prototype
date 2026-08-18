# 영상 다운로드 CORS 오류 트러블슈팅

> **상태 (2026-08-18 기준): 해결됨.** `share-drop-621d1.firebasestorage.app` 버킷의
> 구성(Configuration) 탭 → CORS에 아래 "문제 해결" 내용을 폼으로 입력해 저장한 뒤,
> `curl`로 응답에 `access-control-allow-origin: *`이 붙는 것을 확인했고, 실제
> `https://sssok-prototype.vercel.app`에서 영상을 올리고 다운로드까지 성공하는 것까지
> 재현해서 확인했다.
>
> 참고 — Cloud Console에는 JSON을 통째로 붙여넣는 칸이 없다. **"구성" 탭 → CORS 편집**에서
> 출처(origin)·메서드(method)·응답 헤더(response header)·캐시 만료 시간을 각각 따로 입력하는
> 폼이다. 아래 "문제 해결" 2번 항목에 각 칸에 넣을 값을 정리해뒀다.

## 현상

- 영상 **재생**(라이트박스에서 보기)은 정상 동작한다.
- 영상 **다운로드**(개별 저장 · `.zip` 일괄 다운로드)만 실패한다. 앱에는 "앗, 1장을 못받았어요" 실패 모달이 뜬다.
- 브라우저 콘솔에는 아래와 같은 에러가 찍힌다. (실제 재현 로그 — 2026-08-18, `https://sssok-prototype.vercel.app`)

```
Access to fetch at 'https://firebasestorage.googleapis.com/v0/b/share-drop-621d1.firebasestorage.app/o/sssok%2FJTD35D3L%2Fp_7prdrgp727jd%2F...mov?alt=media&token=...'
from origin 'https://sssok-prototype.vercel.app' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

처음 발견했을 때는 `https://demo.ssssok.com`에서 재현했고, 이번엔 `https://sssok-prototype.vercel.app`에서 실제 업로드된 `.mov` 파일로 재현됐다 — **도메인이나 파일 종류 문제가 아니라 버킷 CORS 설정 자체가 안 바뀐 것**임을 뜻한다.

## 원인

`src/features/room/useDownload.ts`는 다운로드 시 `fetch(photo.src)`로 영상 바이트를 직접 읽어와 `.zip`으로 묶거나 원본 파일명으로 저장한다. 이건 브라우저가 **CORS 검사를 실제로 수행하는 요청**이다.

반면 라이트박스 재생은 `<video src=...>` 태그로 리소스를 불러오는 "단순 리소스 로드"라서 CORS 검사 대상이 아니다. 그래서 **재생은 되는데 다운로드만 막히는** 증상이 나타난다.

실제 응답 헤더를 직접 떠서 확인하면 원인이 드러난다.

```bash
curl -sS -D - -o /dev/null \
  -H "Origin: https://sssok-prototype.vercel.app" \
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

저장소 루트의 [`cors.json`](../cors.json)에는 이미 `GET`이 포함돼 있다. 이 파일 그대로 다시 적용한다.

```bash
gcloud storage buckets update gs://<버킷 이름> --cors-file=cors.json
# 구버전 CLI: gsutil cors set cors.json gs://<버킷 이름>
```

CLI가 없다면 Cloud Console에서 폼으로 입력한다. **JSON을 통째로 붙여넣는 칸은 없다** — 아래 경로로 들어가 항목별로 입력한다.

1. [Cloud Storage 버킷 목록](https://console.cloud.google.com/storage/browser) → 버킷 이름 클릭
2. 상단 **"구성"(Configuration)** 탭 → 아래로 스크롤 → **"교차 출처 리소스 공유"**(Cross-origin resource sharing) 섹션
3. **"CORS 구성 수정"**(Edit CORS configuration) 클릭
4. **"교차 출처 리소스 공유 허용"** 체크 → **"구성 추가"**(Add a configuration) 클릭
5. 아래 값을 각 칸에 입력

   | 칸 | 값 |
   | --- | --- |
   | 허용된 출처 목록 (List of allowed origins) | `*` |
   | 메서드 지정 (Specify methods) | `GET`, `HEAD`, `PUT`, `POST`, `DELETE` (하나씩 추가) |
   | 허용된 응답 헤더 목록 (List of allowed response headers) | 아래 13개를 한 줄씩 추가 |
   | 캐시 만료 시간 (Cache expiry time) | `3600` |

   응답 헤더 목록:
   ```
   Content-Type
   Content-Disposition
   Content-Length
   Content-Range
   x-goog-resumable
   X-Goog-Upload-Protocol
   X-Goog-Upload-Command
   X-Goog-Upload-URL
   X-Goog-Upload-Status
   X-Goog-Upload-Header-Content-Length
   X-Goog-Upload-Header-Content-Type
   X-Goog-Upload-Size-Received
   X-Goog-Upload-Offset
   ```

6. **"완료"**(Done) → **"저장"**(Save)

구성(configuration)은 1개만 추가하면 된다. 레포의 [`cors.json`](../cors.json)은 CLI로 적용할 때 쓰는 같은 내용의 JSON 버전이다.

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

같은 `curl` 명령을 다시 실행해 응답 헤더에 `access-control-allow-origin: *`이 뜨는지 확인한다. 반영에 지연은 거의 없다.

**실제로 이 방법으로 해결됐다.** 2026-08-18에 위 폼을 채워 저장한 직후 `curl` 응답에
`access-control-allow-origin: *`이 붙는 것을 확인했고, `https://sssok-prototype.vercel.app`에서
영상을 새로 올리고 다운로드까지 성공(토스트 "사진 1장을 다운로드했어요.")하는 것까지 재현해서 확인했다.

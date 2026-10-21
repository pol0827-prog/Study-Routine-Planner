# 무조건 오르는 루틴

고등학생용 성적 기록 · 학습 플래너 · 순공부/과목/모의고사 타이머 · 알람 · 오답노트(다시 풀기) · 기타 자료함 · 관리자 모드(학생 통계, 국어·영어 진도)를 담은 웹앱이에요.

- **Firebase**: Google 로그인, 기록 저장(Firestore), 파일 저장(Storage)
- **Google AI Studio (Gemini)**: 성적표·시간표·시험지 글자 인식, 관리자 코칭 분석
- **GitHub**: 코드 보관
- **Vercel**: 인터넷 주소로 배포 + Gemini 키를 숨겨 주는 서버 함수(`api/gemini.js`)

학생은 앱 주소를 열고 **Google로 로그인**만 하면 돼요. 로그인하지 않아도 쓸 수 있지만, 그때는 그 기기 브라우저에만 저장되고 선생님 화면에 나타나지 않아요.

---

## 파일 구성

| 파일 | 하는 일 |
|---|---|
| `index.html` | 앱 화면 전체 |
| `platform.js` | 앱을 Firebase·Gemini에 연결 |
| `firebase-config.js` | **직접 채울 곳**: Firebase 설정값, 관리자 이메일 |
| `api/gemini.js` | Vercel 서버 함수 (로그인 확인 후 Gemini 호출) |
| `firestore.rules` | 데이터 접근 규칙 (학생은 자기 것만, 관리자는 전체 읽기) |
| `storage.rules` | 파일 접근 규칙 |
| `cors.json` | Storage 파일을 앱에서 다시 읽기 위한 설정 |
| `firebase.json`, `package.json`, `vercel.json`, `.gitignore` | 배포 설정 |

---

## 1. Firebase 준비 (약 10분)

1. https://console.firebase.google.com → **프로젝트 추가** → 이름 예: `oreuneun-routine`
2. 프로젝트 홈에서 **웹 앱 추가(</>)** → 앱 이름 입력 → 나오는 `firebaseConfig` 값을 **`firebase-config.js`** 에 그대로 붙여 넣기
3. **Authentication** → 시작하기 → 로그인 방법 → **Google** 사용 설정
4. **Firestore Database** → 데이터베이스 만들기 → 위치 `asia-northeast3 (서울)` → 프로덕션 모드
   → **규칙** 탭에 `firestore.rules` 내용을 붙여 넣고 **게시**
5. **Storage** → 시작하기 → 위치 서울 → **규칙** 탭에 `storage.rules` 내용을 붙여 넣고 **게시**
   - 새 프로젝트의 Storage는 **Blaze(종량제) 요금제**로 바꿔야 켜져요. 무료 사용량 안에서는 요금이 거의 나오지 않지만, 결제 카드 등록이 필요해요.
   - Storage를 켜지 않아도 앱은 동작해요. 그때 사진·PDF·엑셀 원본은 올린 기기에만 저장되고, 기록(성적, 계획, 오답 글자 등)은 계정에 저장돼요.
6. **관리자 이메일 맞추기**: `firebase-config.js` 의 `ADMIN_EMAILS`, `firestore.rules`, `storage.rules` 세 곳의 이메일 목록이 같아야 해요. 지금은 `pol082753@gmail.com` 으로 되어 있어요.

## 2. Google AI Studio에서 Gemini 키 만들기

1. https://aistudio.google.com → 왼쪽 **Get API key** → **API 키 만들기**
2. 만든 키를 복사해 두세요. (이 키는 GitHub에 올리지 말고 4단계 Vercel 환경 변수에만 넣어요.)
3. 기본 모델은 `gemini-3.8-flash` 예요. 바꾸려면 Vercel 환경 변수 `GEMINI_MODEL` 에 원하는 모델 이름을 넣으세요.

## 3. GitHub에 올리기

**웹에서 올리기 (가장 쉬움)**
1. https://github.com/new → 저장소 이름 `oreuneun-routine` → **Private** 권장 → Create
2. **uploading an existing file** → 이 폴더의 파일과 `api` 폴더를 통째로 끌어다 놓기 → Commit

**명령어로 올리기**
```bash
cd "무조건 오르는 루틴"
git init
git add .
git commit -m "무조건 오르는 루틴 첫 버전"
git branch -M main
git remote add origin https://github.com/<내아이디>/oreuneun-routine.git
git push -u origin main
```

## 4. Vercel로 배포

1. https://vercel.com → GitHub 계정으로 로그인 → **Add New → Project** → 방금 만든 저장소 **Import**
2. Framework Preset: **Other** (빌드 명령 없음)
3. **Environment Variables** 에 추가:
   - `GEMINI_API_KEY` = 2단계에서 만든 키
   - `FIREBASE_API_KEY` = `firebase-config.js` 의 `apiKey` 값
   - (선택) `GEMINI_MODEL` = 쓰고 싶은 Gemini 모델 이름
4. **Deploy** → 완료되면 `https://oreuneun-routine.vercel.app` 같은 주소가 생겨요.
5. Firebase 콘솔 → Authentication → **설정 → 승인된 도메인** 에 Vercel 주소(`oreuneun-routine.vercel.app`)를 추가하세요. 안 하면 Google 로그인이 막혀요.

이후에는 GitHub에 파일을 고쳐 올릴 때마다 Vercel이 자동으로 다시 배포해요.

## 5. (권장) Storage CORS 설정

오답노트에서 예전에 올린 사진을 다시 "글자 읽기" 하거나 PDF를 미리 볼 때 필요해요.
Google Cloud Shell(https://shell.cloud.google.com)에서 `cors.json` 을 올리고:

```bash
gsutil cors set cors.json gs://<firebase-config.js의 storageBucket 값>
```

## 6. 쓰기 시작

- **선생님(관리자)**: 앱 주소 → Google 로그인 → 맨 오른쪽 **관리자** 탭이 보여요.
  학생 목록·통계 분석·국어/영어 진도 기록·학생 화면 보기·안내 방송 문구·앱 이름 아래 문구를 관리해요.
- **학생**: 앱 주소 → Google 로그인 → 과목·목표 탭 **내 정보**에 이름·학교·학년·반 입력.
  이후 기록은 자동으로 계정에 저장되고 선생님 화면에 나타나요.

## 내 컴퓨터에서 먼저 확인하기

`index.html` 을 더블클릭하면 모듈 보안 제한 때문에 열리지 않아요. 간단한 로컬 서버로 여세요.
```bash
npx serve .
```
그다음 표시되는 `http://localhost:3000` 을 열어요. (Firebase 승인된 도메인에 `localhost` 는 기본으로 들어 있어요. 글자 인식은 Vercel에 배포한 뒤에 동작해요.)

---

made by 2026.10. JJI

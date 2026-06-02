# 전남대 AI융합대학 스터디룸 예약 (JNU-AI-SRB)

전남대학교 AI융합대학 스터디룸 예약을 모바일에서 편리하게 할 수 있는 React Native (Expo) 앱입니다.

기존 학교 예약 시스템([cvg.jnu.ac.kr](https://cvg.jnu.ac.kr))은 PC 웹 화면에 맞춰져 있어 모바일에서 사용이 불편합니다. 이 앱은 **100% 네이티브 UI**로 모바일에 최적화된 예약 경험을 제공합니다. 로그인(SSO)만 WebView로 처리하고, 그 세션을 재사용해 모든 데이터 조회·예약을 네이티브 화면에서 수행합니다.

## 주요 기능

- 🔐 **SSO 로그인** — 전남대 통합 인증(sso.jnu.ac.kr)을 WebView로 처리. 휴대폰 인증기 앱 방식 그대로 사용 가능 (네이티브로 재현 불가능한 유일한 부분)
- 📅 **예약하기** — 네이티브 달력. 룸 선택, 월 이동, 날짜별 예약 가능 건수를 색상으로 표시. 날짜를 누르면 예약 폼으로 이동
- ✏️ **예약 신청** — 네이티브 폼. 룸/날짜/시간(실제 가능 시간만 다중선택)/인원/예약자/연락처/목적 입력 후 신청
- 📋 **내 예약** — 네이티브 카드 리스트. 예정/지난 예약 구분, 상태 배지, 당겨서 새로고침
- ⚙️ **설정** — 계정 정보 확인, 로그아웃

## 기술 스택

| 구분 | 사용 기술 |
|------|-----------|
| 프레임워크 | Expo SDK 53, React Native 0.79 |
| 언어 | TypeScript (strict) |
| 라우팅 | Expo Router (파일 기반) |
| 인증 통로 | react-native-webview (숨은 세션 브리지) |
| 상태 저장 | AsyncStorage (인증 상태 영속화) |
| 아이콘 | @expo/vector-icons (Ionicons) |

## 아키텍처 — 세션 브리지

앱 전체에 **보이지 않는 WebView 1개**를 두고, 이를 "인증된 데이터 통로"로만 사용합니다. SSO 세션 쿠키는 WebView 쿠키 저장소에 있고 RN의 `fetch`는 (특히 안드로이드에서) 이를 공유하지 못하기 때문에, 모든 조회·예약은 이 WebView 안에서 실행되는 주입 JS로 처리합니다. UI는 전부 네이티브입니다.

```
로그인(WebView, SSO) ──▶ 세션 쿠키 확보
        │
        ▼
  SessionBridge (숨은 WebView, cvg 도메인 상주)
        │  run(script) — 큐로 직렬화된 Promise 기반 RPC
        ├─ availabilityScript  → 달력 가용현황 스크래핑   → 네이티브 달력
        ├─ probeDayScript      → 날짜별 가능시간/목적 조회 → 네이티브 폼
        ├─ submitScript        → 실제 폼 구동 후 jf_regist → 예약 신청
        └─ myReservationsScript→ myList.do fetch+파싱      → 내 예약 리스트
```

**핵심 동작 원리:**
1. 로그인 WebView에서 SSO 인증 완료 → 세션 쿠키 확보 (`sharedCookiesEnabled`)
2. SessionBridge가 같은 세션으로 cvg 페이지를 상주시키고, 주입 스크립트로 데이터를 가져옴
3. 예약 제출은 학교 페이지의 함수(`jf_regist` 등)를 그대로 호출 → 토큰·검증을 그대로 사용
4. 내 예약은 같은-출처 `fetch`로 myList HTML을 받아 DOMParser로 파싱

## 프로젝트 구조

```
.
├── app/                      # Expo Router 화면 (파일 = 라우트)
│   ├── _layout.tsx           # 루트: Auth + SessionBridge Provider, 라우팅 가드
│   ├── index.tsx             # 진입점 리다이렉트
│   ├── login.tsx             # SSO 로그인 (WebView)
│   ├── booking.tsx           # 예약 신청 폼 (네이티브, 모달)
│   └── (tabs)/
│       ├── _layout.tsx       # 하단 탭 내비게이터
│       ├── index.tsx         # 예약하기 — 네이티브 달력
│       ├── reservations.tsx  # 내 예약 — 네이티브 카드 리스트
│       └── settings.tsx      # 설정 (네이티브)
├── src/
│   ├── contexts/
│   │   ├── AuthContext.tsx   # 앱 전역 인증 상태 (단일 인스턴스)
│   │   └── SessionBridge.tsx # 숨은 WebView 데이터 통로 (Promise RPC)
│   ├── hooks/
│   │   └── useAuth.ts        # AuthContext 재노출
│   ├── services/
│   │   └── bookingService.ts # 브리지 주입 스크립트 빌더 (조회/제출/스크래핑)
│   ├── components/
│   │   └── forms.tsx         # 네이티브 폼 요소 (Field/Select/Stepper 등)
│   ├── constants/
│   │   ├── urls.ts           # URL 상수 + 예약 목록 URL 빌더
│   │   ├── booking.ts        # 룸/목적/시간 설정
│   │   └── theme.ts          # JNU 디자인 토큰 (색상/타이포/간격)
│   ├── utils/
│   │   └── webviewScripts.ts # 로그인 WebView 보조 스크립트
│   └── types/
│       └── index.ts          # 공용 타입
└── assets/                   # 아이콘, 스플래시
```

## 시작하기

### 사전 준비
- Node.js 18+
- iOS/Android 시뮬레이터 또는 Expo Go 앱이 설치된 실기기

### 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 시작
npm start

# 플랫폼별 실행
npm run android   # Android
npm run ios       # iOS

# 타입 체크
npm run lint
```

개발 서버 실행 후 터미널의 QR 코드를 **Expo Go** 앱으로 스캔하면 실기기에서 바로 확인할 수 있습니다.

> ⚠️ SSO 휴대폰 인증기 방식을 사용하려면 인증기 앱이 설치된 실기기에서 테스트하는 것을 권장합니다.

## 디자인

전남대학교 브랜드 컬러를 따릅니다.
- Primary: `#003087` (네이비)
- Secondary: `#0066CC` (블루)
- Accent: `#FFD700` (골드)

## 향후 개선 가능 항목

- **예약 취소** — 내 예약 목록에는 취소 버튼이 없고 상세 페이지(`jf_artclView`)에서 처리되는 구조. 상세 페이지 구조 확인 후 연동 예정 (각 예약의 `seq`는 이미 수집 중)
- 푸시 알림 (예약 시작 시간 리마인더)
- 실기기 테스트 기반 세션 브리지 자동화 타이밍 튜닝

## 라이선스

MIT — `LICENSE` 참고

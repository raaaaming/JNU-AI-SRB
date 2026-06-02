# 전남대 AI융합대학 스터디룸 예약 (JNU-AI-SRB)

전남대학교 AI융합대학 스터디룸 예약을 모바일에서 편리하게 할 수 있는 React Native (Expo) 앱입니다.

기존 학교 예약 시스템([cvg.jnu.ac.kr](https://cvg.jnu.ac.kr))은 PC 웹 화면에 맞춰져 있어 모바일에서 사용이 불편합니다. 이 앱은 **SSO 로그인 + WebView 기반 제어**로 모바일에 최적화된 예약 경험을 제공합니다.

## 주요 기능

- 🔐 **SSO 로그인** — 전남대 통합 인증(sso.jnu.ac.kr)을 WebView로 처리. 휴대폰 인증기 앱 방식 그대로 사용 가능
- 📅 **예약하기** — 스터디룸 예약 캘린더. 학교 포털의 헤더/푸터 등 불필요한 요소를 제거하고 모바일에 맞게 재구성
- 📋 **내 예약** — 월 단위로 내 예약 현황 조회 (이전/다음 달 이동)
- ⚙️ **설정** — 계정 정보 확인, 로그아웃
- 🔄 세션 자동 만료 감지 (SSO로 리다이렉트되면 자동 로그아웃)

## 기술 스택

| 구분 | 사용 기술 |
|------|-----------|
| 프레임워크 | Expo SDK 53, React Native 0.79 |
| 언어 | TypeScript (strict) |
| 라우팅 | Expo Router (파일 기반) |
| 웹 제어 | react-native-webview (쿠키 공유 + JS 인젝션) |
| 상태 저장 | AsyncStorage (인증 상태 영속화) |
| 아이콘 | @expo/vector-icons (Ionicons) |

## 아키텍처

```
앱 시작
  │
  ├─ 저장된 세션 있음? ──▶ (tabs) 메인 화면
  │
  └─ 없음 ──▶ 로그인 화면 (SSO WebView)
                  │
                  │ cvg.jnu.ac.kr 로 리다이렉트 감지 → 로그인 성공
                  ▼
            세션 쿠키는 WebView 간 공유됨
                  │
                  ▼
            (tabs) 메인 화면 — 예약/내 예약 WebView가 같은 세션 사용
```

**핵심 동작 원리:**
1. 로그인 WebView에서 SSO 인증 완료 → 브라우저가 `cvg.jnu.ac.kr`로 이동하면 성공으로 판단
2. 인증으로 생성된 세션 쿠키는 `sharedCookiesEnabled`로 앱 내 모든 WebView가 공유
3. 예약/내 예약 탭의 WebView는 이 세션을 그대로 사용해 로그인된 화면을 표시
4. 각 WebView에 정리(cleanup) 스크립트를 주입해 학교 포털 UI를 모바일 친화적으로 가공

## 프로젝트 구조

```
.
├── app/                      # Expo Router 화면 (파일 = 라우트)
│   ├── _layout.tsx           # 루트: AuthProvider + 인증 기반 라우팅 가드
│   ├── index.tsx             # 진입점 리다이렉트
│   ├── login.tsx             # SSO 로그인 (WebView)
│   └── (tabs)/
│       ├── _layout.tsx       # 하단 탭 내비게이터
│       ├── index.tsx         # 예약하기 (WebView)
│       ├── reservations.tsx  # 내 예약 (WebView, 월 이동)
│       └── settings.tsx      # 설정 (네이티브)
├── src/
│   ├── contexts/
│   │   └── AuthContext.tsx   # 앱 전역 인증 상태 (단일 인스턴스)
│   ├── hooks/
│   │   └── useAuth.ts        # AuthContext 재노출
│   ├── constants/
│   │   ├── urls.ts           # URL 상수 + 예약 목록 URL 빌더
│   │   └── theme.ts          # JNU 디자인 토큰 (색상/타이포/간격)
│   ├── utils/
│   │   └── webviewScripts.ts # WebView JS 인젝션 (UI 정리/사용자 정보 추출)
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

- 예약 폼을 WebView가 아닌 완전 네이티브 UI로 구현 (사람 수/이름/학번/시간/연락처/목적 입력)
- 예약 가능 시간대를 API로 직접 조회해 네이티브 캘린더에 표시
- 푸시 알림 (예약 시작 시간 리마인더)
- 예약 취소 기능

## 라이선스

MIT — `LICENSE` 참고

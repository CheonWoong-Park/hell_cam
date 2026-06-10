# AngleFit Coach

React + TypeScript + TensorFlow.js + MoveNet 기반의 브라우저 전용 스쿼트 자세 코칭 MVP입니다. 웹캠 1대를 사용자 기준 전측면 30~45도 위치에 두고, MoveNet SinglePose keypoint를 Canvas overlay에 표시하며 스쿼트 phase, rep count, 자세 경향 피드백, 운동 리포트를 제공합니다.

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 Vite가 출력한 로컬 주소를 열고 카메라 권한을 허용합니다. 프로덕션 빌드는 아래 명령으로 확인할 수 있습니다.

```bash
npm run build
npm test
```

## 사용 기술

- React
- TypeScript
- Vite
- TensorFlow.js WebGPU/WebGL backend (자동 폴백)
- `@tensorflow-models/pose-detection`
- MoveNet SinglePose Thunder/Lightning (FPS 기반 적응형 선택)
- Claude API (`@anthropic-ai/sdk`, 선택적 AI 코치 총평)
- Canvas overlay
- 기본 CSS

## AI 파이프라인

단일 웹캠 영상에서 신뢰할 수 있는 코칭을 만들기 위해, 추론 → 필터링 → 분석 → 생성의 4단계 AI 파이프라인을 사용합니다.

1. **적응형 포즈 추론** — WebGPU 백엔드를 우선 시도하고 미지원 시 WebGL로 폴백합니다. 모델은 정확도가 높은 MoveNet **Thunder**로 시작하되, 추론 시간 중앙값 기준 지속 FPS가 임계값(21fps) 아래로 떨어지면 **Lightning**으로 자동 다운그레이드합니다(영상 우상단 배지에 현재 백엔드·모델·FPS 표시).
2. **해부학적 타당성 필터** — 신뢰도 높은 프레임에서 어깨-골반, 골반-무릎, 무릎-발목 분절의 길이 prior를 학습합니다. 2D 투영은 포즈에 따라 짧아질 수는 있어도 실제 뼈 길이보다 길어질 수 없고, 한 프레임 만에 급변할 수도 없으므로, 이를 위반하는 keypoint의 confidence를 낮춰 후단에서 덜 신뢰하게 만듭니다. 지속되는 변화(스탠스 변경, 카메라 이동)는 몇 프레임 후 새 기하로 수용합니다.
3. **Robust Kalman 필터** — keypoint별 constant-velocity 칼만 필터에 **innovation gating**을 적용합니다. 예측 불확실성 대비 관측 잔차(NIS)가 3.5σ를 넘는 측정은 Huber식으로 노이즈를 부풀려 약하게만 반영하므로, MoveNet의 단일 프레임 글리치는 사실상 무시되고 실제 빠른 동작(하강 600px/s 등)은 그대로 추적됩니다. 게이트가 연속으로 걸리면 측정 차분으로 속도를 시드하며 재초기화합니다.
4. **DTW 기술 일관성 분석** — 각 반복의 hip-depth 궤적을 고정 길이로 리샘플링한 뒤, 세트 내 베스트 반복과 **dynamic time warping**으로 비교합니다. 속도가 달라도 같은 기술이면 높은 유사도가 나오고, 깊이/형태가 다르면 낮아집니다. 세트 후반 유사도가 초반 대비 유의미하게 떨어지면 **피로 신호**로 리포트에 반영합니다.
5. **LLM AI 코치 (선택)** — 운동 리포트에서 Anthropic API 키를 입력하면 Claude(`claude-opus-4-8`)가 세트 데이터(축별 점수, 빈발 오류, 일관성, 피로 신호)를 기반으로 개인화된 한국어 코칭 총평을 생성합니다. 키는 브라우저 localStorage에만 저장되고 Anthropic API 호출 외에는 어디에도 전송되지 않으며, 키가 없으면 규칙 기반 총평으로 동작합니다.

## 카메라 설치 방법

- 웹캠은 사용자 기준 전측면 30~45도 위치에 둡니다.
- 머리, 어깨, 골반, 무릎, 발목이 모두 화면에 들어오게 카메라를 충분히 뒤로 둡니다.
- 조명을 밝게 하고, 관절 윤곽이 잘 보이는 옷을 입으면 keypoint confidence가 안정됩니다.
- 영상은 저장하지 않으며 서버로 전송하지 않습니다.

## 캘리브레이션 방법

1. `Start Camera`로 웹캠을 시작합니다.
2. 전신이 화면에 들어오면 `Start Calibration`을 누릅니다.
3. 자연스럽게 선 자세를 약 2초 유지합니다.
4. 가능하면 편안한 테스트 스쿼트 2~3회를 수행합니다.
5. 앱이 standing baseline, hip movement range, torso lean baseline, knee distance baseline을 저장합니다.

캘리브레이션 없이도 기본값으로 동작하지만, UI에 “캘리브레이션을 하면 분석이 더 안정적입니다”라고 표시됩니다.

## 현재 MVP 기능

- 웹캠 권한 요청 및 카메라 스트림 표시
- TensorFlow.js WebGL backend 초기화 상태 표시
- MoveNet SinglePose Lightning detector 1회 생성 및 재사용
- requestAnimationFrame 기반 실시간 pose estimation
- keypoint와 skeleton Canvas overlay
- body in frame 및 confidence 상태 표시
- 스쿼트 분석에 필요한 주요 관절 confidence 기반 분석 게이팅
- 카메라, 모델, 전신 프레이밍, 캘리브레이션 readiness checklist
- 스쿼트 phase 감지: idle, standing, descending, bottom, ascending
- 허용된 phase transition과 후보 지속 시간 기반 rep count 안정화
- phase rail을 통한 현재 동작 구간 표시
- bottom을 거쳐 standing으로 돌아온 경우 rep count 증가
- 실시간 자세 교정 피드백 (카메라 오버레이 + 사이드 패널, 심각도 색상 구분)
- 운동 종료 후 총 반복, 좋은 반복, 평균 점수, 기술 일관성, 자주 발생한 오류, 반복별 score 리포트
- DTW 기반 반복 간 기술 일관성 점수와 세트 후반 피로 감지
- 선택적 Claude 기반 AI 코치 총평 (BYO API key)

## 자세 분석 항목

스쿼트 바이오메카닉스 문헌(Schoenfeld 2010 *Squatting kinematics and kinetics*; Hewett·Myer 무릎 외반–ACL 위험; Escamilla 무릎/엉덩이 부하; NSCA 가이드라인)을 근거로, 단일 전측면 카메라에서 측정 가능한 2D 지표(관절 각도, 깊이 비율, 전면 폭 비율, 칼만 추정 속도)로 다음을 phase별로 감지하고 구체적 교정 큐를 제공합니다.

- **무릎 외반(KNEE_VALGUS)** — 무릎이 발보다 안쪽으로 모임 → “무릎을 발끝 방향으로 벌리세요”
- **상체 과도 숙임(EXCESSIVE_FORWARD_LEAN)** — 기준 대비 상체 기울기 증가 → “가슴을 들고 허리를 곧게 펴세요”
- **엉덩이 솟구침(HIP_SHOOT)** — 상승 시 엉덩이가 가슴보다 빨리 올라가는 굿모닝 패턴 → “가슴과 엉덩이를 함께 들어 올리세요”
- **좌우 체중 쏠림(WEIGHT_SHIFT)** — 좌우 비대칭 → “양발에 균등하게 힘을 주세요”
- **깊이 부족(INSUFFICIENT_DEPTH)** — 허벅지가 평행에 못 미침 → “더 깊이 앉으세요”
- **좁은 스탠스(NARROW_STANCE)** — 발 간격이 어깨너비보다 좁음 → “발을 어깨너비로 벌리세요”
- **빠른 하강(FAST_DESCENT)** — 통제되지 않은 낙하 → “천천히 통제하며 내려가세요”
- **불완전 락아웃(INCOMPLETE_LOCKOUT)** — 정점에서 무릎/엉덩이 미신전 → “끝까지 완전히 펴세요”

> 단일 2D 카메라 기반이라 절대 각도가 아닌 phase별 상대 변화와 폭 비율로 판정하며, 의료적 진단 목적이 아닙니다.

## 스코어링 엔진

반복 점수는 6개 축(depth, knee, posture, balance, tempo, stability)의 가중 평균입니다. 기존처럼 한 프레임의 최솟값/최댓값에 끌려가지 않도록 loaded phase(`descending`, `bottom`, `ascending`)의 20/80 분위수와 지속 시간 기반 지표를 사용합니다.

- **Depth**: hip depth ratio와 평균 무릎 각도를 함께 봅니다. 건강한 무릎의 평행 스쿼트 기준(대략 0~100도 knee flexion)을 목표로 하되, deep squat 자체는 감점하지 않고 충분한 깊이를 넘으면 100점으로 cap합니다.
- **Knee**: 무릎-발목 폭 비율을 loaded phase에서 평가합니다. 무릎 외반은 ACL/PFP 위험과 관련이 있고 2D FPPA가 현장 평가 지표로 쓰이지만, 단일 웹캠 노이즈를 감안해 한 프레임이 아니라 지속적인 하위 분위수로 감점합니다.
- **Posture**: 상체 숙임의 절대값, rep 안에서의 숙임 변화량, 상승 중 hip shoot velocity ratio를 함께 반영합니다.
- **Tempo**: rep 총 시간, 하강/상승 구간 시간, 과속 하강을 함께 봅니다. 픽셀 속도 하나에만 의존하지 않습니다.
- **Stability**: keypoint confidence, body-in-frame 비율, 무릎 폭 흔들림, 좌우 비대칭 흔들림을 합산합니다.

주요 근거: Escamilla 2001 knee biomechanics review, Schoenfeld 2010 squat kinematics/kinetics review, Hartmann et al. 2013 squat depth review, Hewett et al. 2005 dynamic valgus/ACL prospective study, Munro et al. 2012 2D dynamic knee valgus reliability study.

## 알려진 한계

- 이 앱은 단일 45도 카메라 기반이므로 정밀한 3D 측정은 제공하지 않는다
- 조명, 옷, 카메라 거리, 가려짐에 따라 정확도가 달라질 수 있다
- 이 앱은 의료적 진단, 치료, 재활 목적이 아니다
- 현재는 스쿼트 분석만 지원한다

## 향후 개선 방향

- 반복별 phase timeline 시각화
- 카메라 각도별 보정 프리셋
- 더 안정적인 tempo 분석과 error duration 집계
- 사용자의 신체 비율과 장비 환경에 맞춘 calibration 개선

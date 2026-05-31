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
- TensorFlow.js WebGL backend
- `@tensorflow-models/pose-detection`
- MoveNet SinglePose Lightning
- Canvas overlay
- 기본 CSS

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
- 운동 종료 후 총 반복, 좋은 반복, 평균 점수, 자주 발생한 오류, 반복별 score 리포트

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

## 알려진 한계

- 이 앱은 단일 45도 카메라 기반이므로 정밀한 3D 측정은 제공하지 않는다
- 조명, 옷, 카메라 거리, 가려짐에 따라 정확도가 달라질 수 있다
- 이 앱은 의료적 진단, 치료, 재활 목적이 아니다
- 현재는 스쿼트 분석만 지원한다

## 향후 개선 방향

- MoveNet Thunder 전환 옵션 추가
- 반복별 phase timeline 시각화
- 카메라 각도별 보정 프리셋
- 더 안정적인 tempo 분석과 error duration 집계
- 사용자의 신체 비율과 장비 환경에 맞춘 calibration 개선

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
- 실시간 자세 경향 피드백
- 운동 종료 후 총 반복, 좋은 반복, 평균 점수, 자주 발생한 오류, 반복별 score 리포트

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

# 스쿼트 스코어링 근거 반영 정리

이 문서는 현재 스쿼트 스코어링 엔진에 반영한 논문 근거와 코드 적용 방식을 정리한다. 앱은 단일 2D 웹캠 기반이므로 논문에서 쓰는 3D 역학 변수나 힘/모멘트를 직접 측정하지 않는다. 따라서 실제 구현은 `MoveNet` keypoint에서 얻을 수 있는 관절각, 폭 비율, 상대 깊이, 속도, confidence를 proxy로 사용한다.

## 구현 요약

반복 점수는 `depth`, `knee`, `posture`, `balance`, `tempo`, `stability` 6개 축의 가중 평균이다.

- 설정값: `src/lib/config/squatConfig.ts`
- 반복 점수 계산: `src/lib/squat/scoring.ts`
- 실시간 자세 오류 감지: `src/lib/squat/formAnalysis.ts`
- 기초 관절/비율 metric 산출: `src/lib/squat/metrics.ts`
- 회귀 테스트: `src/lib/squat/analysis.test.ts`

핵심 변경은 한 프레임의 극단값에 끌려가지 않도록 `descending`, `bottom`, `ascending` loaded phase의 20/80 분위수 기반으로 평가한 점이다.

## 1. Escamilla 2001 - Dynamic Squat Knee Biomechanics

자료: [Knee biomechanics of the dynamic squat exercise](https://pubmed.ncbi.nlm.nih.gov/11194098/)

### 논문에서 가져온 기준

Escamilla는 스쿼트 중 무릎 shear/compressive force, patellofemoral force, 근활성, 무릎 안정성을 리뷰했다. 건강한 무릎을 가진 운동자에게는 허벅지가 지면과 평행한 수준의 스쿼트가 유효한 기준으로 제시되며, 평행 스쿼트는 대략 최대 100도 무릎 굴곡 범위로 설명된다.

### 코드 반영

- `depthTargetKneeAngle: 100`을 충분한 깊이의 무릎각 기준으로 사용한다.
- `depthPartialKneeAngle: 130`을 얕은 스쿼트에서 부분 점수를 주는 시작점으로 둔다.
- `scoreDepth()`에서 `hipDepthRatio`와 평균 무릎각을 함께 평가한다.
- `detectInsufficientDepth()`에서도 `parallelKneeAngle: 100` 기준을 사용한다.

### 구현 의도

웹캠의 hip depth calibration은 사용자 위치와 카메라 각도에 흔들릴 수 있다. 그래서 깊이 점수는 `hipDepthRatio`만 보지 않고 좌우 평균 무릎각을 함께 사용한다. 반대로 무릎각만 쓰면 2D 투영 오차가 커질 수 있으므로 두 기준 중 더 강한 신호를 중심으로 혼합했다.

## 2. Schoenfeld 2010 - Squat Kinematics/Kinetics Review

자료: [Squatting kinematics and kinetics and their application to exercise performance](https://pubmed.ncbi.nlm.nih.gov/20182386/)

### 논문에서 가져온 기준

Schoenfeld는 스쿼트를 발목, 무릎, 고관절, 척추가 함께 관여하는 복합 동작으로 다룬다. 성능과 부상 위험을 함께 보려면 단일 지표가 아니라 깊이, 무릎 정렬, 상체/척추 자세, 안정성 같은 여러 차원을 함께 봐야 한다.

### 코드 반영

- 전체 점수를 6개 축의 가중 평균으로 유지했다.
- 부상 위험과 직접 관련되는 `depth`, `knee`, `posture` 축의 가중치를 상대적으로 크게 유지했다.
- `scorePosture()`에서 상체 숙임의 절대 크기, 반복 중 숙임 변화량, 상승 중 hip shoot을 함께 감점한다.
- `detectExcessiveForwardLean()`은 baseline 대비 숙임 증가와 절대 숙임 상한을 모두 본다.

### 구현 의도

점수 하나로 “좋다/나쁘다”를 판정하면 어떤 요소가 문제인지 알기 어렵다. Schoenfeld 리뷰의 관점에 맞춰 동작을 여러 biomechanical dimension으로 나누고, UI의 hex chart와 최종 점수가 같은 축을 공유하도록 했다.

## 3. Hartmann et al. 2013 - Squat Depth Review

자료: [Analysis of the Load on the Knee Joint and Vertebral Column with Changes in Squatting Depth and Weight Load](https://link.springer.com/article/10.1007/s40279-013-0073-6)

### 논문에서 가져온 기준

Hartmann et al.은 깊은 스쿼트 자체가 자동으로 더 위험하다는 단순한 결론을 경계한다. 정확한 기술, 적절한 점진 부하, 통제된 움직임이 전제되면 깊은 가동범위 훈련이 유효할 수 있다는 방향으로 정리한다. 또한 하강 속도와 전환 구간의 감속 부담이 무릎 부하에 영향을 줄 수 있음을 다룬다.

### 코드 반영

- `depthTargetHipRatio` 또는 `depthTargetKneeAngle`을 넘으면 깊이 점수는 100점으로 cap한다.
- 충분한 깊이 이후 더 깊게 앉는 것 자체는 추가 감점하지 않는다.
- `scoreTempo()`에서 전체 rep duration, descent duration, ascent duration, peak descent velocity를 함께 본다.
- `detectFastDescent()`와 `scoreTempo()`가 통제되지 않은 빠른 하강을 감점한다.

### 구현 의도

이전 방식처럼 “깊을수록 무조건 위험”으로 처리하지 않는다. 대신 충분한 깊이를 인정하고, 문제는 깊이 자체가 아니라 과속 하강, 불안정한 전환, 상체 붕괴, 무릎 정렬 실패로 분리해 감점한다.

## 4. Hewett et al. 2005 - Dynamic Valgus / ACL Risk

자료: [Biomechanical measures of neuromuscular control and valgus loading of the knee predict ACL injury risk in female athletes](https://pubmed.ncbi.nlm.nih.gov/15722287/)

### 논문에서 가져온 기준

Hewett et al.은 동적 무릎 외반과 높은 valgus loading이 ACL injury risk와 관련된다는 점을 전향 연구로 다뤘다. 실제 논문은 3D motion/force 기반의 무릎 부하를 다루므로 웹캠 앱이 같은 값을 직접 측정할 수는 없다.

### 코드 반영

- `kneeToAnkleWidthRatio`를 2D proxy로 사용한다.
- loaded phase에서 무릎 폭이 발목 폭보다 의미 있게 좁아지면 `KNEE_VALGUS`로 감지한다.
- `knee` 축 가중치를 `0.22`로 높게 유지했다.
- `scoreKneeRatio()`에서 `kneeIdealRatio`, `kneeAcceptableRatio`, `kneeValgusRatio`, `kneeSevereValgusRatio` 구간별로 점수를 매긴다.
- feedback priority에서도 `KNEE_VALGUS`를 높은 우선순위로 둔다.

### 구현 의도

ACL risk 연구의 핵심을 “무릎이 안쪽으로 무너지는 패턴을 빠르게 잡아야 한다”로 반영했다. 다만 2D 웹캠은 실제 knee abduction moment를 측정하지 못하므로, 코드와 문서에서 이를 `width ratio proxy`로 제한한다.

## 5. Munro et al. 2012 - 2D Dynamic Knee Valgus Reliability

자료: [Reliability of 2-dimensional video assessment of frontal-plane dynamic knee valgus during common athletic screening tasks](https://pubmed.ncbi.nlm.nih.gov/22104115/)

### 논문에서 가져온 기준

Munro et al.은 2D 비디오 기반 frontal-plane dynamic knee valgus 평가가 현장 평가 도구로 쓸 수 있는 신뢰도를 가진다고 보고했다. 동시에 2D 평가는 측정 오차가 있으므로 단일 프레임의 극단값을 그대로 믿는 방식은 부적절하다.

### 코드 반영

- `scoreKnee()`는 단일 최솟값이 아니라 loaded phase의 `robustLowPercentile: 0.2`를 사용한다.
- `scoreStability()`는 무릎 폭 비율의 standard deviation을 `kneeWobblePenalty`로 반영한다.
- `confidence`, `bodyInFrame`, 좌우 비대칭 흔들림도 stability 축에 포함한다.
- 테스트에 “한 프레임 noisy valgus가 전체 knee score를 지배하지 않는지”를 추가했다.

### 구현 의도

2D 평가의 장점은 접근성이고, 약점은 노이즈와 투영 오차다. 그래서 무릎 외반은 빠르게 감지하되, 반복 점수는 지속적으로 나타난 패턴에 더 큰 비중을 두도록 바꿨다.

## 코드 매핑 표

| 근거 | 반영된 지표 | 주요 코드 |
| --- | --- | --- |
| Escamilla 2001 | 평행 스쿼트 기준, 무릎각 기반 깊이 보정 | `depthTargetKneeAngle`, `scoreDepth()`, `detectInsufficientDepth()` |
| Schoenfeld 2010 | 복합 관절 동작을 6개 축으로 분해 | `axisWeights`, `scoreRepBreakdown()`, `scorePosture()` |
| Hartmann et al. 2013 | deep squat 자체 감점 금지, 통제된 tempo 강조 | `depthTargetHipRatio`, `scoreTempo()`, `detectFastDescent()` |
| Hewett et al. 2005 | 동적 무릎 외반을 위험 신호로 우선 평가 | `kneeToAnkleWidthRatio`, `scoreKneeRatio()`, `KNEE_VALGUS` |
| Munro et al. 2012 | 2D valgus 평가는 가능하지만 robust 처리 필요 | `robustLowPercentile`, `kneeWobblePenalty`, noisy frame 테스트 |

## 한계와 해석 원칙

- 이 앱은 3D knee abduction moment, ground reaction force, joint compression force를 직접 측정하지 않는다.
- 무릎 외반은 `kneeToAnkleWidthRatio` proxy이며, 실제 임상 진단값이 아니다.
- 카메라 각도, 옷, 조명, 가려짐에 따라 keypoint confidence가 흔들릴 수 있다.
- 점수는 운동 코칭용 품질 지표이며 의료적 진단, 치료, 재활 판정으로 사용하면 안 된다.

## 참고 문헌

- Escamilla, R. F. (2001). *Knee biomechanics of the dynamic squat exercise*. Medicine & Science in Sports & Exercise, 33(1), 127-141. https://pubmed.ncbi.nlm.nih.gov/11194098/
- Schoenfeld, B. J. (2010). *Squatting kinematics and kinetics and their application to exercise performance*. Journal of Strength and Conditioning Research, 24(12), 3497-3506. https://pubmed.ncbi.nlm.nih.gov/20182386/
- Hartmann, H., Wirth, K., & Klusemann, M. (2013). *Analysis of the Load on the Knee Joint and Vertebral Column with Changes in Squatting Depth and Weight Load*. Sports Medicine, 43, 993-1008. https://link.springer.com/article/10.1007/s40279-013-0073-6
- Hewett, T. E., Myer, G. D., Ford, K. R., et al. (2005). *Biomechanical measures of neuromuscular control and valgus loading of the knee predict anterior cruciate ligament injury risk in female athletes*. American Journal of Sports Medicine, 33(4), 492-501. https://pubmed.ncbi.nlm.nih.gov/15722287/
- Munro, A., Herrington, L., & Carolan, M. (2012). *Reliability of 2-dimensional video assessment of frontal-plane dynamic knee valgus during common athletic screening tasks*. Journal of Sport Rehabilitation, 21(1), 7-11. https://pubmed.ncbi.nlm.nih.gov/22104115/

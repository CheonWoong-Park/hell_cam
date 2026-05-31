import type { PoseFrame } from './pose';

export type SquatPhase = 'idle' | 'standing' | 'descending' | 'bottom' | 'ascending';

export type WorkoutState = 'idle' | 'camera_ready' | 'calibrating' | 'ready' | 'running' | 'stopped';

export interface SquatMetrics {
  phase: SquatPhase;
  timestamp: number;
  leftKneeAngle: number | null;
  rightKneeAngle: number | null;
  leftHipAngle: number | null;
  rightHipAngle: number | null;
  torsoLean: number | null;
  hipDepthRatio: number;
  kneeTrackingScore: number;
  asymmetryScore: number;
  confidence: number;
  bodyInFrame: boolean;
  hipY: number | null;
  shoulderY: number | null;
  kneeDistanceRatio: number | null;
  hipVerticalVelocity: number;
  shoulderVerticalVelocity: number;
  // Frontal-plane width ratios. Both numerator and denominator share the same
  // camera foreshortening, so the ratio is robust to the 30-45° view angle.
  kneeToAnkleWidthRatio: number | null; // < 1 => knees caving inward (valgus)
  stanceWidthRatio: number | null; // ankle width / shoulder width
}

export type FormErrorType =
  | 'LOW_CONFIDENCE'
  | 'BODY_OUT_OF_FRAME'
  | 'INSUFFICIENT_DEPTH'
  | 'KNEE_VALGUS'
  | 'EXCESSIVE_FORWARD_LEAN'
  | 'HIP_SHOOT'
  | 'WEIGHT_SHIFT'
  | 'NARROW_STANCE'
  | 'FAST_DESCENT'
  | 'INCOMPLETE_LOCKOUT';

export type FormErrorSeverity = 'info' | 'warning' | 'critical';

export interface FormError {
  type: FormErrorType;
  severity: FormErrorSeverity;
  message: string;
  confidence: number;
  timestamp: number;
}

export interface RepResult {
  repNumber: number;
  score: number;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  errors: FormError[];
  depthScore: number;
  stabilityScore: number;
  feedback: string;
}

export interface CalibrationData {
  standingPose: PoseFrame;
  baselineHipY: number;
  baselineShoulderY: number;
  baselineTorsoLean: number;
  baselineKneeDistance: number;
  estimatedBottomHipY: number;
  rangeOfMotion: number;
  createdAt: number;
}

export interface WorkoutSummary {
  totalReps: number;
  goodReps: number;
  averageScore: number;
  mostFrequentErrors: Array<{ type: FormErrorType; count: number; message: string }>;
  repScores: Array<{ repNumber: number; score: number }>;
  comment: string;
}

export interface PhaseHistoryEntry {
  phase: SquatPhase;
  timestamp: number;
}

export interface RepCounterState {
  repCount: number;
  currentPhase: SquatPhase;
  pendingPhase: SquatPhase | null;
  pendingPhaseStartedAt: number | null;
  phaseHistory: PhaseHistoryEntry[];
  hasReachedBottom: boolean;
  activeRepStartedAt: number | null;
  collectedMetrics: SquatMetrics[];
  collectedErrors: FormError[];
  repResults: RepResult[];
  lastTransitionAt: number;
  lastCountedAt: number;
  completedRep: RepResult | null;
}

export interface CalibrationProgress {
  isCalibrating: boolean;
  stage: 'idle' | 'standing' | 'rom' | 'complete';
  message: string;
  progress: number;
}

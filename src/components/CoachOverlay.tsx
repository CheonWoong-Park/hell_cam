import { prioritizeErrors } from '../lib/squat/feedback';
import type { FormError, FormErrorSeverity, SquatPhase } from '../types/squat';

interface CoachOverlayProps {
  errors: FormError[];
  phase: SquatPhase;
  isRunning: boolean;
  bodyInFrame: boolean;
}

const severityMeta: Record<FormErrorSeverity, { tone: string; label: string }> = {
  critical: { tone: 'critical', label: '교정' },
  warning: { tone: 'warning', label: '주의' },
  info: { tone: 'info', label: '팁' },
};

/**
 * Real-time coaching cues drawn over the camera so the user can correct their
 * posture mid-rep. Shows the highest-priority active form errors (color-coded by
 * severity), or a positive cue while the form stays clean during a workout.
 */
export function CoachOverlay({ errors, phase, isRunning, bodyInFrame }: CoachOverlayProps) {
  // Out-of-frame / idle states are already handled by the centered camera message.
  if (!bodyInFrame || phase === 'idle') {
    return null;
  }

  const cues = prioritizeErrors(errors).slice(0, 2);

  if (cues.length === 0) {
    if (!isRunning) {
      return null;
    }

    return (
      <div className="coach-overlay" aria-live="polite">
        <div className="coach-cue coach-cue--good">
          <span className="coach-cue__tag">좋아요</span>
          <span className="coach-cue__text">자세가 안정적입니다. 지금 리듬을 유지하세요.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="coach-overlay" aria-live="polite">
      {cues.map((cue) => {
        const meta = severityMeta[cue.severity];
        return (
          <div key={cue.type} className={`coach-cue coach-cue--${meta.tone}`}>
            <span className="coach-cue__tag">{meta.label}</span>
            <span className="coach-cue__text">{cue.message}</span>
          </div>
        );
      })}
    </div>
  );
}

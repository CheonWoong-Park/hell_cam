import type { RepResult, WorkoutSummary } from '../types/squat';

interface WorkoutReportProps {
  summary: WorkoutSummary;
  repResults: RepResult[];
}

export function WorkoutReport({ summary }: WorkoutReportProps) {
  return (
    <section className="report-section">
      <div className="report-grid">
        <div className="report-stat">
          <span>TOTAL</span>
          <strong>{summary.totalReps}</strong>
        </div>
        <div className="report-stat report-stat--accent">
          <span>GOOD</span>
          <strong>{summary.goodReps}</strong>
        </div>
        <div className="report-stat">
          <span>AVG</span>
          <strong>{summary.averageScore}</strong>
        </div>
      </div>
      <p className="report-comment">{summary.comment}</p>
    </section>
  );
}

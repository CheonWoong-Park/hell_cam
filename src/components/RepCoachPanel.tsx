import { formErrorShortLabels, generateRepCoaching, prioritizeErrors } from '../lib/squat/feedback';
import type { RepResult, RepScoreBreakdown } from '../types/squat';
import { RepHexChart } from './RepHexChart';

interface RepCoachPanelProps {
  lastRep: RepResult | null;
  repResults: RepResult[];
}

function topIssueLabel(rep: RepResult): string {
  const top = prioritizeErrors(rep.errors)[0];
  return top ? formErrorShortLabels[top.type] : '깔끔';
}

function averageBreakdown(reps: RepResult[]): RepScoreBreakdown | null {
  if (reps.length < 2) {
    return null;
  }
  const keys: Array<keyof RepScoreBreakdown> = ['depth', 'knee', 'posture', 'balance', 'tempo', 'stability'];
  const totals = reps.reduce(
    (acc, rep) => {
      keys.forEach((key) => {
        acc[key] += rep.breakdown[key];
      });
      return acc;
    },
    { depth: 0, knee: 0, posture: 0, balance: 0, tempo: 0, stability: 0 },
  );
  keys.forEach((key) => {
    totals[key] = Math.round(totals[key] / reps.length);
  });
  return totals;
}

export function RepCoachPanel({ lastRep, repResults }: RepCoachPanelProps) {
  if (!lastRep) {
    return (
      <section className="panel coach-panel">
        <div className="panel-heading">
          <h2>Rep Coach</h2>
        </div>
        <p className="cue cue--muted">한 번 앉았다 일어서면 다음 반복을 위한 코칭이 여기에 표시됩니다.</p>
      </section>
    );
  }

  const coaching = generateRepCoaching(lastRep);
  const history = [...repResults].slice(-5).reverse();

  return (
    <section className="panel coach-panel">
      <div className="panel-heading">
        <h2>Rep Coach</h2>
        <span>rep {lastRep.repNumber} · {lastRep.score}점</span>
      </div>

      <RepHexChart breakdown={lastRep.breakdown} reference={averageBreakdown(repResults)} />

      <p className={`coach-headline${coaching.positive ? ' coach-headline--good' : ''}`}>{coaching.headline}</p>
      <ul className="coach-tips">
        {coaching.tips.map((tip, index) => (
          <li key={index} className="coach-tips__item">
            {tip}
          </li>
        ))}
      </ul>

      {history.length > 1 && (
        <ul className="coach-history" aria-label="최근 반복 기록">
          {history.map((rep) => (
            <li key={rep.repNumber} className="coach-history__row">
              <span className="coach-history__rep">#{rep.repNumber}</span>
              <span className="coach-history__score">{rep.score}</span>
              <span className="coach-history__tag">{topIssueLabel(rep)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

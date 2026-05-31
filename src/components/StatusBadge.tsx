interface StatusBadgeProps {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn' | 'danger' | 'loading';
}

export function StatusBadge({ label, value, tone = 'neutral' }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      <span className="status-badge__dot" aria-hidden="true" />
      <span className="status-badge__label">{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

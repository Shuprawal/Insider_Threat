import React, { useEffect, useRef, useState } from 'react';

/**
 * InsiderRiskAnimatedProbabilityDonutGauge
 * A reusable animated donut that visualizes a probability (0..1) or percent (0..100),
 * shows a status pill, an optional “reason” string, and a tiny facts grid.
 */
export default function ThreatMeter({
  probabilityZeroToOne,            // number 0..1 (preferred)
  percentZeroToHundred,            // number 0..100 (alternative)
  modelDecisionThreshold,          // number 0..1 (to compute suspicious/ok)
  explicitStatusOverride,          // 'suspicious' | 'ok' | 'idle' (optional)
  mainTitle = 'Latest threat',
  secondarySubtitle = '',
  humanReadableReason = '',
  factoidDictionary = {},          // { label: value }
  shouldRenderAndAnimate = false,  // mount/animate control
  sizePx = 140,
  strokePx = 14,
}) {
  const computedPercent = typeof percentZeroToHundred === 'number'
    ? Math.max(0, Math.min(100, percentZeroToHundred))
    : Math.max(0, Math.min(100, (Number(probabilityZeroToOne) || 0) * 100));

  const derivedStatus =
    explicitStatusOverride ||
    (typeof probabilityZeroToOne === 'number' && typeof modelDecisionThreshold === 'number'
      ? (probabilityZeroToOne >= modelDecisionThreshold ? 'suspicious' : 'ok')
      : 'idle');

  // geometry
  const cx = sizePx / 2, cy = sizePx / 2;
  const r = (sizePx - strokePx) / 2;
  const C = 2 * Math.PI * r;

  // percent animation
  const [animatedPercent, setAnimatedPercent] = useState(0);
  const rafHandle = useRef(null);
  const previousPercentRef = useRef(0);

  useEffect(() => {
    if (!shouldRenderAndAnimate) { setAnimatedPercent(0); previousPercentRef.current = 0; return; }
    const from = previousPercentRef.current, to = computedPercent;
    const durationMs = 720, start = performance.now();

    const tick = (t0) => {
      const p = Math.min(1, (t0 - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // cubic ease-out
      const cur = from + (to - from) * eased;
      setAnimatedPercent(cur);
      if (p < 1) rafHandle.current = requestAnimationFrame(tick);
      else previousPercentRef.current = to;
    };
    cancelAnimationFrame(rafHandle.current);
    rafHandle.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafHandle.current);
  }, [computedPercent, shouldRenderAndAnimate]);

  const dash = (animatedPercent / 100) * C;

  const ringColor =
    derivedStatus === 'suspicious' ? 'var(--im-danger)' :
    derivedStatus === 'ok'         ? 'var(--im-accent)' :
                                     'var(--im-ink-muted)';

  const pillClass =
    derivedStatus === 'suspicious' ? 'im-pill im-pill--danger' :
    derivedStatus === 'ok'         ? 'im-pill im-pill--good'   :
                                     'im-pill';

  return (
    <div className={`im-card im-donut ${shouldRenderAndAnimate ? 'im-donut--in' : 'im-donut--out'}`}>
      <div className="im-donut-head">
        <div className="im-donut-title">{mainTitle}</div>
        <span className={pillClass}>
          {derivedStatus === 'suspicious' ? 'Suspicious' : derivedStatus === 'ok' ? 'Normal' : 'Idle'}
        </span>
      </div>

      <div className="im-donut-graphic">
        <svg width={sizePx} height={sizePx} viewBox={`0 0 ${sizePx} ${sizePx}`}>
          <circle cx={cx} cy={cy} r={r+10} fill="none" stroke="var(--im-ink-muted)" strokeOpacity="0.15"
                  strokeWidth="4" strokeDasharray={`${C * 0.28} ${C}`} strokeLinecap="round"
                  transform={`rotate(-90 ${cx} ${cy})`} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--im-ink-muted)" strokeOpacity="0.16"
                  strokeWidth={strokePx} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={ringColor}
                  strokeWidth={strokePx} strokeLinecap="round"
                  strokeDasharray={`${dash} ${C - dash}`} transform={`rotate(-90 ${cx} ${cy})`}
                  style={{ transition: 'stroke-dasharray 120ms linear' }} />
          <circle cx={cx} cy={cy} r={r - strokePx} fill="var(--im-surface)" />
          <text x={cx} y={cy + 6} textAnchor="middle" fontSize="22" fontWeight="700"
                fill="var(--im-ink-strong)">{Math.round(animatedPercent)}%</text>
        </svg>
      </div>

      {secondarySubtitle && <div className="im-card-sub">{secondarySubtitle}</div>}

      {!!humanReadableReason && (
        <div className="im-reason">
          <div className="im-reason-title">Reason</div>
          <div className="im-reason-body">{humanReadableReason}</div>
        </div>
      )}

      {factoidDictionary && Object.keys(factoidDictionary).length > 0 && (
        <div className="im-facts-grid">
          {Object.entries(factoidDictionary).map(([label, value]) => (
            <div key={label} className="im-fact">
              <div className="im-fact-key">{label}</div>
              <div className="im-fact-val">{String(value)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer
} from 'recharts';
import { MomentumDataPoint, MomentumPeriod, MomentumRange } from '../hooks/useMomentum';

interface MomentumChartProps {
  data: MomentumDataPoint[];
  period: MomentumPeriod;
  range: MomentumRange;
  onPeriodChange: (period: MomentumPeriod) => void;
  onRangeChange: (range: MomentumRange) => void;
}

type MetricKind = 'money' | 'eps' | 'pct' | 'ratio';
type MetricGroup = 'Income Statement' | 'Cash & Returns' | 'Balance Sheet';

interface MetricConfig {
  key: keyof MomentumDataPoint;
  label: string;
  kind: MetricKind;
  group: MetricGroup;
  color: string;
  lowerBetter?: boolean;
}

const METRICS: MetricConfig[] = [
  { key: 'revenue', label: 'Revenue', kind: 'money', group: 'Income Statement', color: '#059669' },
  { key: 'grossProfit', label: 'Gross Profit', kind: 'money', group: 'Income Statement', color: '#14b8a6' },
  { key: 'netIncome', label: 'Net Income', kind: 'money', group: 'Income Statement', color: '#6366f1' },
  { key: 'eps', label: 'EPS', kind: 'eps', group: 'Income Statement', color: '#0ea5e9' },
  { key: 'netMargin', label: 'Net Margin', kind: 'pct', group: 'Income Statement', color: '#10b981' },
  { key: 'operatingCashFlow', label: 'Operating Cash Flow', kind: 'money', group: 'Cash & Returns', color: '#0d9488' },
  { key: 'freeCashFlow', label: 'Free Cash Flow', kind: 'money', group: 'Cash & Returns', color: '#7c3aed' },
  { key: 'buybacks', label: 'Buybacks', kind: 'money', group: 'Cash & Returns', color: '#f59e0b' },
  { key: 'currentRatio', label: 'Current Ratio', kind: 'ratio', group: 'Balance Sheet', color: '#0284c7' },
  { key: 'debtToEquity', label: 'Debt / Equity', kind: 'ratio', group: 'Balance Sheet', color: '#f43f5e', lowerBetter: true }
];

const METRIC_GROUPS: MetricGroup[] = ['Income Statement', 'Cash & Returns', 'Balance Sheet'];

const RANGES: MomentumRange[] = ['2y', '5y', 'max'];

function fmt(kind: MetricKind, v: number | null | undefined): string {
  if (v == null) return 'n/a';
  if (kind === 'money') {
    const sign = v < 0 ? '-' : '';
    const abs = Math.abs(v);
    if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    return `${sign}$${abs.toLocaleString()}`;
  }
  if (kind === 'eps') return `$${v.toFixed(2)}`;
  if (kind === 'pct') return `${v.toFixed(1)}%`;
  return v.toFixed(2);
}

function fmtAxis(kind: MetricKind, v: number): string {
  if (kind === 'money') {
    const abs = Math.abs(v);
    if (abs >= 1_000_000_000) return `$${Math.round(v / 1_000_000_000)}B`;
    if (abs >= 1_000_000) return `$${Math.round(v / 1_000_000)}M`;
    return `$${v}`;
  }
  if (kind === 'pct') return `${v}%`;
  if (kind === 'eps') return `$${v}`;
  return `${v}`;
}

interface Change {
  text: string;
  pos: boolean;
}

function changeAt(metric: MetricConfig, data: MomentumDataPoint[], idx: number, period: MomentumPeriod): Change | null {
  const step = period === 'annual' ? 1 : 4;
  const priorIdx = idx - step;
  if (priorIdx < 0) return null;

  const cur = data[idx]?.[metric.key] as number | null;
  const prior = data[priorIdx]?.[metric.key] as number | null;
  if (cur == null || prior == null) return null;

  if (metric.kind === 'money' || metric.kind === 'eps') {
    if (prior === 0) return null;
    const pct = ((cur - prior) / Math.abs(prior)) * 100;
    const pos = metric.lowerBetter ? pct <= 0 : pct >= 0;
    return { text: `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}%`, pos };
  }

  const delta = cur - prior;
  const pos = metric.lowerBetter ? delta <= 0 : delta >= 0;
  const unit = metric.kind === 'pct' ? 'pt' : '';
  const decimals = metric.kind === 'pct' ? 1 : 2;
  return { text: `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(decimals)}${unit}`, pos };
}

type ChartView = 'value' | 'yoy';

// Numeric year-over-year change for a metric: percent growth for money/EPS
// metrics, point/absolute change for margins and ratios.
function yoyValueAt(metric: MetricConfig, data: MomentumDataPoint[], idx: number, period: MomentumPeriod): number | null {
  const step = period === 'annual' ? 1 : 4;
  const priorIdx = idx - step;
  if (priorIdx < 0) return null;
  const cur = data[idx]?.[metric.key] as number | null;
  const prior = data[priorIdx]?.[metric.key] as number | null;
  if (cur == null || prior == null) return null;

  if (metric.kind === 'money' || metric.kind === 'eps') {
    if (prior === 0) return null;
    return ((cur - prior) / Math.abs(prior)) * 100;
  }
  return cur - prior; // margins (points) and ratios (delta)
}

// How a YoY series should be formatted/labelled per the underlying metric
function yoyKind(metric: MetricConfig): MetricKind {
  return metric.kind === 'eps' ? 'pct' : metric.kind === 'money' ? 'pct' : metric.kind;
}

export const MomentumChart: React.FC<MomentumChartProps> = ({ data, period, range, onPeriodChange, onRangeChange }) => {
  const [activeMetric, setActiveMetric] = useState<MetricConfig>(METRICS[0]);
  const [view, setView] = useState<ChartView>('value');
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="momentum-chart">
        <div className="momentum-chart-header">
          <h3>Fundamentals Over Time</h3>
        </div>
        <p className="momentum-empty">No financial history available for this ticker.</p>
      </div>
    );
  }

  const isYoY = view === 'yoy';
  // The kind that drives axis/readout formatting and the dataKey we plot
  const plotKind: MetricKind = isYoY ? yoyKind(activeMetric) : activeMetric.kind;
  const plotKey = isYoY ? '__yoy' : activeMetric.key;

  // Build the series actually charted: raw value, or its YoY change
  const chartData = data.map((_, i) => ({
    ...data[i],
    __yoy: isYoY ? yoyValueAt(activeMetric, data, i, period) : null
  }));

  const readoutIdx = scrubIndex ?? data.length - 1;
  const readoutPoint = chartData[readoutIdx];
  const readoutValue = (readoutPoint as any)?.[plotKey] as number | null | undefined;
  const readoutChange = changeAt(activeMetric, data, readoutIdx, period);
  const changeUnit = activeMetric.kind === 'money' || activeMetric.kind === 'eps' ? 'YoY' : 'vs yr';

  const handleMove = (state: any) => {
    if (state?.isTooltipActive && state.activeTooltipIndex != null) {
      setScrubIndex(state.activeTooltipIndex);
    }
  };
  const handleLeave = () => setScrubIndex(null);

  return (
    <div className="momentum-chart">
      <div className="momentum-chart-header">
        <div>
          <h3>Fundamentals Over Time</h3>
          <p className="momentum-subtitle">Drag across the bars to read any period.</p>
        </div>
        <div className="momentum-controls">
          <div className="toggle-group">
            <button className={period === 'annual' ? 'active' : ''} onClick={() => onPeriodChange('annual')}>Annual</button>
            <button className={period === 'quarterly' ? 'active' : ''} onClick={() => onPeriodChange('quarterly')}>Quarterly</button>
          </div>
          <div className="toggle-group">
            {RANGES.map(r => (
              <button key={r} className={range === r ? 'active' : ''} onClick={() => onRangeChange(r)}>{r}</button>
            ))}
          </div>
          <div className="toggle-group">
            <button className={view === 'value' ? 'active' : ''} onClick={() => setView('value')}>Value</button>
            <button className={view === 'yoy' ? 'active' : ''} onClick={() => setView('yoy')}>YoY %</button>
          </div>
        </div>
      </div>

      <div className="momentum-readout">
        <div className="momentum-readout-label">{activeMetric.label}{isYoY ? ' · YoY growth' : ''}</div>
        <div className="momentum-readout-row">
          <span className="momentum-readout-value">
            {readoutValue == null ? 'n/a' : `${isYoY && readoutValue >= 0 ? '+' : ''}${fmt(plotKind, readoutValue)}`}
          </span>
          {!isYoY && (readoutChange ? (
            <span className={`momentum-chip ${readoutChange.pos ? 'pos' : 'neg'}`}>{readoutChange.text} {changeUnit}</span>
          ) : (
            <span className="momentum-chip neutral">n/a</span>
          ))}
          <span className="momentum-readout-period">
            {readoutPoint?.label}{scrubIndex == null ? ' · latest' : ''}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} onMouseMove={handleMove} onMouseLeave={handleLeave}>
          <defs>
            <linearGradient id="momentumBarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={activeMetric.color} stopOpacity={0.85} />
              <stop offset="100%" stopColor={activeMetric.color} stopOpacity={0.35} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e2a3a" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#7c8aa0' }} />
          <YAxis tickFormatter={(v) => fmtAxis(plotKind, v)} width={60} tick={{ fontSize: 11, fill: '#7c8aa0' }} />
          <Tooltip content={() => null} cursor={false} />
          {scrubIndex != null && <ReferenceLine x={chartData[scrubIndex]?.label} stroke="rgba(230,234,242,0.25)" />}
          <Bar dataKey={plotKey} radius={[4, 4, 0, 0]} maxBarSize={36}>
            {chartData.map((d, idx) => {
              // In YoY mode colour by sign (red = decline, accounting for lowerBetter metrics)
              const yoyPositive = (d.__yoy ?? 0) >= 0;
              const good = activeMetric.lowerBetter ? !yoyPositive : yoyPositive;
              const fill = isYoY
                ? (good ? '#059669' : '#dc2626')
                : (idx === scrubIndex ? activeMetric.color : 'url(#momentumBarGrad)');
              return <Cell key={idx} fill={fill} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {scrubIndex == null && <p className="momentum-hint">Drag across the bars to read any period &rarr;</p>}

      <div className="metric-rail-label">ALL METRICS &middot; tap to view</div>
      {METRIC_GROUPS.map(group => (
        <div key={group} className="metric-group">
          <div className="metric-group-label">{group}</div>
          <div className="metric-rail">
            {METRICS.filter(m => m.group === group).map(metric => {
              const lastIdx = data.length - 1;
              const value = data[lastIdx]?.[metric.key] as number | null | undefined;
              const change = changeAt(metric, data, lastIdx, period);
              const isActive = metric.key === activeMetric.key;

              return (
                <div
                  key={metric.key}
                  className={`metric-card ${isActive ? 'active' : ''}`}
                  style={isActive ? { borderColor: metric.color } : undefined}
                  onClick={() => { setActiveMetric(metric); setScrubIndex(null); }}
                >
                  <div className="metric-card-header">
                    <span className="metric-card-label">{metric.label}</span>
                    {change ? (
                      <span className={`momentum-chip small ${change.pos ? 'pos' : 'neg'}`}>{change.text}</span>
                    ) : (
                      <span className="momentum-chip small neutral">n/a</span>
                    )}
                  </div>
                  <div className="metric-card-value">{fmt(metric.kind, value)}</div>
                  <div className="metric-card-spark">
                    <ResponsiveContainer width="100%" height={32}>
                      <BarChart data={data}>
                        <Bar dataKey={metric.key} fill={metric.color} radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

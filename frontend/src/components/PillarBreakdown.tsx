import React from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer
} from 'recharts';
import { Stock } from '../hooks/useStock';
import { MetricTip } from './MetricTip';

interface PillarBreakdownProps {
  stock: Stock;
}

type Sentiment = 'pos' | 'neg' | 'warn' | 'neutral';

interface MetricChip {
  label: string;
  value: string;
  sentiment: Sentiment;
  info?: string; // key into the metric glossary for the hover/click explainer
}

interface PillarInfo {
  key: 'growing' | 'profitable' | 'fairlyPriced' | 'safe' | 'canKeepWinning';
  name: string;
  desc: string;
  icon: string;
  metrics: MetricChip[];
}

const ICONS = {
  growing: 'M3 17l5-5 4 4 7-8',
  profitable: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  fairlyPriced: 'M20.6 13.4L13.4 20.6a2 2 0 01-2.8 0l-7-7V4h9.6l7 7a2 2 0 010 2.4zM7.5 7.5h.01',
  safe: 'M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5z',
  canKeepWinning: 'M6 9H4a2 2 0 01-2-2V4h4M18 9h2a2 2 0 002-2V4h-4M6 4h12v6a6 6 0 01-12 0zM9 18h6M12 14v4'
} as const;

const STRONG_PHRASES = {
  growing: 'strong growth',
  profitable: 'strong profitability',
  fairlyPriced: 'attractively priced',
  safe: 'fortress balance sheet',
  canKeepWinning: 'durable moat'
} as const;

const WEAK_PHRASES = {
  growing: 'cooling growth',
  profitable: 'weak profitability',
  fairlyPriced: 'rich valuation',
  safe: 'balance sheet risk',
  canKeepWinning: 'eroding moat'
} as const;

function pct(v: number, decimals = 0): string {
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(decimals)}%`;
}

function buildPillars(stock: Stock): PillarInfo[] {
  const { ratios, trends, details } = stock;

  return [
    {
      key: 'growing',
      name: 'Growing',
      desc: 'Revenue & EPS growth trajectory',
      icon: ICONS.growing,
      metrics: [
        { label: 'Rev YoY', value: pct(trends.revenueYoY), sentiment: trends.revenueYoY >= 10 ? 'pos' : trends.revenueYoY >= 0 ? 'neutral' : 'neg', info: 'revenueYoY' },
        { label: 'EPS YoY', value: pct(trends.epsYoY), sentiment: trends.epsYoY >= 10 ? 'pos' : trends.epsYoY >= 0 ? 'neutral' : 'neg', info: 'epsYoY' },
        { label: '5Y CAGR', value: pct(trends.revenueCagr5Y), sentiment: trends.revenueCagr5Y >= 10 ? 'pos' : trends.revenueCagr5Y >= 0 ? 'neutral' : 'warn', info: 'revenueCagr5Y' },
        { label: 'Trajectory', value: trends.trajectory, sentiment: trends.trajectory === 'accelerating' ? 'pos' : trends.trajectory === 'cooling' ? 'warn' : 'neutral', info: 'trajectory' }
      ]
    },
    {
      key: 'profitable',
      name: 'Profitable',
      desc: 'Net margins & return on capital',
      icon: ICONS.profitable,
      metrics: [
        { label: 'Net margin', value: pct(ratios.netMargin, 1), sentiment: ratios.netMargin >= 15 ? 'pos' : ratios.netMargin >= 5 ? 'neutral' : 'warn', info: 'netMargin' },
        { label: 'ROE', value: pct(details.roe, 0), sentiment: details.roe >= 15 ? 'pos' : details.roe >= 5 ? 'neutral' : 'warn', info: 'roe' },
        { label: 'ROIC', value: pct(ratios.roic, 1), sentiment: ratios.roic >= 10 ? 'pos' : ratios.roic >= 5 ? 'neutral' : 'warn', info: 'roic' },
        {
          label: 'Earnings quality',
          value: details.ocfToNetIncome >= 1 ? 'high' : details.ocfToNetIncome >= 0.7 ? 'fair' : 'low',
          sentiment: details.ocfToNetIncome >= 1 ? 'pos' : details.ocfToNetIncome >= 0.7 ? 'neutral' : 'warn',
          info: 'earningsQuality'
        }
      ]
    },
    {
      key: 'fairlyPriced',
      name: 'Fairly Priced',
      desc: 'Valuation vs growth',
      icon: ICONS.fairlyPriced,
      metrics: [
        {
          label: 'PEG',
          value: ratios.pegRatio !== null ? ratios.pegRatio.toFixed(2) : 'n/a',
          sentiment: ratios.pegRatio === null ? 'neutral' : ratios.pegRatio <= 1 ? 'pos' : ratios.pegRatio <= 2 ? 'neutral' : 'warn',
          info: 'pegRatio'
        },
        { label: 'P/E', value: ratios.peRatio !== null ? ratios.peRatio.toFixed(1) : 'n/a', sentiment: 'neutral', info: 'peRatio' },
        {
          label: 'vs growth',
          value: ratios.pegRatio === null ? 'n/a' : ratios.pegRatio <= 1 ? 'fair' : ratios.pegRatio <= 2 ? 'full' : 'expensive',
          sentiment: ratios.pegRatio === null ? 'neutral' : ratios.pegRatio <= 1 ? 'pos' : ratios.pegRatio <= 2 ? 'neutral' : 'warn',
          info: 'pegRatio'
        }
      ]
    },
    {
      key: 'safe',
      name: 'Resilient',
      desc: 'Debt levels & financial strength',
      icon: ICONS.safe,
      metrics: [
        { label: 'Debt/Equity', value: ratios.debtToEquity.toFixed(2), sentiment: ratios.debtToEquity < 0.5 ? 'pos' : ratios.debtToEquity < 1 ? 'neutral' : 'warn', info: 'debtToEquity' },
        { label: 'Current ratio', value: details.currentRatio.toFixed(2), sentiment: details.currentRatio >= 1.5 ? 'pos' : details.currentRatio >= 1 ? 'neutral' : 'warn', info: 'currentRatio' },
        { label: 'Int. coverage', value: `${details.interestCoverage.toFixed(0)}×`, sentiment: details.interestCoverage >= 5 ? 'pos' : details.interestCoverage >= 2 ? 'neutral' : 'warn', info: 'interestCoverage' },
        {
          label: 'Intangibles',
          value: details.intangibleAssetRatio < 0.2 ? 'low' : details.intangibleAssetRatio < 0.4 ? 'moderate' : 'high',
          sentiment: details.intangibleAssetRatio < 0.2 ? 'pos' : details.intangibleAssetRatio < 0.4 ? 'neutral' : 'warn',
          info: 'intangibles'
        }
      ]
    },
    {
      key: 'canKeepWinning',
      name: 'Can Keep Winning',
      desc: 'Competitive moat & sustainability',
      icon: ICONS.canKeepWinning,
      metrics: [
        {
          label: 'ROIC trend',
          value: details.roicYoY > 1 ? 'rising' : details.roicYoY < -1 ? 'falling' : 'flat',
          sentiment: details.roicYoY > 1 ? 'pos' : details.roicYoY < -1 ? 'warn' : 'neutral',
          info: 'roicTrend'
        },
        {
          label: 'Op margin',
          value: details.operatingMarginYoY > 1 ? 'rising' : details.operatingMarginYoY < -1 ? 'falling' : 'flat',
          sentiment: details.operatingMarginYoY > 1 ? 'pos' : details.operatingMarginYoY < -1 ? 'warn' : 'neutral',
          info: 'opMargin'
        },
        details.buybackYield !== null
          ? { label: 'Buybacks', value: `net ${pct(details.buybackYield, 1)}`, sentiment: details.buybackYield > 0 ? 'pos' : details.buybackYield < -0.5 ? 'warn' : 'neutral', info: 'buybacks' }
          : { label: 'Share count', value: `net ${pct(details.shareCountYoY, 1)}`, sentiment: details.shareCountYoY < 0 ? 'pos' : details.shareCountYoY > 2 ? 'warn' : 'neutral', info: 'shareCount' }
      ]
    }
  ];
}

function colorFor(score: number): string {
  if (score >= 4.4) return '#059669';
  if (score >= 3.3) return '#10b981';
  if (score >= 2.9) return '#f59e0b';
  return '#f97316';
}

function buildVerdict(stock: Stock): string {
  const entries = Object.entries(stock.pillars) as [PillarInfo['key'], number][];
  const strongest = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const weakest = entries.reduce((a, b) => (b[1] < a[1] ? b : a));

  if (strongest[1] - weakest[1] < 0.8) {
    const avg = stock.rating;
    if (avg >= 4) return 'Consistently strong across all five pillars';
    if (avg <= 2.5) return 'Broadly weak across all five pillars';
    return 'Balanced, unremarkable fundamentals';
  }

  return `Mixed — ${STRONG_PHRASES[strongest[0]]}, ${WEAK_PHRASES[weakest[0]]}`;
}

const SENTIMENT_STYLE: Record<Sentiment, string> = {
  pos: 'pillar-chip-pos',
  neg: 'pillar-chip-neg',
  warn: 'pillar-chip-warn',
  neutral: 'pillar-chip-neutral'
};

export const PillarBreakdown: React.FC<PillarBreakdownProps> = ({ stock }) => {
  const pillarInfos = buildPillars(stock);
  // Short labels for the radar axis only - the pillar rows below still show
  // full names. Recharts doesn't reserve extra layout space for long axis
  // labels, so "Can Keep Winning" would otherwise clip past the chart edge.
  const RADAR_SHORT_NAMES: Record<PillarInfo['key'], string> = {
    growing: 'Growing',
    profitable: 'Profitable',
    fairlyPriced: 'Priced',
    safe: 'Resilient',
    canKeepWinning: 'Moat'
  };
  const radarData = pillarInfos.map(p => ({ name: RADAR_SHORT_NAMES[p.key], score: stock.pillars[p.key] }));

  return (
    <div className="pillar-breakdown">
      <div className="pillar-breakdown-header">
        <div>
          <h3>5-Pillar Analysis</h3>
          <p className="pillar-breakdown-subtitle">How {stock.ticker} scores on the five things that make a business worth owning.</p>
        </div>
        <div className="pillar-verdict-badge">
          <span className="pillar-verdict-dot" />
          <span>{buildVerdict(stock)}</span>
        </div>
      </div>

      <div className="pillar-grid">
        <div className="pillar-radar-box">
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <PolarGrid stroke="#1e2a3a" />
              <PolarAngleAxis dataKey="name" tick={{ fontSize: 10.5, fontWeight: 700, fill: '#9aa7bd' }} />
              <Radar dataKey="score" stroke="#10b981" strokeWidth={2.5} fill="#10b981" fillOpacity={0.25} />
            </RadarChart>
          </ResponsiveContainer>
          <div className="pillar-radar-overlay">
            <div className="pillar-overall-score">{stock.rating.toFixed(1)}</div>
            <div className="pillar-overall-label">OVERALL / 5</div>
          </div>
        </div>

        <div className="pillar-rows">
          {pillarInfos.map(p => {
            const score = stock.pillars[p.key];
            const color = colorFor(score);
            return (
              <div key={p.key} className="pillar-row" style={{ borderColor: '#eef2f7' }}>
                <div className="pillar-row-icon" style={{ background: `${color}1a` }}>
                  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={p.icon} />
                  </svg>
                </div>
                <div className="pillar-row-body">
                  <div className="pillar-row-top">
                    <span className="pillar-row-name">{p.name}</span>
                    <span className="pillar-row-score">
                      <span style={{ color }}>{score.toFixed(1)}</span>
                      <span className="pillar-row-score-max">/5</span>
                    </span>
                  </div>
                  <div className="pillar-row-bar-track">
                    <div className="pillar-row-bar-fill" style={{ width: `${(score / 5) * 100}%`, background: color }} />
                  </div>
                  <div className="pillar-row-desc">{p.desc}</div>
                  <div className="pillar-row-chips">
                    {p.metrics.map(m => (
                      m.info ? (
                        <MetricTip key={m.label} metric={m.info} className="pillar-chip-tip">
                          <span className={`pillar-chip pillar-chip-clickable ${SENTIMENT_STYLE[m.sentiment]}`}>
                            {m.label} <b>{m.value}</b>
                          </span>
                        </MetricTip>
                      ) : (
                        <span key={m.label} className={`pillar-chip ${SENTIMENT_STYLE[m.sentiment]}`}>
                          {m.label} <b>{m.value}</b>
                        </span>
                      )
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="ratios-section">
        <h4>Key Ratios <span className="ratios-hint">— hover or tap any metric to learn what it means</span></h4>
        <div className="ratios-grid">
          <div className="ratio-item">
            <span className="ratio-label">P/E Ratio <MetricTip metric="peRatio" /></span>
            <span className="ratio-value">{stock.ratios.peRatio !== null ? stock.ratios.peRatio.toFixed(1) : 'N/A'}</span>
          </div>
          <div className="ratio-item">
            <span className="ratio-label">Forward P/E <MetricTip metric="forwardPE" /></span>
            <span className="ratio-value">{stock.ratios.forwardPE != null ? stock.ratios.forwardPE.toFixed(1) : 'N/A'}</span>
          </div>
          <div className="ratio-item">
            <span className="ratio-label">PEG Ratio <MetricTip metric="pegRatio" /></span>
            <span className="ratio-value">{stock.ratios.pegRatio !== null ? stock.ratios.pegRatio.toFixed(2) : 'N/A'}</span>
          </div>
          <div className="ratio-item">
            <span className="ratio-label">Debt/Equity <MetricTip metric="debtToEquity" /></span>
            <span className="ratio-value">{stock.ratios.debtToEquity.toFixed(2)}</span>
          </div>
          <div className="ratio-item">
            <span className="ratio-label">Net Margin <MetricTip metric="netMargin" /></span>
            <span className="ratio-value">{stock.ratios.netMargin.toFixed(1)}%</span>
          </div>
          <div className="ratio-item">
            <span className="ratio-label">ROIC <MetricTip metric="roic" /></span>
            <span className="ratio-value">{stock.ratios.roic.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

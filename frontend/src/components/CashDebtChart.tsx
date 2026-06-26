import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { MomentumDataPoint } from '../hooks/useMomentum';

interface CashDebtChartProps {
  data: MomentumDataPoint[];
}

function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  return `${sign}$${abs.toLocaleString()}`;
}

export const CashDebtChart: React.FC<CashDebtChartProps> = ({ data }) => {
  const hasCashData = data.some(d => d.cash !== null);

  if (!hasCashData) {
    return (
      <div className="momentum-chart">
        <h3>Cash vs Debt</h3>
        <p className="momentum-empty">No SEC EDGAR cash data available for this company.</p>
      </div>
    );
  }

  return (
    <div className="momentum-chart">
      <h3>Cash vs Debt</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e2a3a" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#7c8aa0' }} />
          <YAxis tickFormatter={formatMoney} width={60} tick={{ fontSize: 11, fill: '#7c8aa0' }} />
          <Tooltip formatter={(value, name) => [formatMoney(Number(value)), String(name)]} />
          <Legend wrapperStyle={{ color: '#7c8aa0' }} />
          <Bar dataKey="cash" name="Cash" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="debt" name="Debt" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

import { useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { TickerAutocomplete } from './components/TickerAutocomplete';
import { RatingCard } from './components/RatingCard';
import { PillarBreakdown } from './components/PillarBreakdown';
import { MomentumChart } from './components/MomentumChart';
import { CashDebtChart } from './components/CashDebtChart';
import { AnalystTargets } from './components/AnalystTargets';
import { BusinessReview } from './components/BusinessReview';
import { PortfolioAnalyzer } from './components/PortfolioAnalyzer';
import { LandingHero } from './components/LandingHero';
import { LoginPage } from './components/LoginPage';
import { WatchlistPage } from './components/WatchlistPage';
import { HeaderAuth } from './components/HeaderAuth';
import { WatchlistButton } from './components/WatchlistButton';
import { useStock } from './hooks/useStock';
import { useMomentum, MomentumPeriod, MomentumRange } from './hooks/useMomentum';
import { useAuth } from './context/AuthContext';

function LandingRoute() {
  const navigate = useNavigate();
  return <LandingHero onSelectTicker={(ticker) => navigate(`/${ticker.toUpperCase()}`)} />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

function StockRoute() {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();
  const [momentumPeriod, setMomentumPeriod] = useState<MomentumPeriod>('annual');
  const [momentumRange, setMomentumRange] = useState<MomentumRange>('5y');
  const { stock, loading, error } = useStock(ticker || null);
  const { data: momentumData } = useMomentum(ticker || null, momentumPeriod, momentumRange);

  return (
    <div className="container">
      <header>
        <div className="logo" onClick={() => navigate('/landing')} style={{ cursor: 'pointer' }}>
          <span className="logo-icon">📈</span>
          <span className="logo-text">Funda</span>
        </div>
        <div className="header-search">
          <TickerAutocomplete onSelectTicker={(t) => navigate(`/${t.toUpperCase()}`)} />
        </div>
        <HeaderAuth />
      </header>

      <main>
        {loading && (
          <section className="loading">
            <p>Loading stock data...</p>
          </section>
        )}

        {error && (
          <section className="error">
            <p>⚠️ {error}</p>
          </section>
        )}

        {stock && !loading && (
          <section className="results">
            <div className="watchlist-button-row">
              <WatchlistButton ticker={stock.ticker} />
            </div>
            <RatingCard stock={stock} />
            <AnalystTargets analysts={stock.analysts} price={stock.price} />
            <PillarBreakdown stock={stock} />
            <MomentumChart
              data={momentumData}
              period={momentumPeriod}
              range={momentumRange}
              onPeriodChange={setMomentumPeriod}
              onRangeChange={setMomentumRange}
            />
            <BusinessReview ticker={stock.ticker} />
            <CashDebtChart data={momentumData} />
          </section>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/landing" replace />} />
      <Route path="/landing" element={<LandingRoute />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<LoginPage />} />
      <Route path="/watchlist" element={<ProtectedRoute><WatchlistPage /></ProtectedRoute>} />
      <Route path="/analyzer" element={<PortfolioAnalyzer />} />
      <Route path="/:ticker" element={<StockRoute />} />
    </Routes>
  );
}

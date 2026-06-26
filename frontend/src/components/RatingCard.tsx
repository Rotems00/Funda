import React from 'react';
import { Stock } from '../hooks/useStock';
import { CompanyLogo } from './CompanyLogo';

interface RatingCardProps {
  stock: Stock;
}

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const RatingCard: React.FC<RatingCardProps> = ({ stock }) => {
  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    return Array.from({ length: 5 }, (_, i) => {
      if (i === fullStars && hasHalfStar) {
        return <span key={i} className="star-half">★</span>;
      }
      return <span key={i} className={i < fullStars ? 'star-filled' : 'star-empty'}>★</span>;
    });
  };

  return (
    <div className="rating-card">
      <div className="rating-top">
        <div className="rating-identity">
          <CompanyLogo ticker={stock.ticker} className="ticker-avatar" />
          <div>
            <h2>{stock.ticker}</h2>
            <p className="ticker-subtitle">{stock.exchange} &middot; {titleCase(stock.sector)}</p>
            <p className="company-name">{stock.companyName}</p>
          </div>
        </div>

        <div className="funda-rating-panel">
          <div className="funda-rating-label">Funda Rating</div>
          <div className="funda-rating-value">
            <span className="funda-rating-number">{stock.rating.toFixed(1)}</span>
            <span className="funda-rating-of5">/ 5.0</span>
          </div>
          <div className="funda-rating-stars">{renderStars(stock.rating)}</div>
        </div>
      </div>

      <div className="rating-metrics">
        <div className="metric-box">
          <span className="metric-box-label">Price</span>
          <span className="metric-box-value">${stock.price.toLocaleString()}</span>
        </div>
        <div className="metric-box">
          <span className="metric-box-label">YTD</span>
          <span className={`metric-box-value ${stock.ytdChange >= 0 ? 'positive' : 'negative'}`}>
            {stock.ytdChange >= 0 ? '+' : ''}{stock.ytdChange.toFixed(1)}%
          </span>
        </div>
        <div className="metric-box">
          <span className="metric-box-label">From ATH</span>
          <span className={`metric-box-value ${stock.fromATH >= 0 ? 'positive' : 'negative'}`}>
            {stock.fromATH >= 0 ? '+' : ''}{stock.fromATH.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="rating-summary">
        <p>{stock.summary}</p>
      </div>
    </div>
  );
};

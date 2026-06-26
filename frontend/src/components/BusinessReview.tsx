import React, { useState, useEffect } from 'react';

interface BusinessReviewProps {
  ticker: string;
}

function renderInline(text: string): React.ReactNode[] {
  // Convert **bold** segments to <strong>
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    return m ? <strong key={i}>{m[1]}</strong> : <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

// Minimal markdown: ## / ### headings, - / * bullet lists, and paragraphs.
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = (key: string) => {
    if (list.length) {
      out.push(<ul key={`ul-${key}`} className="br-ul">{list.map((li, i) => <li key={i}>{renderInline(li)}</li>)}</ul>);
      list = [];
    }
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (/^#{2,3}\s+/.test(line)) {
      flush(String(idx));
      out.push(<h4 key={idx} className="br-h">{line.replace(/^#{2,3}\s+/, '')}</h4>);
    } else if (/^[-*]\s+/.test(line)) {
      list.push(line.replace(/^[-*]\s+/, ''));
    } else if (line.trim() === '') {
      flush(String(idx));
    } else {
      flush(String(idx));
      out.push(<p key={idx} className="br-p">{renderInline(line)}</p>);
    }
  });
  flush('end');
  return out;
}

/**
 * AI business deep-dive for a single ticker — a 20-year investor's take built
 * from the company description, latest quarter numbers, Funda ratings and the
 * latest earnings-call transcript. Cached server-side, so it loads instantly
 * once any user has generated it.
 */
export const BusinessReview: React.FC<BusinessReviewProps> = ({ ticker }) => {
  const [review, setReview] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount, look for a cached review (no generation triggered)
  useEffect(() => {
    let cancelled = false;
    setReview(null);
    setError(null);
    setCached(false);
    setChecking(true);
    (async () => {
      try {
        const resp = await fetch(`/api/stocks/${ticker}/business-review`);
        if (cancelled) return;
        if (resp.status === 204) {
          setReview(null);
        } else if (resp.ok) {
          setReview(await resp.text());
          setCached(true);
        }
      } catch {
        /* leave as "not generated" — the button can retry */
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ticker]);

  const generate = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setReview('');
    setCached(false);
    try {
      const resp = await fetch(`/api/stocks/${ticker}/business-review?generate=1`);
      if (!resp.ok || !resp.body) {
        const j = await resp.json().catch(() => ({}));
        setError(j.error || 'Could not generate the review.');
        setReview(null);
        return;
      }
      const wasCached = resp.headers.get('X-Review-Cached') === 'true';
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setReview(text);
      }
      if (wasCached) setCached(true);
    } catch {
      setError('Could not generate the review.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="business-review">
      <div className="br-top">
        <div>
          <h3>🧠 AI Business Review</h3>
          <p className="br-subtitle">A candid deep dive — read from {ticker}'s latest earnings call, quarterly report and Funda ratings.</p>
        </div>
        {(review || loading) && (
          <span className={`br-badge ${cached ? 'br-badge-cached' : 'br-badge-live'}`}>
            {loading ? 'Writing…' : cached ? '✓ Cached' : 'Fresh'}
          </span>
        )}
      </div>

      {error && (
        <div className="br-error"><span className="br-error-icon">!</span><span>{error}</span></div>
      )}

      {/* Empty state — offer to generate */}
      {!checking && review === null && !loading && !error && (
        <div className="br-empty">
          <p className="br-empty-text">No deep-dive yet. Generate one — a local AI reads the latest transcript and the numbers, then writes a full review (cached for everyone after).</p>
          <button className="br-btn" onClick={generate}>Generate full review</button>
        </div>
      )}

      {checking && <p className="br-loading">Checking for a saved review…</p>}

      {loading && (!review || review.length === 0) && (
        <p className="br-loading">Reading the latest transcript &amp; numbers, writing the review… <span className="br-dots" /></p>
      )}

      {review && review.length > 0 && (
        <div className="br-body">{renderMarkdown(review)}</div>
      )}
    </div>
  );
};

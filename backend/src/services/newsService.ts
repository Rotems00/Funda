import axios from 'axios';

/**
 * News API Service
 * Fetches news headlines related to stocks
 */

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const NEWS_API_BASE_URL = 'https://newsapi.org/v2';

interface NewsArticle {
  ticker: string;
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  image: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

/**
 * Get top headlines for a ticker
 */
export async function getHeadlines(ticker: string, limit: number = 20): Promise<NewsArticle[]> {
  try {
    if (!NEWS_API_KEY) {
      console.warn('NEWS_API_KEY not configured');
      return [];
    }

    const response = await axios.get(`${NEWS_API_BASE_URL}/everything`, {
      params: {
        q: ticker,
        sortBy: 'publishedAt',
        pageSize: limit,
        apiKey: NEWS_API_KEY
      }
    });

    if (response.data?.articles) {
      return response.data.articles.map((article: any) => ({
        ticker,
        title: article.title,
        description: article.description,
        url: article.url,
        source: article.source.name,
        publishedAt: article.publishedAt,
        image: article.urlToImage,
        sentiment: analyzeSentiment(article.title + ' ' + (article.description || ''))
      }));
    }
    return [];
  } catch (error) {
    console.error(`Error fetching headlines for ${ticker}:`, error);
    return [];
  }
}

/**
 * Simple sentiment analysis
 * In production, use a proper NLP library
 */
function analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const positiveWords = ['gain', 'profit', 'growth', 'surge', 'rally', 'beat', 'strong', 'recovery', 'bullish'];
  const negativeWords = ['loss', 'decline', 'fall', 'crash', 'drop', 'miss', 'weak', 'bearish', 'slump'];

  const lowerText = text.toLowerCase();
  const posCount = positiveWords.filter((word: string) => lowerText.includes(word)).length;
  const negCount = negativeWords.filter((word: string) => lowerText.includes(word)).length;

  if (posCount > negCount) return 'positive';
  if (negCount > posCount) return 'negative';
  return 'neutral';
}

/**
 * Get news about a company sector
 */
export async function getSectorNews(sector: string, limit: number = 10): Promise<NewsArticle[]> {
  try {
    if (!NEWS_API_KEY) {
      console.warn('NEWS_API_KEY not configured');
      return [];
    }

    const response = await axios.get(`${NEWS_API_BASE_URL}/everything`, {
      params: {
        q: sector,
        sortBy: 'publishedAt',
        pageSize: limit,
        category: 'business',
        apiKey: NEWS_API_KEY
      }
    });

    if (response.data?.articles) {
      return response.data.articles.map((article: any) => ({
        ticker: sector,
        title: article.title,
        description: article.description,
        url: article.url,
        source: article.source.name,
        publishedAt: article.publishedAt,
        image: article.urlToImage
      }));
    }
    return [];
  } catch (error) {
    console.error(`Error fetching sector news for ${sector}:`, error);
    return [];
  }
}

export default {
  getHeadlines,
  getSectorNews,
  analyzeSentiment
};

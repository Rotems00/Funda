import request from 'supertest';

// Mock the stock-detail pipeline so route tests don't hit FMP or MongoDB.
jest.mock('../services/stockService');
import { getStockDetail } from '../services/stockService';
import app from '../app';

const mockGetStockDetail = getStockDetail as jest.MockedFunction<typeof getStockDetail>;

describe('core routes', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('unknown routes 404 with an error body', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /api/stocks/:ticker', () => {
  it('returns the resolved stock detail', async () => {
    mockGetStockDetail.mockResolvedValue({
      detail: {
        ticker: 'AAPL', companyName: 'Apple Inc.', exchange: 'NASDAQ',
        sector: 'Technology', industry: 'Consumer Electronics',
        price: 100, ytdChange: 1, fromATH: -5, rating: 4,
        summary: 'ok', pillars: {}, ratios: {}, trends: {}, details: {}, analysts: null
      }
    } as any);

    const res = await request(app).get('/api/stocks/aapl');
    expect(res.status).toBe(200);
    expect(res.body.ticker).toBe('AAPL');
    expect(res.body.rating).toBe(4);
    // ticker is upper-cased before hitting the service
    expect(mockGetStockDetail).toHaveBeenCalledWith('aapl');
  });

  it('maps a not_found result to a 404', async () => {
    mockGetStockDetail.mockResolvedValue({ error: 'not_found' } as any);
    const res = await request(app).get('/api/stocks/zzzz');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 500 when the pipeline throws', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetStockDetail.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/api/stocks/AAPL');
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});

describe('portfolio route validation', () => {
  it('rejects a suggest request with no preferences', async () => {
    const res = await request(app).post('/api/portfolio/suggest').send({ holdings: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/preferences/i);
  });

  it('rejects a review request with no holdings', async () => {
    const res = await request(app).post('/api/portfolio/review').send({ holdings: [] });
    expect(res.status).toBe(400);
  });
});

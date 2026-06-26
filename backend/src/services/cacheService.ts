import mongoose from 'mongoose';
import { IStock, IFundamentals, IMetrics, IPrice, IUserProfile, WATCHLIST_LIMIT } from '../models/stockSchema';

/**
 * MongoDB Cache Service
 * Handles all database operations for stocks, fundamentals, metrics, prices, and user profiles
 */

// mongoose.model(name, schema) re-registers the model every time it's called,
// which throws OverwriteModelError on the 2nd call within the same process
function getOrCreateModel(name: string, schemaFactory: () => mongoose.Schema): mongoose.Model<any> {
  return mongoose.models[name] || mongoose.model(name, schemaFactory());
}

// Connect to MongoDB
export async function connectDB() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/funda';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

// ==================== STOCKS ====================

/**
 * Save or update stock info
 */
export async function saveStock(stock: Partial<IStock>): Promise<IStock> {
  try {
    const StockModel = getOrCreateModel('Stock', getStockSchema);
    
    const updated = await StockModel.findOneAndUpdate(
      { ticker: stock.ticker },
      {
        ...stock,
        lastUpdated: new Date(),
        dataFreshness: stock.dataFreshness || {}
      },
      { upsert: true, new: true }
    );

    return updated as IStock;
  } catch (error) {
    console.error('Error saving stock:', error);
    throw error;
  }
}

/**
 * Get stock by ticker
 */
export async function getStock(ticker: string): Promise<IStock | null> {
  try {
    const StockModel = getOrCreateModel('Stock', getStockSchema);
    const stock = await StockModel.findOne({ ticker: ticker.toUpperCase() });
    return stock as IStock | null;
  } catch (error) {
    console.error(`Error getting stock ${ticker}:`, error);
    return null;
  }
}

/**
 * Search stocks by ticker or name
 */
export async function searchStocks(query: string, limit: number = 10): Promise<IStock[]> {
  try {
    const StockModel = getOrCreateModel('Stock', getStockSchema);
    
    const stocks = await StockModel.find(
      {
        $or: [
          { ticker: { $regex: query, $options: 'i' } },
          { companyName: { $regex: query, $options: 'i' } }
        ]
      },
      null,
      { limit }
    );

    return stocks as IStock[];
  } catch (error) {
    console.error('Error searching stocks:', error);
    return [];
  }
}

// ==================== FUNDAMENTALS ====================

/**
 * Save a stock's full quarter history in one document. Every fetch/refresh
 * pulls a whole batch of quarters from Polygon together, so this replaces
 * the stored array wholesale rather than upserting quarter-by-quarter
 */
export async function saveFundamentals(stockId: string, cik: string | undefined, quarters: IFundamentals['quarters'], edgarComplete = true): Promise<IFundamentals> {
  try {
    const FundamentalsModel = getOrCreateModel('Fundamentals', getFundamentalsSchema);

    const updated = await FundamentalsModel.findOneAndUpdate(
      { stockId },
      { stockId, cik, quarters, edgarComplete, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    return updated as IFundamentals;
  } catch (error) {
    console.error('Error saving fundamentals:', error);
    throw error;
  }
}

/**
 * Get a stock's cached quarter history
 */
export async function getFundamentals(stockId: string): Promise<IFundamentals | null> {
  try {
    const FundamentalsModel = getOrCreateModel('Fundamentals', getFundamentalsSchema);
    const doc = await FundamentalsModel.findOne({ stockId });
    return doc as IFundamentals | null;
  } catch (error) {
    console.error('Error getting fundamentals:', error);
    return null;
  }
}

// ==================== METRICS ====================

/**
 * Save computed metrics (rating + pillars)
 */
export async function saveMetrics(metrics: Partial<IMetrics>): Promise<IMetrics> {
  try {
    const MetricsModel = getOrCreateModel('Metrics', getMetricsSchema);

    const updated = await MetricsModel.findOneAndUpdate(
      { stockId: metrics.stockId },
      { ...metrics, computedAt: new Date() },
      { upsert: true, new: true }
    );

    return updated as IMetrics;
  } catch (error) {
    console.error('Error saving metrics:', error);
    throw error;
  }
}

/**
 * Get metrics for a stock
 */
export async function getMetrics(stockId: string): Promise<IMetrics | null> {
  try {
    const MetricsModel = getOrCreateModel('Metrics', getMetricsSchema);
    const metrics = await MetricsModel.findOne({ stockId });
    return metrics as IMetrics | null;
  } catch (error) {
    console.error('Error getting metrics:', error);
    return null;
  }
}

// ==================== PRICES ====================

/**
 * Save daily price data
 */
export async function savePrice(price: Partial<IPrice>): Promise<IPrice> {
  try {
    const PriceModel = getOrCreateModel('Price', getPriceSchema);

    const updated = await PriceModel.findOneAndUpdate(
      { stockId: price.stockId, date: price.date },
      price,
      { upsert: true, new: true }
    );

    return updated as IPrice;
  } catch (error) {
    console.error('Error saving price:', error);
    throw error;
  }
}

/**
 * Get latest price for a stock
 */
export async function getLatestPrice(stockId: string): Promise<IPrice | null> {
  try {
    const PriceModel = getOrCreateModel('Price', getPriceSchema);
    
    const price = await PriceModel.findOne({ stockId })
      .sort({ date: -1 });

    return price as IPrice | null;
  } catch (error) {
    console.error('Error getting latest price:', error);
    return null;
  }
}

/**
 * Get price history for a date range
 */
export async function getPriceHistory(stockId: string, startDate: Date, endDate: Date): Promise<IPrice[]> {
  try {
    const PriceModel = getOrCreateModel('Price', getPriceSchema);

    const prices = await PriceModel.find({
      stockId,
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: 1 });

    return prices as IPrice[];
  } catch (error) {
    console.error('Error getting price history:', error);
    return [];
  }
}

// ==================== USER PROFILES ====================

/**
 * Save user profile
 */
export async function saveUserProfile(profile: Partial<IUserProfile>): Promise<IUserProfile> {
  try {
    const UserModel = getOrCreateModel('UserProfile', getUserProfileSchema);

    const updated = await UserModel.findOneAndUpdate(
      { userId: profile.userId },
      profile,
      { upsert: true, new: true }
    );

    return updated as IUserProfile;
  } catch (error) {
    console.error('Error saving user profile:', error);
    throw error;
  }
}

/**
 * Get user profile
 */
export async function getUserProfile(userId: string): Promise<IUserProfile | null> {
  try {
    const UserModel = getOrCreateModel('UserProfile', getUserProfileSchema);
    const profile = await UserModel.findOne({ userId });
    return profile as IUserProfile | null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

/**
 * Add a ticker to a user's watchlist, capped at WATCHLIST_LIMIT.
 * Returns null if the watchlist is already full (and the ticker isn't
 * already on it) so the route can return a clear 4xx instead of silently
 * no-op'ing
 */
export async function addToWatchlist(userId: string, ticker: string): Promise<IUserProfile | null> {
  try {
    const UserModel = getOrCreateModel('UserProfile', getUserProfileSchema);

    const profile = await UserModel.findOne({ userId });
    if (profile && !profile.watchlist.includes(ticker) && profile.watchlist.length >= WATCHLIST_LIMIT) {
      return null;
    }

    const updated = await UserModel.findOneAndUpdate(
      { userId },
      { $addToSet: { watchlist: ticker } },
      { new: true }
    );

    return updated as IUserProfile | null;
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    return null;
  }
}

/**
 * Remove a ticker from a user's watchlist
 */
export async function removeFromWatchlist(userId: string, ticker: string): Promise<IUserProfile | null> {
  try {
    const UserModel = getOrCreateModel('UserProfile', getUserProfileSchema);

    const updated = await UserModel.findOneAndUpdate(
      { userId },
      { $pull: { watchlist: ticker } },
      { new: true }
    );

    return updated as IUserProfile | null;
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    return null;
  }
}

// ==================== MONGOOSE SCHEMAS ====================

function getStockSchema() {
  return new mongoose.Schema({
    ticker: { type: String, required: true, unique: true, index: true },
    cik: String,
    companyName: String,
    exchange: String,
    sector: String,
    industry: String,
    price: Number,
    ytdChange: Number,
    fromATH: Number,
    priceUpdatedAt: Date,
    lastUpdated: { type: Date, default: Date.now },
    dataFreshness: {
      ticker: Date,
      fundamentals: Date,
      price: Date
    }
  });
}

function getFundamentalsSchema() {
  const quarterSchema = new mongoose.Schema({
    fiscalPeriod: String,
    fiscalYear: String,
    endDate: String,
    revenue: Number,
    grossProfit: Number,
    netIncome: Number,
    eps: Number,
    operatingIncome: Number,
    nonOperatingIncome: Number,
    operatingCashFlow: Number,
    dilutedShares: Number,
    cash: Number,
    capitalExpenditure: Number,
    buybacks: Number,
    dividendsPaid: Number,
    currentAssets: Number,
    currentLiabilities: Number,
    inventory: Number,
    accountsPayable: Number,
    totalAssets: Number,
    totalLiabilities: Number,
    longTermDebt: Number,
    intangibleAssets: Number,
    equity: Number
  }, { _id: false });

  return new mongoose.Schema({
    stockId: { type: String, required: true, unique: true, index: true },
    cik: String,
    quarters: [quarterSchema],
    edgarComplete: { type: Boolean, default: true },
    updatedAt: { type: Date, default: Date.now }
  });
}

function getMetricsSchema() {
  return new mongoose.Schema({
    stockId: { type: String, required: true, unique: true, index: true },
    rating: { type: Number, min: 0, max: 5 },
    pillars: {
      growing: Number,
      profitable: Number,
      fairlyPriced: Number,
      safe: Number,
      canKeepWinning: Number
    },
    ratios: {
      peRatio: Number,
      pegRatio: Number,
      forwardPE: Number,
      debtToEquity: Number,
      netMargin: Number,
      roic: Number
    },
    trends: {
      revenueYoY: Number,
      epsYoY: Number,
      revenueCagr5Y: Number,
      trajectory: { type: String, enum: ['accelerating', 'steady', 'cooling'] }
    },
    details: {
      roe: Number,
      ocfToNetIncome: Number,
      currentRatio: Number,
      interestCoverage: Number,
      intangibleAssetRatio: Number,
      roicYoY: Number,
      operatingMarginYoY: Number,
      shareCountYoY: Number,
      buybackYield: Number
    },
    analysts: {
      consensus: Number,
      high: Number,
      low: Number,
      median: Number,
      analystCount: Number,
      rating: String,
      upside: Number,
      targets: [{ company: String, analyst: String, priceTarget: Number, date: String, url: String }]
    },
    computedAt: { type: Date, default: Date.now }
  });
}

function getPriceSchema() {
  return new mongoose.Schema({
    stockId: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    open: Number,
    high: Number,
    low: Number,
    close: Number,
    volume: Number,
    ytdChange: Number,
    athPrice: Number,
    atHighDistancePercent: Number
  });
}

function getUserProfileSchema() {
  return new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true },
    name: String,
    picture: String,
    sectors: [String],
    confidence: { type: String, enum: ['beginner', 'intermediate', 'advanced'] },
    watchlist: [String],
    recentSearches: [String],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });
}

export default {
  connectDB,
  saveStock,
  getStock,
  searchStocks,
  saveFundamentals,
  getFundamentals,
  saveMetrics,
  getMetrics,
  savePrice,
  getLatestPrice,
  getPriceHistory,
  saveUserProfile,
  getUserProfile,
  addToWatchlist,
  removeFromWatchlist
};

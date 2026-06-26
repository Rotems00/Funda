import app from './app';
import cacheService from './services/cacheService';

const port = process.env.PORT || 3001;

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await cacheService.connectDB();

    app.listen(port, () => {
      console.log(`🚀 Funda backend running on http://localhost:${port}`);
      console.log(`📊 Health check: http://localhost:${port}/health`);
      console.log(`📈 API endpoints: http://localhost:${port}/api`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

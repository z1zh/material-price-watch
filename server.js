require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const { PriceDatabase, logger } = require('./database');
const { PriceCrawler, MATERIAL_CONFIG } = require('./crawler');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'static')));

// 初始化
const db = new PriceDatabase();
const crawler = new PriceCrawler();

// ==================== REST API ====================

// 获取所有材料最新价格
app.get('/api/prices', (req, res) => {
  try {
    const prices = db.getLatestPrices();
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: prices
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取涨跌排行
app.get('/api/movers/:type', (req, res) => {
  try {
    const type = req.params.type === 'decliners' ? 'decliners' : 'gainers';
    const movers = db.getMovers(type);
    res.json({ success: true, data: movers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取单个材料历史数据
app.get('/api/material/:id/history', (req, res) => {
  try {
    const history = db.getPriceHistory(req.params.id, 30);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取材料配置信息
app.get('/api/config', (req, res) => {
  res.json({ success: true, data: MATERIAL_CONFIG });
});

// 手动触发爬虫
app.post('/api/crawl/trigger', async (req, res) => {
  try {
    const data = await crawler.crawlAll();
    const results = [];
    
    for (const item of data) {
      const result = db.savePrice(item);
      results.push({ id: item.id, changePercent: result.changePercent });
    }

    // 广播更新事件
    io.emit('prices:updated', { timestamp: new Date().toISOString(), results });

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取系统状态
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    status: 'running',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    lastUpdate: new Date().toISOString()
  });
});

// ==================== WebSocket ====================

io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // 发送当前价格数据
  socket.emit('prices:initial', db.getLatestPrices());

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// ==================== 定时爬虫 ====================

// 每30分钟执行一次爬虫
cron.schedule('*/30 * * * *', async () => {
  logger.info('Scheduled crawl starting...');
  try {
    const data = await crawler.crawlAll();
    const results = [];
    
    for (const item of data) {
      const result = db.savePrice(item);
      results.push({ id: item.id, changePercent: result.changePercent });
    }

    // 广播更新
    io.emit('prices:updated', { 
      timestamp: new Date().toISOString(), 
      results,
      count: results.length
    });

    logger.info(`Scheduled crawl completed: ${results.length} prices updated`);
  } catch (error) {
    logger.error(`Scheduled crawl failed: ${error.message}`);
  }
});

// 启动时执行一次初始抓取
(async () => {
  logger.info('Initial crawl on boot...');
  try {
    const data = await crawler.crawlAll();
    for (const item of data) {
      db.savePrice(item);
    }
    logger.info(`Initial crawl completed: ${data.length} prices saved`);
    
    // 广播初始数据
    io.emit('prices:initial', db.getLatestPrices());
  } catch (error) {
    logger.error(`Initial crawl failed: ${error.message}`);
  }
})();

// ==================== 前端集成 ====================

// 首页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'index.html'));
});

// 地图页
app.get('/map', (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'map.html'));
});

// ==================== 启动 ====================

const PORT = process.env.PORT || 3333;

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server started on http://0.0.0.0:${PORT}`);
  logger.info(`WebSocket server ready for real-time updates`);
  logger.info(`API endpoints:`);
  logger.info(`  GET  /api/prices - All latest prices`);
  logger.info(`  GET  /api/movers/:type - Top gainers/decliners`);
  logger.info(`  GET  /api/material/:id/history - Historical data`);
  logger.info(`  POST /api/crawl/trigger - Manual crawl`);
  logger.info(`  GET  /api/status - System status`);
});

// 优雅关闭
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  db.close();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down...');
  db.close();
  server.close(() => process.exit(0));
});

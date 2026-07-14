const fs = require('fs');
const path = require('path');
const winston = require('winston');

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'crawler.log' })
  ]
});

class PriceDatabase {
  constructor(dbPath = path.join(__dirname, 'prices.json')) {
    this.dbPath = dbPath;
    this.data = {
      prices: {},      // material_id -> latest price data
      history: {}      // material_id -> [price history array]
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf8');
        this.data = JSON.parse(raw);
        logger.info(`Loaded ${Object.keys(this.data.prices).length} materials from database`);
      } else {
        logger.info('New database created');
        this.save();
      }
    } catch (error) {
      logger.warn(`Failed to load database: ${error.message}, starting fresh`);
      this.data = { prices: {}, history: {} };
    }
  }

  save() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (error) {
      logger.error(`Failed to save database: ${error.message}`);
    }
  }

  // 获取上一个价格（用于计算涨跌）
  getPreviousPrice(materialId) {
    const history = this.data.history[materialId] || [];
    if (history.length < 1) return null;
    // 返回倒数第二条记录（上一条是当前的）
    return history.length >= 2 ? history[history.length - 2].price : null;
  }

  // 保存价格数据
  savePrice(material) {
    const previousPrice = this.getPreviousPrice(material.id);
    
    // 计算涨跌
    const changeAmount = previousPrice !== null ? material.price - previousPrice : 0;
    const changePercent = previousPrice !== null && previousPrice !== 0 
      ? ((material.price - previousPrice) / previousPrice * 100) 
      : 0;

    // 保存当前价格
    this.data.prices[material.id] = {
      material_id: material.id,
      material_name: material.name_zh,
      material_name_en: material.name_en,
      category: material.category,
      source: material.source || 'mock',
      price: material.price,
      unit: material.unit_zh,
      price_display: material.priceDisplay_zh || material.price.toFixed(2),
      previous_price: previousPrice,
      change_amount: changeAmount,
      change_percent: changePercent,
      high: material.high || null,
      low: material.low || null,
      formula: material.formula,
      description_zh: material.desc_zh,
      description_en: material.desc_en,
      color: material.color,
      timestamp: new Date().toISOString()
    };

    // 添加历史记录
    if (!this.data.history[material.id]) {
      this.data.history[material.id] = [];
    }
    
    this.data.history[material.id].push({
      price: material.price,
      timestamp: new Date().toISOString()
    });

    // 保留最近100条历史
    if (this.data.history[material.id].length > 100) {
      this.data.history[material.id] = this.data.history[material.id].slice(-100);
    }

    // 保存到文件
    this.save();

    return { changeAmount, changePercent };
  }

  // 获取最新价格（所有材料）
  getLatestPrices() {
    return Object.values(this.data.prices);
  }

  // 获取某个材料的历史价格序列（用于图表）
  getPriceHistory(materialId, limit = 10) {
    const history = this.data.history[materialId] || [];
    return history.slice(-limit);
  }

  // 获取涨跌排行
  getMovers(type = 'gainers') {
    const prices = this.getLatestPrices();
    const sorted = prices.sort((a, b) => {
      return type === 'gainers' 
        ? (b.change_percent || 0) - (a.change_percent || 0)
        : (a.change_percent || 0) - (b.change_percent || 0);
    });
    return sorted.filter(p => type === 'gainers' ? p.change_percent > 0 : p.change_percent < 0);
  }

  close() {
    this.save();
    logger.info('Database closed');
  }
}

module.exports = { PriceDatabase, logger };

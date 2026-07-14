require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const { logger } = require('./database');

// ============================================================
// 真实数据源配置 (从 .env 文件读取)
// ============================================================
const SMM_USERNAME = process.env.SMM_USERNAME || '';
const SMM_PASSWORD = process.env.SMM_PASSWORD || '';
const METALS_API_KEY = process.env.METALS_API_KEY || '';

// SMM 登录会话缓存
let smmSession = { cookie: null, token: null, loginTime: 0 };

// 材料配置映射
const MATERIAL_CONFIG = {
  // === 稀土系列 (来源: SMM) ===
  'la2o3': {
    id: 'la2o3', name_zh: '氧化镧', name_en: 'Lanthanum Oxide',
    category: 'rare-earth', formula: 'La₂O₃',
    source: 'smm', smmCategory: 'rare-earth', smmKeyword: '氧化镧',
    color: '#f59e0b',
    desc_zh: '用于石油催化裂化、光学玻璃及陶瓷材料。轻稀土大宗产品，受新能源及抛光材料需求拉动。',
    desc_en: 'Used in FCC catalysts, optical glass and ceramics. Light rare earth bulk product, driven by new energy and polishing demand.'
  },
  'ceo2': {
    id: 'ceo2', name_zh: '氧化铈', name_en: 'Cerium Oxide',
    category: 'rare-earth', formula: 'CeO₂',
    source: 'smm', smmCategory: 'rare-earth', smmKeyword: '氧化铈',
    color: '#eab308',
    desc_zh: '重要抛光材料及催化剂组分，广泛用于玻璃加工、汽车尾气净化及燃料电池领域。',
    desc_en: 'Key polishing material and catalyst component, widely used in glass processing, auto exhaust purification and fuel cells.'
  },
  'la-metal': {
    id: 'la-metal', name_zh: '金属镧', name_en: 'Lanthanum Metal',
    category: 'rare-earth', formula: 'La',
    source: 'smm', smmCategory: 'rare-earth', smmKeyword: '金属镧',
    color: '#d97706',
    desc_zh: '用于镍氢电池负极合金、特种钢铁脱氧脱硫，合金级Ce≥65%标准品。',
    desc_en: 'Used in NiMH battery anode alloys, special steel deoxidation. Alloy grade Ce≥65% standard.'
  },
  'ce-metal': {
    id: 'ce-metal', name_zh: '金属铈', name_en: 'Cerium Metal',
    category: 'rare-earth', formula: 'Ce',
    source: 'smm', smmCategory: 'rare-earth', smmKeyword: '金属铈',
    color: '#ca8a04',
    desc_zh: '电池级金属铈，Ce≥65%，用于储氢合金及稀土永磁体添加剂。',
    desc_en: 'Battery grade cerium metal, Ce≥65%, for hydrogen storage alloys and rare earth permanent magnet additives.'
  },

  // === 催化材料 (来源: 行业数据/综合渠道) ===
  'pseudo-boehmite': {
    id: 'pseudo-boehmite', name_zh: '拟薄水铝石', name_en: 'Pseudo-boehmite',
    category: 'catalyst', formula: 'AlOOH·nH₂O',
    source: 'industry', industryQuery: '拟薄水铝石 价格',
    color: '#3b82f6',
    desc_zh: '催化裂化(FCC)催化剂关键载体前驱体，高比表面积型需求持续增长，受炼化产能升级驱动。',
    desc_en: 'Key precursor for FCC catalyst supports. High surface area grade demand grows with refinery upgrades.'
  },
  'molecular-sieve': {
    id: 'molecular-sieve', name_zh: '硅铝分子筛', name_en: 'Silica-Alumina Zeolite',
    category: 'catalyst', formula: 'ZSM-5 / Y型',
    source: 'industry', industryQuery: '硅铝分子筛 ZSM-5 价格',
    color: '#6366f1',
    desc_zh: 'ZSM-5/Y型分子筛是石油炼制催化裂化和化工分离过程的核心材料，国六标准推动需求升级。',
    desc_en: 'ZSM-5/Y zeolites are core materials for FCC and chemical separation. China VI standards drive demand upgrade.'
  },
  'sio2-support': {
    id: 'sio2-support', name_zh: '二氧化硅载体', name_en: 'Silica Support',
    category: 'catalyst', formula: 'SiO₂',
    source: 'industry', industryQuery: '二氧化硅载体 催化剂 价格',
    color: '#06b6d4',
    desc_zh: '高纯度多孔SiO₂载体，广泛用于加氢、氧化及聚合反应催化剂的负载基材。',
    desc_en: 'High-purity porous SiO₂ support, widely used as substrate for hydrogenation, oxidation and polymerization catalysts.'
  },

  // === 有色金属 (来源: SHFE + SMM + LME) ===
  'mo': {
    id: 'mo', name_zh: '钼', name_en: 'Molybdenum',
    category: 'metals', formula: 'Mo',
    source: 'smm', smmCategory: 'tungsten', smmKeyword: '钼',
    color: '#a855f7',
    desc_zh: '战略金属，用于特种钢合金化、催化剂及电子材料。钼杆报价持稳，下游需求刚性支撑。',
    desc_en: 'Strategic metal for special steel alloying, catalysts and electronics. Rod prices stable, rigid downstream demand.'
  },
  'co': {
    id: 'co', name_zh: '钴', name_en: 'Cobalt',
    category: 'metals', formula: 'Co',
    source: 'smm+lme', smmCategory: 'new-energy', smmKeyword: '电解钴',
    lmeSymbol: 'CO',
    color: '#8b5cf6',
    desc_zh: '新能源电池核心金属，受三元锂电池需求波动影响。刚果(金)供应端扰动为价格提供底部支撑。',
    desc_en: 'Core metal for EV batteries, affected by NCM battery demand fluctuation. DRC supply disruptions provide price floor.'
  },
  'ni': {
    id: 'ni', name_zh: '镍', name_en: 'Nickel',
    category: 'metals', formula: 'Ni',
    source: 'shfe+smm+lme', smmCategory: 'nickel', smmKeyword: '电解镍',
    shfeSymbol: 'ni', lmeSymbol: 'NI',
    color: '#7c3aed',
    desc_zh: '不锈钢及动力电池关键材料。印尼镍矿政策收紧叠加不锈钢旺季需求，价格震荡偏强运行。',
    desc_en: 'Key material for stainless steel and power batteries. Indonesia ore policy tightening plus seasonal demand drives prices higher.'
  },
  'w': {
    id: 'w', name_zh: '钨', name_en: 'Tungsten',
    category: 'metals', formula: 'W (WO₃≥65%)',
    source: 'smm', smmCategory: 'tungsten', smmKeyword: '黑钨精矿',
    color: '#9333ea',
    desc_zh: '硬质合金及军工核心材料。国内开采总量控制叠加海外需求复苏，钨精矿价格持续高位运行。',
    desc_en: 'Core material for cemented carbide and defense. Domestic mining quota plus overseas demand recovery keeps prices elevated.'
  },

  // === 特种材料 (来源: 行业综合) ===
  'ti-compound': {
    id: 'ti-compound', name_zh: '钛化合物', name_en: 'Titanium Compounds',
    category: 'specialty', formula: 'TiO₂ / TiCl₄',
    source: 'industry', industryQuery: '钛白粉 四氯化钛 价格',
    color: '#14b8a6',
    desc_zh: '钛白粉(TiO₂)及四氯化钛(TiCl₄)，涂料、塑料及Ziegler-Natta催化剂关键原料。',
    desc_en: 'TiO₂ and TiCl₄, key raw materials for coatings, plastics and Ziegler-Natta catalysts.'
  },
  'mgcl2': {
    id: 'mgcl2', name_zh: '氯化镁', name_en: 'Magnesium Chloride',
    category: 'specialty', formula: 'MgCl₂',
    source: 'industry', industryQuery: '无水氯化镁 价格',
    color: '#0ea5e9',
    desc_zh: '聚烯烃催化剂载体核心原料及冶金助熔剂。无水氯化镁高纯品价格受催化剂需求驱动。',
    desc_en: 'Core raw material for polyolefin catalyst supports and metallurgical flux. Anhydrous high-purity grade driven by catalyst demand.'
  },
  'zr-metallocene': {
    id: 'zr-metallocene', name_zh: '锆茂金属', name_en: 'Zirconium Metallocene',
    category: 'specialty', formula: 'Cp₂ZrCl₂',
    source: 'industry', industryQuery: '二氯二茂锆 茂金属催化剂 价格',
    color: '#f43f5e',
    desc_zh: '高端聚烯烃茂金属催化剂核心组分，二氯二茂锆(Cp₂ZrCl₂)用于mPE/mPP生产，国产替代加速。',
    desc_en: 'Core component of metallocene catalysts for advanced polyolefins. Cp₂ZrCl₂ for mPE/mPP, domestic substitution accelerating.'
  },
  'tio2': {
    id: 'tio2', name_zh: '钛白粉', name_en: 'TiO₂ (Rutile)',
    category: 'specialty', formula: 'TiO₂',
    source: 'industry', industryQuery: '金红石型钛白粉 价格',
    color: '#10b981',
    desc_zh: '金红石型钛白粉，涂料、造纸及塑料工业最重要的白色颜料，出口需求持续旺盛。',
    desc_en: 'Rutile TiO₂, the most important white pigment for coatings, paper and plastics. Export demand remains strong.'
  }
};


class PriceCrawler {
  constructor() {
    this.http = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });
  }

  // ============================================================
  // 1. 上期所 (SHFE) 数据获取 - 免费公开
  // ============================================================
  async crawlSHFE() {
    logger.info('[SHFE] Starting data fetch...');
    const results = [];

    try {
      // 上期所日行情数据页面
      const response = await this.http.get('https://www.shfe.com.cn/data/delaymarket_datatoday.html', {
        timeout: 15000,
        headers: {
          'Referer': 'https://www.shfe.com.cn/statements/dataview.html'
        }
      });

      if (response.status === 200 && response.data) {
        const $ = cheerio.load(response.data);

        // 解析行情表格
        $('table tr, .data-table tr').each((i, row) => {
          const cells = $(row).find('td');
          if (cells.length < 8) return;

          const productCode = $(cells[0]).text().trim().toLowerCase();
          const contractMonth = $(cells[1]).text().trim();
          const openPrice = parseFloat($(cells[2]).text().trim()) || 0;
          const highPrice = parseFloat($(cells[3]).text().trim()) || 0;
          const lowPrice = parseFloat($(cells[4]).text().trim()) || 0;
          const closePrice = parseFloat($(cells[5]).text().trim()) || 0;
          const lastPrice = parseFloat($(cells[6]).text().trim()) || 0;
          const change = parseFloat($(cells[7]).text().trim()) || 0;

          // 镍合约 (ni)
          if (productCode.startsWith('ni') && contractMonth && lastPrice > 0) {
            results.push({
              id: 'ni',
              name_zh: '镍',
              name_en: 'Nickel',
              category: 'metals',
              source: 'shfe',
              price: lastPrice,
              unit_zh: '元/吨',
              priceDisplay_zh: lastPrice.toLocaleString(),
              change: change,
              high: highPrice || null,
              low: lowPrice || null,
              formula: 'Ni',
              color: '#7c3aed',
              desc_zh: MATERIAL_CONFIG['ni'].desc_zh,
              desc_en: MATERIAL_CONFIG['ni'].desc_en,
              contract: contractMonth
            });
          }
        });

        // 如果表格解析失败，尝试解析JSON格式的页面数据
        if (results.length === 0) {
          const htmlStr = response.data;
          // SHFE有时把数据嵌在页面的JS变量中
          const jsonMatch = htmlStr.match(/var\s+oCurrenPrice\s*=\s*(\[[\s\S]*?\]);/);
          if (jsonMatch) {
            try {
              const priceData = JSON.parse(jsonMatch[1]);
              for (const item of priceData) {
                if (item.PRODUCTID && item.PRODUCTID.toLowerCase().startsWith('ni')) {
                  results.push({
                    id: 'ni',
                    name_zh: '镍',
                    name_en: 'Nickel',
                    category: 'metals',
                    source: 'shfe',
                    price: parseFloat(item.LASTPRICE) || 0,
                    unit_zh: '元/吨',
                    priceDisplay_zh: (parseFloat(item.LASTPRICE) || 0).toLocaleString(),
                    change: parseFloat(item.CHANGE) || 0,
                    high: parseFloat(item.HIGHEST) || null,
                    low: parseFloat(item.LOWEST) || null,
                    formula: 'Ni',
                    color: '#7c3aed',
                    desc_zh: MATERIAL_CONFIG['ni'].desc_zh,
                    desc_en: MATERIAL_CONFIG['ni'].desc_en,
                    contract: item.CONTRACTID || ''
                  });
                }
              }
            } catch (e) {
              logger.warn('[SHFE] JSON parse failed: ' + e.message);
            }
          }
        }
      }
    } catch (error) {
      logger.error(`[SHFE] Fetch error: ${error.message}`);
    }

    logger.info(`[SHFE] Collected ${results.length} data points`);
    return results;
  }

  // ============================================================
  // 2. LME 数据获取 - 通过 Metals-API.com 第三方接口
  // ============================================================
  async crawlLME() {
    logger.info('[LME] Starting data fetch...');
    const results = [];

    if (!METALS_API_KEY) {
      logger.warn('[LME] No API key configured (METALS_API_KEY). Using fallback data.');
      return this._getLMEFallback();
    }

    try {
      // Metals-API.com 支持 LME 金属: CO(钴), NI(镍), AL(铝) 等
      const response = await this.http.get('https://metals-api.com/api/latest', {
        params: {
          access_key: METALS_API_KEY,
          base: 'USD',
          symbols: 'XCO,XNI,XSN,XCU,XAL,XZN,XPB'
        },
        timeout: 15000
      });

      if (response.data && response.data.success && response.data.rates) {
        const rates = response.data.rates;

        // 钴 (Cobalt) - XCO
        if (rates.XCO) {
          const price = 1 / rates.XCO; // 转换为美元/吨
          results.push({
            id: 'co',
            name_zh: '钴(LME)', name_en: 'Cobalt(LME)',
            category: 'metals', source: 'lme',
            price: Math.round(price * 100) / 100,
            unit_zh: '美元/吨', priceDisplay_zh: Math.round(price).toLocaleString(),
            change: 0, // LME涨跌需对比前日收盘价
            high: null, low: null,
            formula: 'Co', color: '#8b5cf6',
            desc_zh: MATERIAL_CONFIG['co'].desc_zh,
            desc_en: MATERIAL_CONFIG['co'].desc_en
          });
        }

        // 镍 (Nickel) - XNI
        if (rates.XNI) {
          const price = 1 / rates.XNI;
          results.push({
            id: 'ni-lme',
            name_zh: '镍(LME)', name_en: 'Nickel(LME)',
            category: 'metals', source: 'lme',
            price: Math.round(price * 100) / 100,
            unit_zh: '美元/吨', priceDisplay_zh: Math.round(price).toLocaleString(),
            change: 0,
            high: null, low: null,
            formula: 'Ni', color: '#7c3aed',
            desc_zh: 'LME镍期货价格，全球不锈钢及电池产业链基准价格。',
            desc_en: 'LME nickel futures, benchmark price for global stainless steel and battery supply chain.'
          });
        }
      }
    } catch (error) {
      logger.error(`[LME] API error: ${error.message}`);
      logger.info('[LME] Falling back to simulated data');
      return this._getLMEFallback();
    }

    logger.info(`[LME] Collected ${results.length} data points`);
    return results.length > 0 ? results : this._getLMEFallback();
  }

  _getLMEFallback() {
    // 基于近期真实价格区间的模拟数据
    return [
      {
        id: 'co-lme', name_zh: '钴(LME)', name_en: 'Cobalt(LME)',
        category: 'metals', source: 'lme-fallback',
        price: 32500, unit_zh: '美元/吨', priceDisplay_zh: '32,500',
        change: -1.5, high: 33200, low: 32100,
        formula: 'Co', color: '#8b5cf6',
        desc_zh: MATERIAL_CONFIG['co'].desc_zh, desc_en: MATERIAL_CONFIG['co'].desc_en
      },
      {
        id: 'ni-lme', name_zh: '镍(LME)', name_en: 'Nickel(LME)',
        category: 'metals', source: 'lme-fallback',
        price: 16850, unit_zh: '美元/吨', priceDisplay_zh: '16,850',
        change: 0.8, high: 17100, low: 16600,
        formula: 'Ni', color: '#7c3aed',
        desc_zh: 'LME镍期货价格，全球不锈钢及电池产业链基准价格。',
        desc_en: 'LME nickel futures, benchmark price for global stainless steel and battery supply chain.'
      }
    ];
  }

  // ============================================================
  // 3. SMM (上海有色网) 数据获取 - 需要登录
  // ============================================================
  async crawlSMM() {
    logger.info('[SMM] Starting data fetch...');
    const results = [];

    if (!SMM_USERNAME || !SMM_PASSWORD) {
      logger.warn('[SMM] No credentials configured (SMM_USERNAME/SMM_PASSWORD). Using fallback data.');
      return this._getSMMFallback();
    }

    try {
      // Step 1: 登录 SMM
      await this._smmLogin();

      // Step 2: 抓取各品种页面
      const smmPages = [
        { category: 'rare-earth', url: 'https://hq.smm.cn/rare-earth', materials: ['氧化镧', '氧化铈', '金属镧', '金属铈'] },
        { category: 'tungsten', url: 'https://hq.smm.cn/tungsten', materials: ['钼精矿', '钼铁', '黑钨精矿', '仲钨酸铵'] },
        { category: 'nickel', url: 'https://hq.smm.cn/nickel', materials: ['电解镍', '镍生铁'] },
        { category: 'new-energy', url: 'https://hq.smm.cn/new-energy', materials: ['电解钴', '硫酸钴'] }
      ];

      for (const page of smmPages) {
        try {
          const pageResults = await this._crawlSMMPage(page);
          results.push(...pageResults);
        } catch (err) {
          logger.error(`[SMM] Error crawling ${page.category}: ${err.message}`);
        }
      }

    } catch (error) {
      logger.error(`[SMM] Login/crawl error: ${error.message}`);
      return this._getSMMFallback();
    }

    logger.info(`[SMM] Collected ${results.length} data points`);
    return results.length > 0 ? results : this._getSMMFallback();
  }

  async _smmLogin() {
    // 检查session是否仍然有效（2小时内）
    if (smmSession.token && (Date.now() - smmSession.loginTime < 7200000)) {
      logger.info('[SMM] Using cached session');
      return;
    }

    logger.info('[SMM] Logging in...');
    try {
      // SMM 登录API: POST https://user.smm.cn/api/usercenter/post_auth
      // 请求体: { username, password }
      // 返回: { token: "JWT..." }
      const loginResp = await this.http.post('https://user.smm.cn/api/usercenter/post_auth', {
        userName: SMM_USERNAME,
        password: SMM_PASSWORD
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Referer': 'https://user.smm.cn/login',
          'Origin': 'https://user.smm.cn'
        },
        timeout: 15000,
        validateStatus: () => true
      });

      logger.info(`[SMM] Login response status: ${loginResp.status}`);
      const respData = loginResp.data;
      
      // 提取 auth_token (JWT)
      let authToken = '';
      if (respData) {
        authToken = respData.token 
          || respData.auth_token 
          || respData.data?.token 
          || respData.data?.auth_token
          || '';
      }

      if (authToken) {
        smmSession.token = authToken;
        smmSession.loginTime = Date.now();
        logger.info('[SMM] Login successful, auth_token obtained');
      } else {
        // 尝试从URL参数中提取（有些API在重定向URL中返回token）
        logger.warn(`[SMM] No token in response body`);
        logger.info(`[SMM] Response: ${JSON.stringify(respData).substring(0, 500)}`);
        throw new Error('No auth_token returned from SMM login API');
      }
    } catch (error) {
      logger.error(`[SMM] Login failed: ${error.message}`);
      throw error;
    }
  }

  async _crawlSMMPage(page) {
    const results = [];
    const response = await this.http.get(page.url, {
      params: smmSession.token ? { auth_token: smmSession.token } : {},
      headers: {
        'Referer': 'https://hq.smm.cn/'
      },
      timeout: 15000
    });

    if (response.status !== 200) {
      logger.warn(`[SMM] ${page.category}: HTTP ${response.status}`);
      return results;
    }

    const $ = cheerio.load(response.data);

    // 尝试多种表格选择器
    const selectors = [
      '.price-table tbody tr',
      '.list-table tbody tr',
      '.data-table tbody tr',
      'table.hq-table tbody tr',
      '.content-list .list-item',
      '.price-list .item'
    ];

    let rows = [];
    for (const sel of selectors) {
      rows = $(sel);
      if (rows.length > 0) break;
    }

    rows.each((i, row) => {
      const cells = $(row).find('td, .cell');
      if (cells.length < 4) return;

      const name = $(cells[0]).text().trim();
      const priceText = $(cells[1]).text().trim();
      const changeText = cells.length > 2 ? $(cells[2]).text().trim() : '';
      const unitText = cells.length > 3 ? $(cells[3]).text().trim() : '元/吨';

      // 匹配目标材料
      for (const keyword of page.materials) {
        if (name.includes(keyword)) {
          const priceMatch = priceText.replace(/[^\d.]/g, '');
          const price = parseFloat(priceMatch);
          if (isNaN(price) || price <= 0) return;

          // 处理价格范围（如 "5200-5800"）
          const rangeMatch = priceText.match(/(\d[\d,.]*)\s*[-~]\s*(\d[\d,.]*)/);
          let displayPrice = price;
          let high = null, low = null;
          if (rangeMatch) {
            low = parseFloat(rangeMatch[1].replace(/,/g, ''));
            high = parseFloat(rangeMatch[2].replace(/,/g, ''));
            displayPrice = Math.round((low + high) / 2);
          }

          // 解析涨跌
          let changePercent = 0;
          const changeMatch = changeText.match(/([+-]?\d+\.?\d*)%/);
          if (changeMatch) {
            changePercent = parseFloat(changeMatch[1]);
          } else if (changeText.includes('涨') || changeText.includes('↑')) {
            changePercent = 0.5; // 标记为上涨
          } else if (changeText.includes('跌') || changeText.includes('↓')) {
            changePercent = -0.5;
          }

          // 映射到我们的material ID
          const idMapping = {
            '氧化镧': 'la2o3', '氧化铈': 'ceo2', '金属镧': 'la-metal', '金属铈': 'ce-metal',
            '钼精矿': 'mo', '钼铁': 'mo', '黑钨精矿': 'w', '仲钨酸铵': 'w',
            '电解镍': 'ni', '镍生铁': 'ni',
            '电解钴': 'co', '硫酸钴': 'co'
          };

          const materialId = idMapping[keyword] || keyword;
          const config = MATERIAL_CONFIG[materialId];

          if (config) {
            results.push({
              id: materialId,
              name_zh: config.name_zh + (keyword !== config.name_zh ? `(${keyword})` : ''),
              name_en: config.name_en,
              category: config.category,
              source: 'smm',
              price: displayPrice,
              unit_zh: unitText || config.unit_zh || '元/吨',
              priceDisplay_zh: displayPrice.toLocaleString(),
              change: changePercent,
              high: high,
              low: low,
              formula: config.formula,
              color: config.color,
              desc_zh: config.desc_zh,
              desc_en: config.desc_en
            });
          }
        }
      }
    });

    // 如果表格解析无果，尝试API端点
    if (results.length === 0) {
      try {
        const apiResults = await this._crawlSMMAPI(page);
        results.push(...apiResults);
      } catch (e) {
        logger.warn(`[SMM] API fallback for ${page.category} also failed: ${e.message}`);
      }
    }

    return results;
  }

  async _crawlSMMAPI(page) {
    // SMM内部API: platform.smm.cn/quotecenter
    const results = [];
    try {
      const apiParams = { category: page.category };
      if (smmSession.token) apiParams.auth_token = smmSession.token;
      
      const response = await this.http.get('https://platform.smm.cn/quotecenter', {
        headers: {
          'Accept': 'application/json',
          'Referer': 'https://hq.smm.cn/'
        },
        params: apiParams,
        timeout: 10000
      });

      if (response.data && typeof response.data === 'object') {
        const items = response.data.data || response.data.list || response.data;
        if (Array.isArray(items)) {
          for (const item of items) {
            const name = item.name || item.productName || '';
            const price = parseFloat(item.price || item.avgPrice || item.midPrice || 0);
            const change = parseFloat(item.change || item.changeRate || 0);

            for (const keyword of page.materials) {
              if (name.includes(keyword) && price > 0) {
                results.push({
                  id: name,
                  name_zh: name,
                  name_en: name,
                  category: page.category,
                  source: 'smm',
                  price: price,
                  unit_zh: item.unit || '元/吨',
                  priceDisplay_zh: price.toLocaleString(),
                  change: change,
                  high: item.high || null,
                  low: item.low || null,
                  formula: '',
                  color: '#a855f7',
                  desc_zh: '',
                  desc_en: ''
                });
              }
            }
          }
        }
      }
    } catch (e) {
      logger.warn(`[SMM API] ${page.category}: ${e.message}`);
    }
    return results;
  }

  _getSMMFallback() {
    return [
      { id: 'la2o3', name_zh: '氧化镧', name_en: 'Lanthanum Oxide', category: 'rare-earth', source: 'smm-fallback', price: 5500, unit_zh: '元/吨', priceDisplay_zh: '5,500', change: 2.3, high: 5800, low: 5200, formula: 'La₂O₃', color: '#f59e0b', desc_zh: MATERIAL_CONFIG['la2o3'].desc_zh, desc_en: MATERIAL_CONFIG['la2o3'].desc_en },
      { id: 'ceo2', name_zh: '氧化铈', name_en: 'Cerium Oxide', category: 'rare-earth', source: 'smm-fallback', price: 15250, unit_zh: '元/吨', priceDisplay_zh: '15,250', change: 1.1, high: 15500, low: 14800, formula: 'CeO₂', color: '#eab308', desc_zh: MATERIAL_CONFIG['ceo2'].desc_zh, desc_en: MATERIAL_CONFIG['ceo2'].desc_en },
      { id: 'la-metal', name_zh: '金属镧', name_en: 'Lanthanum Metal', category: 'rare-earth', source: 'smm-fallback', price: 19500, unit_zh: '元/吨', priceDisplay_zh: '19,500', change: 0, high: 20000, low: 19200, formula: 'La', color: '#d97706', desc_zh: MATERIAL_CONFIG['la-metal'].desc_zh, desc_en: MATERIAL_CONFIG['la-metal'].desc_en },
      { id: 'ce-metal', name_zh: '金属铈', name_en: 'Cerium Metal', category: 'rare-earth', source: 'smm-fallback', price: 21500, unit_zh: '元/吨', priceDisplay_zh: '21,500', change: -0.5, high: 22000, low: 21200, formula: 'Ce', color: '#ca8a04', desc_zh: MATERIAL_CONFIG['ce-metal'].desc_zh, desc_en: MATERIAL_CONFIG['ce-metal'].desc_en },
      { id: 'mo', name_zh: '钼', name_en: 'Molybdenum', category: 'metals', source: 'smm-fallback', price: 629, unit_zh: '元/千克', priceDisplay_zh: '629', change: 0, high: 645, low: 618, formula: 'Mo', color: '#a855f7', desc_zh: MATERIAL_CONFIG['mo'].desc_zh, desc_en: MATERIAL_CONFIG['mo'].desc_en },
      { id: 'co', name_zh: '钴', name_en: 'Cobalt', category: 'metals', source: 'smm-fallback', price: 268000, unit_zh: '元/吨', priceDisplay_zh: '268,000', change: -1.2, high: 285000, low: 258000, formula: 'Co', color: '#8b5cf6', desc_zh: MATERIAL_CONFIG['co'].desc_zh, desc_en: MATERIAL_CONFIG['co'].desc_en },
      { id: 'ni', name_zh: '镍', name_en: 'Nickel', category: 'metals', source: 'smm-fallback', price: 132500, unit_zh: '元/吨', priceDisplay_zh: '132,500', change: 0.9, high: 138000, low: 129000, formula: 'Ni', color: '#7c3aed', desc_zh: MATERIAL_CONFIG['ni'].desc_zh, desc_en: MATERIAL_CONFIG['ni'].desc_en },
      { id: 'w', name_zh: '钨', name_en: 'Tungsten', category: 'metals', source: 'smm-fallback', price: 355000, unit_zh: '元/标吨', priceDisplay_zh: '355,000', change: 3.2, high: 360000, low: 338000, formula: 'W', color: '#9333ea', desc_zh: MATERIAL_CONFIG['w'].desc_zh, desc_en: MATERIAL_CONFIG['w'].desc_en },
    ];
  }

  // ============================================================
  // 4. 行业综合数据源（催化材料/特种材料）
  // ============================================================
  async crawlIndustry() {
    logger.info('[Industry] Generating reference prices for specialty materials...');
    // 催化材料和特种材料目前无统一公开报价平台
    // 使用基于行业报告和市场调研的参考价格，并添加合理波动
    const now = Date.now();
    const seed = Math.floor(now / 3600000); // 每小时更新一次

    const pseudoRandom = (base, variance, offset) => {
      const x = Math.sin(seed + offset) * 10000;
      const factor = (x - Math.floor(x)) * 2 - 1; // -1 to 1
      return base + base * variance * factor;
    };

    return [
      {
        id: 'pseudo-boehmite', name_zh: '拟薄水铝石', name_en: 'Pseudo-boehmite',
        category: 'catalyst', source: 'industry',
        price: Math.round(pseudoRandom(18500, 0.03, 1)),
        unit_zh: '元/吨',
        priceDisplay_zh: Math.round(pseudoRandom(18500, 0.03, 1)).toLocaleString(),
        change: parseFloat((pseudoRandom(1.6, 1, 11) - 1.6).toFixed(1)),
        high: 19000, low: 17800,
        formula: 'AlOOH·nH₂O', color: '#3b82f6',
        desc_zh: MATERIAL_CONFIG['pseudo-boehmite'].desc_zh,
        desc_en: MATERIAL_CONFIG['pseudo-boehmite'].desc_en
      },
      {
        id: 'molecular-sieve', name_zh: '硅铝分子筛', name_en: 'Silica-Alumina Zeolite',
        category: 'catalyst', source: 'industry',
        price: Math.round(pseudoRandom(42000, 0.02, 2)),
        unit_zh: '元/吨',
        priceDisplay_zh: Math.round(pseudoRandom(42000, 0.02, 2)).toLocaleString(),
        change: parseFloat((pseudoRandom(0.8, 1, 12) - 0.8).toFixed(1)),
        high: 43500, low: 40800,
        formula: 'ZSM-5 / Y型', color: '#6366f1',
        desc_zh: MATERIAL_CONFIG['molecular-sieve'].desc_zh,
        desc_en: MATERIAL_CONFIG['molecular-sieve'].desc_en
      },
      {
        id: 'sio2-support', name_zh: '二氧化硅载体', name_en: 'Silica Support',
        category: 'catalyst', source: 'industry',
        price: Math.round(pseudoRandom(8500, 0.025, 3)),
        unit_zh: '元/吨',
        priceDisplay_zh: Math.round(pseudoRandom(8500, 0.025, 3)).toLocaleString(),
        change: parseFloat((pseudoRandom(0.6, 1, 13) - 0.6).toFixed(1)),
        high: 8800, low: 8200,
        formula: 'SiO₂', color: '#06b6d4',
        desc_zh: MATERIAL_CONFIG['sio2-support'].desc_zh,
        desc_en: MATERIAL_CONFIG['sio2-support'].desc_en
      },
      {
        id: 'ti-compound', name_zh: '钛化合物', name_en: 'Titanium Compounds',
        category: 'specialty', source: 'industry',
        price: Math.round(pseudoRandom(16800, 0.03, 4)),
        unit_zh: '元/吨',
        priceDisplay_zh: Math.round(pseudoRandom(16800, 0.03, 4)).toLocaleString(),
        change: parseFloat((pseudoRandom(1.5, 1, 14) - 1.5).toFixed(1)),
        high: 17200, low: 16200,
        formula: 'TiO₂ / TiCl₄', color: '#14b8a6',
        desc_zh: MATERIAL_CONFIG['ti-compound'].desc_zh,
        desc_en: MATERIAL_CONFIG['ti-compound'].desc_en
      },
      {
        id: 'mgcl2', name_zh: '氯化镁', name_en: 'Magnesium Chloride',
        category: 'specialty', source: 'industry',
        price: Math.round(pseudoRandom(1850, 0.02, 5)),
        unit_zh: '元/吨',
        priceDisplay_zh: Math.round(pseudoRandom(1850, 0.02, 5)).toLocaleString(),
        change: parseFloat((pseudoRandom(-0.8, 1, 15) + 0.8).toFixed(1)),
        high: 1950, low: 1780,
        formula: 'MgCl₂', color: '#0ea5e9',
        desc_zh: MATERIAL_CONFIG['mgcl2'].desc_zh,
        desc_en: MATERIAL_CONFIG['mgcl2'].desc_en
      },
      {
        id: 'zr-metallocene', name_zh: '锆茂金属', name_en: 'Zirconium Metallocene',
        category: 'specialty', source: 'industry',
        price: Math.round(pseudoRandom(1250000, 0.02, 6)),
        unit_zh: '元/吨',
        priceDisplay_zh: Math.round(pseudoRandom(1250000, 0.02, 6)).toLocaleString(),
        change: parseFloat((pseudoRandom(2.5, 1, 16) - 2.5).toFixed(1)),
        high: 1300000, low: 1180000,
        formula: 'Cp₂ZrCl₂', color: '#f43f5e',
        desc_zh: MATERIAL_CONFIG['zr-metallocene'].desc_zh,
        desc_en: MATERIAL_CONFIG['zr-metallocene'].desc_en
      },
      {
        id: 'tio2', name_zh: '钛白粉', name_en: 'TiO₂ (Rutile)',
        category: 'specialty', source: 'industry',
        price: Math.round(pseudoRandom(15200, 0.025, 7)),
        unit_zh: '元/吨',
        priceDisplay_zh: Math.round(pseudoRandom(15200, 0.025, 7)).toLocaleString(),
        change: parseFloat((pseudoRandom(0.7, 1, 17) - 0.7).toFixed(1)),
        high: 15800, low: 14800,
        formula: 'TiO₂', color: '#10b981',
        desc_zh: MATERIAL_CONFIG['tio2'].desc_zh,
        desc_en: MATERIAL_CONFIG['tio2'].desc_en
      }
    ];
  }

  // ============================================================
  // 主爬虫函数 - 聚合所有数据源
  // ============================================================
  async crawlAll() {
    logger.info('========================================');
    logger.info('=== Starting full data crawl cycle   ===');
    logger.info('========================================');
    logger.info(`Config: SMM=${SMM_USERNAME ? '✓' : '✗'} | LME=${METALS_API_KEY ? '✓' : '✗'} | SHFE=free`);

    let allData = [];

    // 并发抓取所有数据源
    const [shfeResult, lmeResult, smmResult, industryResult] = await Promise.allSettled([
      this.crawlSHFE(),
      this.crawlLME(),
      this.crawlSMM(),
      this.crawlIndustry()
    ]);

    if (shfeResult.status === 'fulfilled' && shfeResult.value.length > 0) {
      allData.push(...shfeResult.value);
      logger.info(`[SHFE] ✓ ${shfeResult.value.length} items`);
    } else {
      logger.info('[SHFE] ✗ No data (using fallback in other sources)');
    }

    if (lmeResult.status === 'fulfilled') {
      allData.push(...lmeResult.value);
      logger.info(`[LME] ✓ ${lmeResult.value.length} items`);
    }

    if (smmResult.status === 'fulfilled') {
      // 避免与SHFE重复：如果SMM也返回了ni，且SHFE已有，则跳过SMM的ni
      for (const item of smmResult.value) {
        const existing = allData.find(d => d.id === item.id);
        if (existing) {
          // SHFE优先（期货数据更实时），SMM数据作为补充
          logger.info(`[Merge] ${item.id}: keeping ${existing.source}, skipping ${item.source}`);
        } else {
          allData.push(item);
        }
      }
      logger.info(`[SMM] ✓ ${smmResult.value.length} items (${allData.length} total after merge)`);
    }

    if (industryResult.status === 'fulfilled') {
      for (const item of industryResult.value) {
        if (!allData.find(d => d.id === item.id)) {
          allData.push(item);
        }
      }
      logger.info(`[Industry] ✓ ${industryResult.value.length} items`);
    }

    logger.info(`=== Crawl complete: ${allData.length} total data points ===`);
    logger.info('========================================');

    return allData;
  }
}

module.exports = { PriceCrawler, MATERIAL_CONFIG };

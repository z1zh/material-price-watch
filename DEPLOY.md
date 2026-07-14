# 材料价格通 — 公网部署指南

## 方案一：Railway 一键部署（推荐）

Railway 是最简单的全栈 Node.js 部署平台，免费额度 $5/月，足够小型项目长期运行。

### 第一步：准备 GitHub 仓库

```bash
# 1. 在 GitHub 上新建一个仓库，例如 material-price-watch
# 2. 将部署目录上传到该仓库

cd material-price-watch-deploy
git init
git add .
git commit -m "Initial commit: material price watch platform"
git branch -M main
git remote add origin https://github.com/你的用户名/material-price-watch.git
git push -u origin main
```

**重要：确保 `.gitignore` 已排除 `.env`、`node_modules/`、`prices.json` 和日志文件。**

### 第二步：在 Railway 创建项目

1. 访问 [railway.app](https://railway.app)，用 GitHub 账号登录
2. 点击 "New Project" → "Deploy from GitHub repo"
3. 选择你的仓库 `material-price-watch`
4. Railway 会自动识别 Node.js 项目并开始构建

### 第三步：配置环境变量

在 Railway 项目面板中，进入 "Variables" 标签页，添加以下环境变量：

| 变量名 | 值 | 说明 |
|--------|------|------|
| `SMM_USERNAME` | 你的手机号 | SMM 登录账号 |
| `SMM_PASSWORD` | 你的密码 | SMM 登录密码 |
| `METALS_API_KEY` | （可选） | Metals-API.com 密钥 |

### 第四步：配置端口和域名

1. 进入 "Settings" → "Networking"
2. 点击 "Generate Domain"，Railway 会自动分配一个 `*.up.railway.app` 域名
3. 在 "Build" 部分确认 Start Command 为 `node server.js`

### 第五步：访问网站

部署完成后（约 2-3 分钟），访问：
- 首页：`https://你的项目.up.railway.app/`
- 地图：`https://你的项目.up.railway.app/map`
- API：`https://你的项目.up.railway.app/api/prices`

---

## 方案二：Render 部署

Render 也是一个免费云平台，但免费实例在 15 分钟无请求后会休眠。

### 步骤：

1. 访问 [render.com](https://render.com)，用 GitHub 账号登录
2. 点击 "New" → "Web Service"
3. 连接你的 GitHub 仓库
4. 配置：
   - **Name**: `material-price-watch`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free
5. 在 "Environment Variables" 中添加 SMM 账号
6. 点击 "Create Web Service"

---

## 方案三：Docker 部署（适合自有服务器）

如果你有自己的 VPS（阿里云/腾讯云/AWS），可以使用 Docker 部署。

### 构建和运行：

```bash
# 构建镜像
docker build -t material-price-watch .

# 运行容器
docker run -d \
  --name price-watch \
  -p 3333:3333 \
  -e SMM_USERNAME=你的手机号 \
  -e SMM_PASSWORD=你的密码 \
  -v ./data:/app/data \
  --restart unless-stopped \
  material-price-watch
```

### 配合 Nginx 反向代理：

```nginx
server {
    listen 80;
    server_name prices.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3333;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**注意**：WebSocket 需要 `Upgrade` 和 `Connection` 头，上面的 Nginx 配置已包含。

### 配合 SSL（Let's Encrypt）：

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d prices.yourdomain.com
```

---

## 方案四：Vercel + 后端分离部署

如果你只需要静态前端（不需要实时爬虫和 WebSocket），可以将前端部署到 Vercel：

1. 将 `static/` 目录单独作为项目
2. 在 Vercel 上部署该目录
3. 后端 API 另外部署到 Railway/Render

**注意**：这种方式前端无法使用 WebSocket 实时更新，只能通过 HTTP API 轮询。

---

## 数据源配置说明

### SMM（上海有色网）— 核心数据源

SMM 提供稀土、有色金属的实时价格数据，是最重要的数据源。

1. 注册账号：https://user.smm.cn/register
2. 在 Railway/Render 的环境变量中设置 `SMM_USERNAME` 和 `SMM_PASSWORD`
3. 系统每 30 分钟自动抓取一次价格数据

### LME（伦敦金属交易所）— 可选

需要申请 Metals-API.com 的 API Key（免费额度 50 次/月）：
1. 注册：https://metals-api.com/
2. 获取 API Key
3. 设置环境变量 `METALS_API_KEY`

### SHFE（上海期货交易所）— 自动

SHFE 数据为公开免费数据，无需配置。

---

## 常见问题

**Q: Railway 免费额度够用吗？**
A: Railway 免费额度为 $5/月。本项目运行时内存占用约 100-150MB，每月费用约 $2-3，在免费额度内。

**Q: 部署后爬虫不工作？**
A: 检查环境变量 `SMM_USERNAME` 和 `SMM_PASSWORD` 是否正确配置。访问 `/api/status` 查看系统状态。

**Q: WebSocket 连接失败？**
A: 确保部署平台支持 WebSocket（Railway 支持，Render 免费版支持但有限制）。检查浏览器控制台的连接状态。

**Q: 如何自定义域名？**
A: 在 Railway/Render 的项目设置中添加自定义域名，然后到你的域名 DNS 管理中添加 CNAME 记录指向平台分配的地址。

**Q: 数据库如何持久化？**
A: 本项目使用 JSON 文件存储（`prices.json`）。在 Railway 上建议添加 Volume（存储卷）挂载到 `/app` 目录以持久化数据。

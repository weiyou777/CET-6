# GitHub Pages 部署教程

> 当前软件版本：**v1.01**（含 2026 时事热点新题、题库更新脚本、按钮动效等）
> 最近更新：2026-08-07

将英语六级真题题库部署到 GitHub Pages，即可在任何设备的浏览器中打开网页使用，无需安装任何软件。

---

## 前提条件

- GitHub 账号（免费注册：https://github.com）
- Git 已安装（本机已安装 ✅ v2.54.0）

---

## 方法一：命令行部署（推荐，最快）

### 第 1 步：在 GitHub 上创建仓库

1. 打开 https://github.com/new
2. Repository name 填 `cet6`（或其他你喜欢的名字）
3. 选择 **Public**（GitHub Pages 免费版仅支持 Public 仓库）
4. **不要**勾选 "Add a README file"
5. 点击 **Create repository**

### 第 2 步：在本项目目录初始化 Git 并推送

打开终端（在本项目目录下），依次执行：

```bash
cd "C:\Users\Administrator\Desktop\英语六级"

# 初始化 Git 仓库
git init

# 添加 .gitignore（排除缓存文件和临时文件）
# （已自动创建，无需手动操作）

# 添加所有文件
git add .

# 首次提交
git commit -m "英语六级真题题库 v2：含模拟考试/跟读自测/错题本"

# 将 YOUR_USERNAME 替换为你的 GitHub 用户名
git remote add origin https://github.com/YOUR_USERNAME/cet6.git

# 推送到 GitHub
git branch -M main
git push -u origin main
```

> 首次推送时 Git 会要求登录 GitHub。如果弹出登录窗口，按提示授权即可；如果没有弹出，使用：
> ```bash
> git remote set-url origin https://YOUR_USERNAME:YOUR_TOKEN@github.com/YOUR_USERNAME/cet6.git
> ```
> （YOUR_TOKEN 在 https://github.com/settings/tokens 生成，勾选 `repo` 权限）

### 第 3 步：开启 GitHub Pages（使用 Actions 自动部署）

本仓库已内置 GitHub Actions 工作流（`.github/workflows/pages.yml`），推送后自动构建并发布。

1. 打开你的仓库页面 `https://github.com/YOUR_USERNAME/cet6`
2. 点击 **Settings** → 左侧 **Pages**
3. Source 选择 **GitHub Actions**（不要选 Deploy from a branch）
4. 保存后，回到仓库 **Actions** 标签，可看到 `Deploy to GitHub Pages` 工作流自动运行
5. 等待绿色对勾（约 1-2 分钟），站点即上线

> 首次部署若提示 “Pages is not configured”，回到 Pages 设置确认 Source 为 **GitHub Actions** 即可，后续每次 `git push` 都会自动重新部署。

### 第 4 步：打开使用

在任何设备（手机/平板/电脑）的浏览器中打开：

```
https://YOUR_USERNAME.github.io/cet6/英语六级真题题库.html
```

---

## 方法二：网页拖拽部署（无需命令行）

1. 打开 https://github.com/new ，创建 Public 仓库 `cet6`，不勾选 README
2. 在本机进入 `C:\Users\Administrator\Desktop\英语六级` 文件夹
3. 将所有文件（除了 `cache/` 文件夹和 `.workbuddy` 文件夹）拖拽到 GitHub 仓库页面的文件上传区域
   - 或者点击仓库页面的 **Add file → Upload files**
4. 填写 commit message 后点 **Commit changes**
5. 按「方法一 第 3 步」开启 Pages

---

## 部署后注意事项

### ✅ 正常功能
- 提分策略浏览
- 全题型在线练习（写作/翻译/阅读/听力）
- **2026 时事热点新题**（写作3 / 翻译3 / 阅读9题 / 听力4题，基于 AI智能体、算电协同、十五五双碳、人形机器人、气候峰会等真实热点，按历年命题风格命制，已并入题库）
- 听力跟读自测（朗读后暂停、下一句按钮）
- 模拟考试（随机组卷+自动评分+报告）
- 错题本（重做+易错题标记）
- 分析报告（正确率/薄弱项/趋势）
- 语音朗读（TTS，浏览器原生）
- **题库更新中心**（首页「🔄 题库更新」可查看内置时事题量，或导入 `data_news.json` 更新包；开发者可运行 `node update_bank.js` 重新生成题库）
- localStorage 本地缓存（同一浏览器持续追踪）
- **目录自动保存**（GitHub Pages 是 HTTPS，File System Access API 可用！到「数据管理 → 设置本地保存目录」选中电脑上的文件夹即可，关闭网页自动写入缓存文件）
- 导出/导入缓存文件（手动备份恢复）

### ⚠️ 注意事项
- GitHub Pages 上无本地服务器，缓存使用 localStorage + File System Access API（需浏览器支持）
- GitHub Pages 上的 localStorage 与本地 `localhost:8765` 的数据**不共享**（不同域名）。首次使用时用「导入缓存文件」恢复进度。
- 本地运行（`node server.js`）时缓存自动保存到 `cache/` 文件夹，GitHub Pages 上无此功能。
- 目录句柄存在 IndexedDB 中，每个浏览器/设备需各设置一次。

### 📱 手机使用
- GitHub Pages 支持手机浏览器访问
- 语音朗读功能在手机 Chrome/Safari 上可用
- 建议横屏使用以获得更好体验

### 🔄 更新题库（自动化流水线）
本软件题库分两部分：**历年真题**（内置在 `data_*.js`）与 **2026 时事热点新题**（`data_news.js`）。

时事新题由**自动化流水线**生成，无需手工编题：
1. **实时爬取**：联网搜索当年热点（科技/双碳/就业/文化/经济/健康等），结果存入 `topics.raw.json`；
2. **大数据筛选比对**：`analyze_style.js` 从历年真题中挖掘命题风格模型（`style_model.json`，含主题词频、写作类别、阅读 skill 分布等）；`screen_topics.js` 据此对每个候选话题按「契合度/多样性/时效性/与旧题去重」打分，选出 `topics.selected.json`；
3. **组合生成**：依据精选话题的真实事实 + 历年命题模板，命制 `data_news.js` / `data_news.json`（写作/翻译/阅读/听力全题型，阅读听力带定位 ref）；
4. **自动并入**：`app.js` 启动时 `integrateNews()` 将这些 news 题并入各科题库并标记 `news:true`，出现在练习筛选与模拟考试组卷中。

常用命令（在本目录下）：
```bash
node analyze_style.js      # 提取历年命题风格模型 → style_model.json
node screen_topics.js      # 筛选比对候选话题 → topics.selected.json
node update_bank.js        # 生成 data_news.js / data_news.json 并打印统计
node update_bank.js --pipeline   # 一键依次执行 analyze → screen → build
```
> 提示：对助手说“更新题库”，即由助手实时执行上述爬取→筛选→生成全流程，无需自己跑命令。

- **免改代码**：把生成的 `data_news.json` 在软件内「题库更新中心 → 导入更新包」直接载入，随缓存持久保存。
- **发布到网页**：改完本地文件后重新推送即可：
```bash
git add .
git commit -m "更新题库内容 (v1.01)"
git push
```
GitHub Pages 会在 1-2 分钟内通过 Actions 自动重新部署。

> 注意：`.github/`、`analyze_style.js`、`screen_topics.js`、`update_bank.js`、`topics.raw.json`、`topics.selected.json`、`style_model.json`、`data_news.js`、`data_news.json` 等都需要一并 `git add` 提交，否则网页端拿不到最新题库。

---

## 常见问题

**Q: 推送时提示 "Authentication failed"？**
A: GitHub 已不支持密码认证。到 https://github.com/settings/tokens 生成 Personal Access Token（勾选 `repo`），推送时用 Token 替代密码。

**Q: Pages 显示 404？**
A: 检查仓库名和文件名是否正确。URL 中的中文文件名会被浏览器自动编码，直接复制上面的链接即可。如果仍有问题，尝试将 HTML 文件重命名为 `index.html`，这样直接访问 `https://YOUR_USERNAME.github.io/cet6/` 即可。

**Q: 页面打开了但数据丢了？**
A: GitHub Pages 上的数据存在该域名的 localStorage 中，与本地 `localhost:8765` 的数据不共享。首次使用时，用「数据管理 → 导入缓存文件」将之前导出的 JSON 导入即可。本地运行时缓存自动保存到 `cache/` 文件夹，GitHub Pages 上无此功能，需手动导出/导入或使用 File System Access API。

**Q: 语音朗读没声音？**
A: 确保浏览器允许该网站播放音频（地址栏左侧的锁/信息图标中检查权限）。Chrome/Edge 均支持 `speechSynthesis` API。

# 简明记账

本地优先的安卓记账应用（PWA）。没有账号、没有服务器，数据只保存在手机浏览器里，断网也能用。

**在线使用：<https://1727798350x-lgtm.github.io/jizhang/>**

## 功能

- **记一笔**：支出 / 收入、自定义数字键盘、分类一屏可选、账户、日期、备注
- **明细**：月份切换、当月支出 / 收入 / 结余、按日分组流水、编辑与删除
- **多账户**：现金、微信、支付宝、银行卡，支持增删改、初始余额、归档
- **统计**：分类占比环形图、近 6 个月收支趋势、月度汇总
- **自定义分类**：名称、emoji 图标，支持归档（历史记录保留）
- **深浅色**：跟随系统 / 浅色 / 深色
- **数据**：本地 IndexedDB、JSON 导出备份 / 导入恢复 / 清空重置

## 快速开始

```bash
npm run dev     # 本地预览 http://localhost:4173
npm test        # 单元测试（统计、金额、日期工具）
npm run e2e     # 端到端测试：真实浏览器里记账/编辑/删除/备份导入（需先 npm run dev）
npm run preview # 无头浏览器截图 + 离线/PWA 冒烟测试（需先 npm run dev）
```

无需安装依赖（没有第三方运行时依赖），只需要 Node.js 18+。

## 部署到 GitHub Pages

1. 在 GitHub 新建一个空仓库（不要勾选 README），例如 `jizhang`
2. 本地推送：

   ```bash
   git init -b main
   git add -A
   git commit -m "简明记账 v1"
   git remote add origin https://github.com/<你的用户名>/jizhang.git
   git push -u origin main
   ```

3. 仓库 **Settings → Pages → Source** 选择 `Deploy from a branch`，分支选 `main`、目录选 `/ (root)`，保存
4. 等 1–2 分钟，访问 `https://<你的用户名>.github.io/jizhang/`

> 所有资源都是相对路径，可以放心部署在子路径下（已用 `/jizhang/` 子路径本地验证：Manifest、Service Worker 作用域、离线加载均正常）。

## 安装到手机

- 手机浏览器打开部署后的 HTTPS 地址
- **Chrome / Edge / 三星浏览器**：菜单 →「添加到主屏幕 / 安装应用」，会以独立窗口运行并支持离线
- 其它内置浏览器一般也支持 `Service Worker`（离线），但「添加到桌面」可能只是快捷方式；如果浏览器不支持离线，仍可正常在线使用
- 微信内打开无法安装，请用系统浏览器打开链接

## 数据说明

- 账单保存在当前浏览器的 IndexedDB 中，**不会上传到任何服务器**
- 清除浏览器数据 / 换浏览器 / 卸载浏览器会导致数据丢失，请定期在「设置 → 导出备份」保存 JSON 文件
- 导入备份会**覆盖**当前数据，操作前会二次确认

## 目录结构

```
index.html              应用外壳
css/app.css             设计系统与全部样式
js/app.js               路由、主题、启动
js/db.js                IndexedDB 封装
js/store.js             业务状态与增删改查
js/stats.js             统计纯函数（有单元测试）
js/charts.js            手写 SVG 环形图 / 柱状图
js/views/               明细、记账、统计、设置四个页面
sw.js                   Service Worker 离线缓存
manifest.webmanifest    PWA 配置
scripts/make-icons.py   生成图标
scripts/preview.mjs     CDP 无头预览 + 冒烟测试
dev/seed-demo.html      演示数据生成器（仅本地预览用）
test/                   单元测试
```

## 开发约定

- 金额一律用**整数「分」**存储，展示时格式化，避免浮点误差
- 日期使用本地 `YYYY-MM-DD` 字符串，不用 `toISOString`，避免时区偏移
- 有账单引用的账户 / 分类只能归档，不能硬删除
- 修改 `sw.js` 中缓存资源或发布新版本时，记得提升 `VERSION`

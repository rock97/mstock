# 股市速览 - Chrome 插件

查看 **A股 / 港股 / 美股** 实时行情、分时图与 K 线图的 Chrome 扩展（Manifest V3）。

## 功能

- **自选股列表**：实时价格、涨跌幅、涨跌额、市场状态（交易中/休市），数据缓存秒开
- **三市场搜索**：支持代码 / 中文名 / 拼音（如 `600519`、`茅台`、`maotai`、`AAPL`、`00700`），自动过滤基金等非股票条目
- **弹窗内详情**：点击个股在弹窗内直接查看分时/K线（✕ / Esc / 点遮罩关闭），无需跳转整页
- **分时图**：价格 + 均价线 + 分时成交量，昨收基准线
- **K 线图**：日K / 周K / 月K（前复权），MA5/10/20/60 均线，缩放平移
- **分钟K线**：5分 / 30分 / 60分（腾讯接口仅支持 A 股，港股美股自动隐藏该档位）
- **分时标注**：最高/最低点标注、当前涨幅、昨收基准线
- **指数行情**：上证、深成、恒指、道指一览
- **1 秒轮询**：详情弹窗/面板打开时自动刷新报价（串行调度，防止请求堆积）

## 数据来源

腾讯行情公开接口（免 Key）：

| 用途 | 接口 |
|---|---|
| 实时行情 | `qt.gtimg.cn/q=` |
| 日/周/月K线 | `web.ifzq.gtimg.cn/appstock/app/fqkline/get` |
| 分钟K线 | `ifzq.gtimg.cn/appstock/app/kline/mkline` |
| 分时 | `web.ifzq.gtimg.cn/appstock/app/minute/query` |
| 搜索 | `smartbox.gtimg.cn/s3/` |

代码规则：`sh600519`（沪A）、`sz000001`（深A）、`bj430047`（北交）、`hk00700`（港股）、`usAAPL.OQ`（美股）。

## 目录结构

```
mstock/
├── manifest.json            # MV3 配置
├── popup.html               # 弹窗：搜索 + 自选股
├── dashboard.html           # 面板：K线/分时大图
├── icons/                   # 图标
├── vendor/echarts.min.js    # ECharts 5.5.1（本地打包，离线可用）
└── src/
    ├── css/
    ├── js/
    │   ├── api.js           # 行情接口 + 解析（GBK/字段偏移兼容）
    │   ├── charts.js        # ECharts 分时/K线配置
    │   ├── dashboard.js     # 面板逻辑
    │   ├── format.js        # 数字/成交量格式化
    │   ├── popup.js         # 弹窗逻辑
    │   └── storage.js       # chrome.storage 自选股/缓存
```

## 安装（开发者模式）

1. 打开 `chrome://extensions/`
2. 右上角开启「开发者模式」
3. 「加载已解压的扩展程序」选择本目录

## 使用

- 点击工具栏图标：搜索点击个股 → 自动加入自选（已存在则不重复加）并**在弹窗内打开详情**
- 详情弹窗：分时 / 日K / 周K / 月K / 5分K / 30分K / 60分K 切换，☆ 一键加/删自选
- 「打开面板 ↗」进入整页大图模式（含缩放条与逐股轮询）
- 测试（需先 `npm i jsdom` 或设置 `JSDOM_PATH`）：`node test/api.test.js`（行情解析器）、`node test/popup.test.js`（弹窗交互流）、`node test/period.test.js`（周期tab）、`node test/trend.test.js`（分时标注）

## 已知限制

- 分钟K线（5/30/60分）腾讯接口仅支持 A 股；港股美股该档位会显示降级提示
- 美股分时仅在美东交易时段有数据
- 美股实时行情可能为 15 分钟延时（取决于腾讯源）

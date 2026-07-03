# 解除B站版权BV视频404播放限制

仓库：[0xNMLSS/bilibili-av-shell-playfix](https://github.com/0xNMLSS/bilibili-av-shell-playfix)

参考 [ipcjs/解除B站区域限制](https://github.com/ipcjs/bilibili-helper) 的命名与思路。

## 适用范围

| | |
|---|---|
| **仅处理** | `https://www.bilibili.com/video/BV*`、`/video/av*`（**BV 视频页**） |
| **触发条件** | `view / SSR` 返回 **-404**，且 **legacy UGC playurl 仍可用** |

## 明确不处理（不解番剧）

- **`/bangumi/play/ep*`、`/bangumi/play/ss*`** 等番剧播放页  
- **`bangumi.bilibili.com`** 动漫/电影分区页  
- 需要代理 / BiliRoaming 的 **纯 PGC 地区锁**  
- `view` 与 `playurl` **同时失败** 的视频  

> 番剧地区限制请继续使用 [解除B站区域限制](https://github.com/ipcjs/bilibili-helper) 或 BiliRoaming 等方案；本脚本与其互补，**只补 BV 壳 + view404** 这一小段。

## 典型 API（例 `BV1GJ411x7h7`）

| API | 海外常见结果 |
|-----|----------------|
| `/x/web-interface/view` | `-404` |
| `/x/web-interface/view/detail` | `-404`（脚本会合成 Related / Tags） |
| `/x/web-interface/archive/related` | `0` |
| `/x/player/pagelist` | `0` |
| `/x/player/playurl`（UGC legacy） | `0` |

> **播放量说明：** 版权壳视频在 `view -404` 时，B 站不提供该稿件自身的 stat 接口；脚本只能补标题、分 P、推荐列表等。右侧推荐视频里的播放量仍正常显示。

## 工作原理

1. 拦截 SSR `__INITIAL_STATE__`，`error.trueCode === -404` 时用 pagelist 合成 `videoData`，并预填 `related[]`
2. 拦截 `view` / `view/detail`，`-404` 时用 pagelist + related + tags + desc 合成页面元数据
3. 阻止跳转首页错误页
4. 挂载 `player.bilibili.com` embed 播放器（完整 B 站 UI + 弹幕）；iframe 内修复单击暂停/双击全屏

### 正常视频 vs 版权壳（view404）

| | 正常视频 (`view: 0`) | 版权壳 (`view: -404`) |
|--|---------------------|----------------------|
| 脚本行为 | 无侵入（等同未安装） | 合成 metadata + embed 播放 |
| 推荐视频点击 | B 站原生 SPA 切换 | 整页跳转 |
| 播放器 | 页面原生 bpx-player | `player.bilibili.com` iframe |

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)（或 Violentmonkey 等用户脚本管理器）
2. 打开 Greasy Fork 脚本页：[解除B站版权BV视频404播放限制](https://greasyfork.org/zh-CN/scripts/585302-%E8%A7%A3%E9%99%A4b%E7%AB%99%E7%89%88%E6%9D%83bv%E8%A7%86%E9%A2%91404%E6%92%AD%E6%94%BE%E9%99%90%E5%88%B6)
3. 点击 **「安装此脚本」**，在扩展弹窗中确认安装
4. 打开测试链接：https://www.bilibili.com/video/BV1GJ411x7h7/

Tampermonkey 会按 Greasy Fork 源自动检查更新。

### 手动安装（开发）

若要试用仓库内尚未发布的版本：新建脚本，粘贴 `bilibili_av_shell_playfix.user.js` 全文。

控制台过滤：`AV Shell Playfix`

## License

MIT

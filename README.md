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
| `/x/player/pagelist` | `0` |
| `/x/player/playurl`（UGC legacy） | `0` |

## 工作原理

1. 拦截 SSR `__INITIAL_STATE__`，`error.trueCode === -404` 时用 pagelist 合成 `videoData`
2. 阻止跳转首页错误页
3. 用 legacy UGC `/x/player/playurl` 挂载 HTML5 `<video>` 播放正片

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)
2. 新建脚本，粘贴 `bilibili_av_shell_playfix.user.js` 全文
3. 打开测试链接：https://www.bilibili.com/video/BV1GJ411x7h7/

控制台过滤：`AV Shell Playfix`

## License

MIT

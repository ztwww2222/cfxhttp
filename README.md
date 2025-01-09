简体中文 | [English](./docs/en.md)  

在 Cloudflare workers 或者 pages 中部署 vless 协议的代理服务器。  

#### 在 pages 中部署 ws 代理
 1. 下载 [releases](https://github.com/vrnobody/cfxhttp/releases) 中的 cfxhttp.zip，上传到 pages
 2. 在设置面板中添加环境变量： `UUID` 和 `WS_PATH`

一切顺利的话，访问（可能要挂代理） `https://your-project-name.pages.dev` 会看到 `Hello world!`。  
访问 `https://your-project-name.pages.dev/(WS_PATH)/?fragment=true&uuid=(UUID)`  
获取 WebSocket 协议的客户端 `config.json`。把 `fragment` 设置为 `false` 获取关闭分片功能的配置。  

#### 在 workers 中部署 ws 代理
 1. 下载 [releases](https://github.com/vrnobody/cfxhttp/releases) 中的 cfxhttp.zip，解压得到 _worker.js
 2. 复制 _worker.js 里面的代码到 Cloudflare workers 的代码编辑器中
 3. 在设置面板中添加环境变量： `UUID` 和 `WS_PATH`

其他和 pages 类似。  

#### 在 workers 中部署 xhttp 代理
 1. 前置要求，拥有一个由 CF 托管的一级域名
 1. 在 CF 控制面板的 `网络` 配置中启用 `gRPC` 功能
 1. 在 DNS 配置中添加一个二级域名的 A 记录，随便填个 IPv4 地址，开启小黄云
 1. 下载 [releases](https://github.com/vrnobody/cfxhttp/releases) 中的 cfxhttp.zip，解压得到 _worker.js
 1. 新建一个 workers 把 _worker.js 里面的代码复制进去
 1. 在 workers 的配置页面添加路由，指向上面新加的二级域名，例如: `sub-domain.your-website.com/*`
 1. 在设置面板中添加环境变量： `UUID` 和 `XHTTP_PATH`

访问 `https://sub-domain.your-website.com/(XHTTP_PATH)/?fragment=true&uuid=(UUID)`  
获取 xhttp 协议的客户端 `config.json`。  
*xhttp 协议只能部署到 workers，不能部署到 pages 详见 [issue #2](https://github.com/vrnobody/cfxhttp/issues/2)*  

#### 各设置项说明
 * `UUID` 这个不用解释了吧
 * `PROXY` （可选）反代 CF 网页的服务器，逗号分隔，每次随机抽取一个，格式：`a.com, b.com, ...`
 * `WS_PATH` ws 协议的访问路径，例如：`/ws`，留空表示关闭这个功能
 * `XHTTP_PATH` xhttp 协议的访问路径，例如：`/xhttp`，留空表示关闭这个功能
 * `XPADDING_RANGE` xhttp 协议回复头中 X-Padding 的长度范围，例如：`100-1000` 或者 `10`，填 `0` 表示关闭这个功能
 * `DOH_QUERY_PATH` DNS over HTTPS 服务的访问路径，例如：`/doh-query`，留空表示关闭这个功能
 * `UPSTREAM_DOH` 上游 DoH 服务器，例如：`https://dns.google/dns-query`，注意不要填 Cloudflare 的 DNS
 * `IP_QUERY_PATH` 查询客户 IP 信息功能的访问路径，例如: `/ip-query/?key=123456`，留空表示关闭这个功能，后面那个 key 相当于密码
 * `LOG_LEVEL` 日志级别，可选值：`debug`, `info`, `error`, `none`
 * `TIME_ZONE` 日志时间戳的时区，中国填 `8`

#### 注意事项
 * src/index.js 是开发中的代码，会有 bug，请到 [releases](https://github.com/vrnobody/cfxhttp/releases) 里面下载 Source code (zip)
 * 网站测速结果是错的，这个脚本很慢，不要有太高的期望
 * workers / pages 不支持 UDP，需要 UDP 功能的应用无法使用，例如：DNS
 * workers / pages 有 CPU 时间限制，需要长时间链接的应用会随机断线，例如：下载大文件
 * DoH 功能不是给 xray-core 使用的，`config.json` 应使用 DNS over TCP，例如：`tcp://8.8.8.8:53`
 * ws 协议不支持，也不会支持 early data 功能
 * ws 和 xhttp 协议按需选一个就可以，没必要两个都开
 * 使劲薅，免费的资源就会消失，且用且珍惜

#### 感谢（代码抄袭自以下项目）
[tina-hello/doh-cf-workers](https://github.com/tina-hello/doh-cf-workers/) DNS over HTTPS 功能  
[6Kmfi6HP/EDtunnel](https://github.com/6Kmfi6HP/EDtunnel/) WebSocket 传输协议功能  
[clsn blog](https://clsn.io/post/2024-07-11-%E5%80%9F%E5%8A%A9cloudflare%E8%8E%B7%E5%8F%96%E5%85%AC%E7%BD%91ip) 获取 IP 信息功能  

[简体中文](../README.md) | English  

Please help me improve this document.  

This script is used to deploy vless proxy to Cloudflare workers or pages.

#### Deploy WebSocket proxy to pages
 1. Download `cfxhttp.zip` from [releases](https://github.com/vrnobody/cfxhttp/releases), and upload to pages
 2. Add `UUID` and `WS_PATH` enviroment variables

If every thing goes right, you would see a `Hello world!` when accessing `https://your-project-name.pages.dev`.  
Visit `https://your-project-name.pages.dev/(WS_PATH)/?fragment=true&uuid=(UUID)` to get a client `config.json` with WebSocket transport.  
Set `fragemnt` to `false` to get a config without fragment settings.  

#### Deploy WebSocket proxy to workers
 1. Download `cfxhttp.zip` from [releases](https://github.com/vrnobody/cfxhttp/releases), and extract `_worker.js`
 2. Copy the source code of `_worker.js` into Cloudflare workers code editor
 3. Add `UUID` and `WS_PATH` enviroment variables

The rest is similar to pages.  

#### Deploy xhttp proxy to workers
 1. Pre-requirment: have a domain managed by Cloudflare.
 1. Enable `gRPC` feature in `network` settings in Cloudflare dashboard.
 1. Create a DNS `A record` for a new sub-domain with a random IPv4 address. Enable `proxy` option.
 1. Download `cfxhttp.zip` from [releases](https://github.com/vrnobody/cfxhttp/releases), and extract `_worker.js`
 1. Create a worker and copy-and-paste the source code  of `_worker.js`.
 1. Goto worker's config panel, add a routing rule to your new sub-domain. e.g. `sub-domain.your-website.com/*`.
 1. Add `UUID` and `WS_PATH` enviroment variables

Visit `https://sub-domain.your-website.com/(XHTTP_PATH)/?fragment=true&uuid=(UUID)` to get a client `config.json` with xhttp transport.  
*The xhttp transport can not deploy to Cloudflare pages. [Issue #2](https://github.com/vrnobody/cfxhttp/issues/2)*  

#### Settings detail
 * `UUID` Need no explains.
 * `PROXY` (optional) Reverse proxies for websites using Cloudflare CDN. Randomly pick one for every connection. Format: `a.com, b.com, ...`
 * `WS_PATH` URL path for ws transport. e.g. `/ws`. Leave it empty to disable this feature.
 * `XHTTP_PATH` URL path for xhttp transport. e.g. `/xhttp`. Leave it empty to disable this feature.
 * `XPADDING_RANGE` Length range of X-Padding response header. e.g. `100-1000` or `10`, Set to `0` to disable this feature.
 * `DOH_QUERY_PATH` URL path for DNS over HTTP(S) feature. e.g. `/doh-query`. Leave it empty to disable this feature.
 * `UPSTREAM_DOH` e.g. `https://dns.google/dns-query`. Do not use Cloudflare DNS.
 * `IP_QUERY_PATH` URL path for querying client IP information feature. e.g. `/ip-query/?key=123456`. Leave it empty to disable this feature. The `key` parameter is used for authentication.
 * `LOG_LEVEL` debug, info, error, none
 * `TIME_ZONE` Timestamp time zone of logs. e.g. Argentina is `-3`
 * `BUFFER_SIZE` Upload/Download buffer size in KiB. Default value is 32 KiB. (v1.0.6+) Set to `'0'` to disable buffering. I don't know what the optimal value is. XD

#### Notice
 * `src/index.js` is under developing, could have bugs, please download `Source code (zip)` from [releases](https://github.com/vrnobody/cfxhttp/releases).
 * This script is slow, do not expect too much.
 * Workers and pages do not support UDP. Applications require UDP feature will not work. Such as DNS.
 * Workers and pages have CPU executing-time limit. Applications require long-term connection would disconnect randomly. Such as downloading a big file.
 * DoH feature is not for xray-core, use DNS over TCP in `config.json` instead. e.g. `tcp://8.8.8.8:53`  
 * WebSocket transport does not and would not support early data feature.
 * Enable one of ws transport or xhttp transport as needed. It's a bit wasteful to enable both.
 * The more people knows of this script, the sooner this script got banned.

#### Credits
[tina-hello/doh-cf-workers](https://github.com/tina-hello/doh-cf-workers/) DoH feature  
[6Kmfi6HP/EDtunnel](https://github.com/6Kmfi6HP/EDtunnel/) WebSocket transport feature  
[clsn blog](https://clsn.io/post/2024-07-11-%E5%80%9F%E5%8A%A9cloudflare%E8%8E%B7%E5%8F%96%E5%85%AC%E7%BD%91ip) Get IP information feature  

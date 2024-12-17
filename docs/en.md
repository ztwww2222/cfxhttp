[简体中文](../README.md) | English  

Please help me improve this document.  

This script is used for deploying vless-xhttp proxy on Cloudflare workers.  

#### Usage
 1. Pre-requirment: have a domain managed by Cloudflare.
 1. Enable `gRPC` feature in `network` settings in Cloudflare config panel.
 1. Create a DNS `A record` for a new sub-domain with a random IPv4 address. Eanble `proxy` option.
 1. Create a worker and copy-and-paste the source code from [src/index.js](../src/index.js).
 1. Goto worker's config panel, add a routing rule to your new sub-domain. e.g. `sub.your-website.com/*`.

There are some configurations at the top of the source code.  
 * `UUID = "..."` need no explains
 * `PROXY = "cfproxy.com"` (optional) reverse proxy for websites using Cloudflare CDN
 * `LOG_LEVEL = "info"` debug, info, error, none

You can set eviroment variables in worker's config panel too. Env-vars have higher priority.  

If every thing goes right, you would see a `Hello world!` when accessing `https://sub.your-website.com/`.  
Viste `https://sub.your-website.com/xhttp/?uuid=YOUR-UUID` to get `client-config.json`.  

#### Notice
 * This script is slow, do not expect too much.
 * Please do not abuse free services.
 * The more people knows of this script, the sooner this script got banned.

### 发布记录 update log

#### v1.0.6 (not release yet)
 * 传输完成后关闭 ws 链接
 * 用 for 循环取代 stream.pipeTo()
 * close ws server properly
 * replace stream.pipeTo() with for loop

#### v1.0.5 (2025-01-12)
 * 添加上传、下载缓存大小设置项
 * add upload/download buffer size setting

#### v1.0.4 (2025-01-10)
 * 重构代码

#### v1.0.3 (2025-01-08)
 * ws 添加写缓存
 * xhttp 添加读缓存

#### v1.0.2 (2025-01-06)
 * 重构代码

#### v1.0.1 (2025-01-02)
 * 支持指定多个 Cloudflare 反向代理
 * 生成的配置添加分片（fragment）选项
 * 当 UUID 为空时，显示随机配置示例

#### v1.0.0 (2024-12)
 * WebSocket 协议
 * XHTTP 协议
 * DNS over HTTPS
 * 查询客户 IP 信息

import { connect } from 'cloudflare:sockets'

// configurations
const UUID = '' // vless UUID
const PROXY = '' // (optional) reverse proxy for CF websites. e.g. example.com
const LOG_LEVEL = 'info' // debug, info, error, none
const TIME_ZONE = 0 // timestamp time zone of logs

const XHTTP_PATH = '/xhttp' // URL path for xhttp protocol, empty means disabled
const WS_PATH = '/ws' // URL path for ws protocol, empty means disabled

const DOH_QUERY_PATH = '' // DNS over HTTP(S) path, e.g. '/doh-query', empty means disabled
const UPSTREAM_DOH = 'https://dns.google/dns-query' // Upstream DNS over HTTP(S) server

// source code
const BUFFER_SIZE = 128 * 1024 // download/upload buffer size in bytes, must smaller than 1 MiB

const BAD_REQUEST = new Response(null, {
    status: 404,
    statusText: 'Bad Request',
})

function get_length(o) {
    return (o && (o.length || o.byteLength)) || 0
}

function to_size(size) {
    const KiB = 1024
    const min = 1.1 * KiB
    const SIZE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    let i = 0
    for (; i < SIZE_UNITS.length - 1; i++) {
        if (Math.abs(size) < min) {
            break
        }
        size = size / KiB
    }
    const f = size > 0 ? Math.floor : Math.ceil
    return `${f(size)} ${SIZE_UNITS[i]}`
}

function validate_uuid(id, uuid) {
    for (let index = 0; index < 16; index++) {
        const v = id[index]
        const u = uuid[index]
        if (v !== u) {
            return false
        }
    }
    return true
}

class Counter {
    #total

    constructor() {
        this.#total = 0
    }

    get() {
        return this.#total
    }

    add(size) {
        this.#total += size
    }
}

function concat_typed_arrays(first, ...args) {
    let len = first.length
    for (let a of args) {
        len += a.length
    }
    const r = new first.constructor(len)
    r.set(first, 0)
    len = first.length
    for (let a of args) {
        r.set(a, len)
        len += a.length
    }
    return r
}

class Logger {
    #id
    #level
    #time_drift

    constructor(log_level, time_zone) {
        this.#id = random_id()
        this.#time_drift = 0
        if (time_zone && time_zone !== 0) {
            this.#time_drift = time_zone * 60 * 60 * 1000
        }

        if (typeof log_level !== 'string') {
            log_level = 'info'
        }
        const levels = ['debug', 'info', 'error', 'none']
        this.#level = levels.indexOf(log_level.toLowerCase())
    }

    debug(...args) {
        if (this.#level < 1) {
            this.#log(`[debug]`, ...args)
        }
    }

    info(...args) {
        if (this.#level < 2) {
            this.#log(`[info ]`, ...args)
        }
    }

    error(...args) {
        if (this.#level < 3) {
            this.#log(`[error]`, ...args)
        }
    }

    #log(prefix, ...args) {
        const now = new Date(Date.now() + this.#time_drift).toISOString()
        console.log(now, prefix, `(${this.#id})`, ...args)
    }
}

function random_id() {
    const min = 10000
    const max = min * 10 - 1
    return Math.floor(Math.random() * (max - min + 1)) + min
}

function parse_uuid(uuid) {
    uuid = uuid.replaceAll('-', '')
    const r = []
    for (let index = 0; index < 16; index++) {
        const v = parseInt(uuid.substr(index * 2, 2), 16)
        r.push(v)
    }
    return r
}

// enums
const ADDRESS_TYPE_IPV4 = 1
const ADDRESS_TYPE_URL = 2
const ADDRESS_TYPE_IPV6 = 3

async function read_vless_header(reader, uuid_str) {
    let r = await readAtLeast(reader, 1 + 16 + 1)
    let rlen = 0
    let idx = 0
    let cache = r.value
    rlen += r.value.length

    const version = cache[0]
    const id = cache.slice(1, 1 + 16)
    const uuid = parse_uuid(uuid_str)
    if (!validate_uuid(id, uuid)) {
        return `invalid UUID`
    }
    const pb_len = cache[1 + 16]
    const addr_plus1 = 1 + 16 + 1 + pb_len + 1 + 2 + 1

    if (addr_plus1 + 1 > rlen) {
        if (r.done) {
            return `header too short`
        }
        idx = addr_plus1 + 1 - rlen
        r = await readAtLeast(reader, idx)
        rlen += r.value.length
        cache = concat_typed_arrays(cache, r.value)
    }

    const cmd = cache[1 + 16 + 1 + pb_len]
    if (cmd !== 1) {
        return `unsupported command: ${cmd}`
    }
    const port = (cache[addr_plus1 - 1 - 2] << 8) + cache[addr_plus1 - 1 - 1]
    const atype = cache[addr_plus1 - 1]
    let header_len = -1
    if (atype === ADDRESS_TYPE_IPV4) {
        header_len = addr_plus1 + 4
    } else if (atype === ADDRESS_TYPE_IPV6) {
        header_len = addr_plus1 + 16
    } else if (atype === ADDRESS_TYPE_URL) {
        header_len = addr_plus1 + 1 + cache[addr_plus1]
    }

    if (header_len < 0) {
        return 'read address type failed'
    }

    idx = header_len - rlen
    if (idx > 0) {
        if (r.done) {
            return `read address failed`
        }
        r = await readAtLeast(reader, idx)
        rlen += r.value.length
        cache = concat_typed_arrays(cache, r.value)
    }

    let hostname = ''
    idx = addr_plus1
    switch (atype) {
        case ADDRESS_TYPE_IPV4:
            hostname = cache.slice(idx, idx + 4).join('.')
            break
        case ADDRESS_TYPE_URL:
            hostname = new TextDecoder().decode(
                cache.slice(idx + 1, idx + 1 + cache[idx]),
            )
            break
        case ADDRESS_TYPE_IPV6:
            hostname = cache
                .slice(idx, idx + 16)
                .reduce(
                    (s, b2, i2, a) =>
                        i2 % 2
                            ? s.concat(((a[i2 - 1] << 8) + b2).toString(16))
                            : s,
                    [],
                )
                .join(':')
            break
    }

    if (hostname.length < 1) {
        return 'parse hostname failed'
    }

    return {
        hostname,
        port,
        data: cache.slice(header_len),
        resp: new Uint8Array([version, 0]),
        reader,
        done: r.done,
    }
}

async function upload_to_remote(counter, log, writer, vless) {
    async function inner_upload(d, src) {
        if (!d) {
            log.debug(`upload detect null ${src}`)
        }

        const len = get_length(d)
        counter.add(len)
        log.debug(`upload ${src}: ${to_size(len)}`)
        await writer.write(d)
    }

    await inner_upload(vless.data, 'first packet')
    const more = !vless.done
    while (more) {
        const r = await vless.reader.read()
        if (r.value) {
            await inner_upload(r.value, 'remain packets')
        }
        if (r.done) {
            break
        }
    }
}

function close_writer(writer) {
    const f = writer && writer.close
    if (f && typeof f === 'function') {
        f()
            .then(() => log.debug(`upload writer closed`))
            .catch((err) => log.debug(`upload writer error: ${err}`))
    }
}

function create_uploader(log, vless, writable) {
    const counter = new Counter()
    const done = new Promise((resolve, reject) => {
        const writer = writable.getWriter()
        upload_to_remote(counter, log, writer, vless)
            .then(resolve)
            .catch(reject)
            .finally(() => close_writer(writer))
    })

    return {
        counter,
        done,
    }
}

function create_downloader(log, vless, remote_readable) {
    const counter = new Counter()
    let buffer_stream

    const done = new Promise((resolve, reject) => {
        buffer_stream = new TransformStream(
            {
                start(controller) {
                    log.debug(`copy vless response`)
                    counter.add(get_length(vless.resp))
                    controller.enqueue(vless.resp)
                },
                transform(chunk, controller) {
                    const len = get_length(chunk)
                    counter.add(len)
                    controller.enqueue(chunk)
                    log.debug(`download: ${to_size(len)}`)
                },
                cancel(reason) {
                    reject(`download cancelled: ${reason}`)
                },
            },
            null,
            new ByteLengthQueuingStrategy({ highWaterMark: BUFFER_SIZE }),
        )
        remote_readable
            .pipeTo(buffer_stream.writable)
            .catch(reject)
            .finally(resolve)
    })

    return {
        readable: buffer_stream.readable,
        counter,
        done,
    }
}

async function connect_to_remote(log, vless, ...remotes) {
    const hostname = remotes.shift()
    if (!hostname || hostname.length < 1) {
        log.info('all attempts failed')
        return null
    }

    if (vless.hostname === hostname) {
        log.info(`direct connect [${vless.hostname}]:${vless.port}`)
    } else {
        log.info(`proxy [${vless.hostname}]:${vless.port} through ${hostname}`)
    }

    const retry = () => connect_to_remote(log, vless, ...remotes)
    try {
        const remote = connect({ hostname: hostname, port: vless.port })
        const info = await remote.opened
        log.debug(`connection opened:`, info.remoteAddress)
        return remote
    } catch (err) {
        log.error(`retry [${vless.hostname}] reason: ${err}`)
    }
    return await retry()
}

async function readAtLeast(reader, n) {
    let len = 0
    const buffs = []
    let done = false
    while (len < n && !done) {
        const r = await reader.read()
        if (r.value) {
            const b = new Uint8Array(r.value)
            buffs.push(b)
            len += b ? b.length : 0
        }
        done = r.done
    }
    if (len < n) {
        throw new Error(`no enough data to read`)
    }

    const value = concat_typed_arrays(...buffs)
    return {
        value,
        done,
    }
}

async function handle_vless(cfg, log, readable) {
    const reader = readable.getReader()
    const vless = await read_vless_header(reader, cfg.UUID)
    if (typeof vless !== 'object' || !vless) {
        log.error(`failed to parse vless header: ${vless}`)
        drain_connection(log, reader).catch((err) =>
            log.info(`drain error: ${err}`),
        )
        return null
    }

    const remote = await connect_to_remote(
        log,
        vless,
        vless.hostname,
        cfg.PROXY,
    )
    if (remote === null) {
        log.error('create remote stream failed')
        return null
    }

    const uploader = create_uploader(log, vless, remote.writable)
    const downloader = create_downloader(log, vless, remote.readable)

    downloader.done
        .then(() => log.debug(`download complete`))
        .catch((err) => log.error(`download error: ${err}`))
        .finally(() => uploader.done)
        .then(() => log.debug(`upload complete`))
        .catch((err) => log.debug(`upload error: ${err}`))
        .finally(() => {
            const total_upload = to_size(uploader.counter.get())
            const total_download = to_size(downloader.counter.get())
            log.info(
                `connection closed, upload ${total_upload}, download ${total_download}`,
            )
        })

    return downloader.readable
}

async function handle_xhttp(cfg, log, request) {
    try {
        return await handle_vless(cfg, log, request.body)
    } catch (err) {
        log.error(`handl xhttp error: ${err}`)
    }
    return null
}

async function handle_ws(cfg, log, server) {
    server.accept()
    const client_readable = new ReadableStream({
        start(controller) {
            server.addEventListener('message', ({ data }) => {
                controller.enqueue(data)
            })
            server.addEventListener('error', (err) => {
                log.error(`ws client error: ${err}`)
                controller.error(err)
            })
            server.addEventListener('close', () => controller.close())
        },
        cancel(reason) {
            log.debug(`ws client upload error: ${reason}`)
            server.close()
        },
    })
    const client_writable = new WritableStream({
        write(chunk) {
            server.send(chunk)
        },
        abort(reason) {
            log.debug(`ws client download error: ${reason}`)
        },
    })

    const remote_readable = await handle_vless(cfg, log, client_readable)
    if (remote_readable) {
        remote_readable.pipeTo(client_writable)
    }
}

function append_slash(path) {
    if (!path) {
        return '/'
    }
    return path.endsWith('/') ? path : `${path}/`
}

function create_config(type, url, uuid) {
    const config = JSON.parse(config_template)
    const vless = config['outbounds'][0]['settings']['vnext'][0]
    const stream = config['outbounds'][0]['streamSettings']

    const host = url.hostname
    vless['users'][0]['id'] = uuid
    vless['address'] = host
    stream['tlsSettings']['serverName'] = host

    const path = append_slash(url.pathname)
    if (type === 'ws') {
        stream['wsSettings'] = {
            path,
            host,
        }
    } else if (type === 'xhttp') {
        stream['xhttpSettings'] = {
            mode: 'stream-one',
            host,
            path,
            noGRPCHeader: false,
            keepAlivePeriod: 300,
        }
    } else {
        return null
    }

    stream['network'] = type
    return JSON.stringify(config)
}

const config_template = `{
  "log": {
    "loglevel": "warning"
  },
  "inbounds": [
    {
      "tag": "agentin",
      "port": 1080,
      "listen": "127.0.0.1",
      "protocol": "socks",
      "settings": {}
    }
  ],
  "outbounds": [
    {
      "protocol": "vless",
      "settings": {
        "vnext": [
          {
            "address": "localhost",
            "port": 443,
            "users": [
              {
                "id": "",
                "encryption": "none"
              }
            ]
          }
        ]
      },
      "tag": "agentout",
      "streamSettings": {
        "network": "raw",
        "security": "tls",
        "tlsSettings": {
          "serverName": "localhost",
          "alpn": [
            "h2"
          ]
        }
      }
    }
  ]
}`

async function drain_connection(log, reader) {
    log.info(`drain connection`)
    while (true) {
        const r = await reader.read()
        if (r.done) {
            break
        }
    }
}

async function handle_doh(log, request, url, upstream) {
    const mime_dnsmsg = 'application/dns-message'
    const method = request.method

    if (
        method === 'POST' &&
        request.headers.get('content-type') === mime_dnsmsg
    ) {
        log.info(`handle DoH POST request`)
        return fetch(upstream, {
            method,
            headers: {
                Accept: mime_dnsmsg,
                'Content-Type': mime_dnsmsg,
            },
            body: request.body,
        })
    }

    if (method !== 'GET') {
        return BAD_REQUEST
    }

    const mime_json = 'application/dns-json'
    if (request.headers.get('Accept') === mime_json) {
        log.info(`handle DoH GET json request`)
        return fetch(upstream + url.search, {
            method,
            headers: {
                Accept: mime_json,
            },
        })
    }

    const param = url.searchParams.get('dns')
    if (param && typeof param === 'string') {
        log.info(`handle DoH GET hex request`)
        return fetch(upstream + '?dns=' + param, {
            method,
            headers: {
                Accept: mime_dnsmsg,
            },
        })
    }

    return BAD_REQUEST
}

function handle_config(cfg, url) {
    const path = url.pathname
    let ctype = null
    if (url.search.indexOf(`${cfg.UUID}`) >= 0) {
        if (cfg.XHTTP_PATH && path.endsWith(cfg.XHTTP_PATH)) {
            ctype = 'xhttp'
        } else if (cfg.WS_PATH && path.endsWith(cfg.WS_PATH)) {
            ctype = 'ws'
        }
    }
    return create_config(ctype, url, cfg.UUID)
}

function load_settings(env) {
    const cfg = {
        UUID: env.UUID || UUID,
        PROXY: env.PROXY || PROXY,
        LOG_LEVEL: env.LOG_LEVEL || LOG_LEVEL,
        TIME_ZONE: parseInt(env.TIME_ZONE) || TIME_ZONE,

        XHTTP_PATH: append_slash(env.XHTTP_PATH || XHTTP_PATH),
        WS_PATH: append_slash(env.WS_PATH || WS_PATH),

        DOH_QUERY_PATH: append_slash(env.DOH_QUERY_PATH || DOH_QUERY_PATH),
        UPSTREAM_DOH: env.UPSTREAM_DOH || UPSTREAM_DOH,
    }
    return cfg
}

async function main(request, env) {
    const cfg = load_settings(env)
    if (!cfg.UUID) {
        return new Response(`Error: UUID is empty`)
    }

    const log = new Logger(cfg.LOG_LEVEL, cfg.TIME_ZONE)
    const url = new URL(request.url)
    const path = url.pathname

    if (
        cfg.WS_PATH &&
        path.endsWith(cfg.WS_PATH) &&
        request.headers.get('Upgrade') === 'websocket'
    ) {
        log.info(`accept websocket`)
        const [client, server] = Object.values(new WebSocketPair())
        handle_ws(cfg, log, server).catch((err) =>
            log.error(`handle ws client error: ${err}`),
        )
        return new Response(null, {
            status: 101,
            webSocket: client,
        })
    }

    if (
        cfg.XHTTP_PATH &&
        path.endsWith(cfg.XHTTP_PATH) &&
        request.method === 'POST'
    ) {
        const readable = await handle_xhttp(cfg, log, request)
        if (readable) {
            return new Response(readable, {
                headers: {
                    'X-Accel-Buffering': 'no',
                    'Cache-Control': 'no-store',
                    Connection: 'Keep-Alive',
                    'User-Agent': 'Go-http-client/2.0',
                    'Content-Type': 'application/grpc',
                    // 'Content-Type': 'text/event-stream',
                    // 'Transfer-Encoding': 'chunked',
                },
            })
        }
        return BAD_REQUEST
    }

    if (cfg.DOH_QUERY_PATH && append_slash(path).endsWith(cfg.DOH_QUERY_PATH)) {
        return handle_doh(log, request, url, cfg.UPSTREAM_DOH)
    }

    if (request.method === 'GET') {
        const config = handle_config(cfg, url)
        if (config) {
            return new Response(config, {
                headers: {
                    'Content-Type': 'application/json',
                },
            })
        }
        return new Response(`Hello world!`)
    }

    return BAD_REQUEST
}

export default {
    fetch: main,

    // for unit testing
    concat_typed_arrays,
    get_length,
    parse_uuid,
    to_size,
    validate_uuid,
}

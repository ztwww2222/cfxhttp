import { connect } from 'cloudflare:sockets'

// configurations
const SETTINGS = {
    ['UUID']: '', // vless UUID
    ['PROXY']: '', // (optional) reverse proxies for Cloudflare websites. e.g. 'a.com, b.com, ...'
    ['LOG_LEVEL']: 'none', // debug, info, error, none
    ['TIME_ZONE']: '0', // timestamp time zone of logs

    ['XHTTP_PATH']: '', // URL path for xhttp transport, e.g. '/xhttp', empty means disabled
    ['XPADDING_RANGE']: '100-1000', // Length range of X-Padding response header

    ['WS_PATH']: '', // URL path for ws transport, e.g. '/ws', empty means disabled

    ['DOH_QUERY_PATH']: '', // URL path for DNS over HTTP(S), e.g. '/doh-query', empty means disabled
    ['UPSTREAM_DOH']: 'https://dns.google/dns-query', // upstream DNS over HTTP(S) server

    ['IP_QUERY_PATH']: '', // URL path for querying client IP information, empty means disabled
}

// source code
const BUFFER_SIZE = 128 * 1024 // download/upload buffer-size in bytes, must smaller than 1 MiB

const BAD_REQUEST = new Response(null, {
    status: 404,
    statusText: 'Bad Request',
})

function get_length(o) {
    return (o && (o.byteLength || o.length)) || 0
}

function validate_uuid(left, right) {
    for (let i = 0; i < 16; i++) {
        if (left[i] !== right[i]) {
            return false
        }
    }
    return true
}

function concat_typed_arrays(first, ...args) {
    if (!args || args.length < 1) {
        return first
    }

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
    inner_id
    inner_level
    inner_time_drift

    constructor(log_level, time_zone) {
        this.inner_id = random_id()
        this.inner_time_drift = 0
        const tz = parseInt(time_zone)
        if (tz) {
            this.inner_time_drift = tz * 60 * 60 * 1000
        }

        if (typeof log_level !== 'string') {
            log_level = 'info'
        }
        const levels = ['debug', 'info', 'error', 'none']
        this.inner_level = levels.indexOf(log_level.toLowerCase())
    }

    debug(...args) {
        if (this.inner_level < 1) {
            this.inner_log(`[debug]`, ...args)
        }
    }

    info(...args) {
        if (this.inner_level < 2) {
            this.inner_log(`[info ]`, ...args)
        }
    }

    error(...args) {
        if (this.inner_level < 3) {
            this.inner_log(`[error]`, ...args)
        }
    }

    inner_log(prefix, ...args) {
        const now = new Date(Date.now() + this.inner_time_drift).toISOString()
        console.log(now, prefix, `(${this.inner_id})`, ...args)
    }
}

function random_num(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

function random_id() {
    const min = 10000
    const max = min * 10 - 1
    return random_num(min, max)
}

function random_str(len) {
    // https://stackoverflow.com/questions/1349404/generate-random-string-characters-in-javascript
    return Array(len)
        .fill()
        .map((_) => ((Math.random() * 36) | 0).toString(36))
        .join('')
}

function random_uuid() {
    // https://stackoverflow.com/questions/105034/how-do-i-create-a-guid-uuid
    const s4 = () =>
        Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1)
    return `${s4() + s4()}-${s4()}-${s4()}-${s4()}-${s4() + s4() + s4()}`
}

function random_padding(range_str) {
    if (!range_str || typeof range_str !== 'string') {
        return null
    }
    const range = range_str
        .split('-')
        .map((s) => parseInt(s))
        .filter((n) => n || n === 0)
        .slice(0, 2)
        .sort((a, b) => a - b)
    if (range.length < 1 || range[0] < 1) {
        return null
    }
    const last = range[range.length - 1]
    if (last < 1) {
        return null
    }
    const len = range[0] === last ? range[0] : random_num(range[0], last)
    return '0'.repeat(len)
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

async function read_vless_header(reader, cfg_uuid_str) {
    let buff = await read_atleast(reader, 1 + 16 + 1)
    let readed_len = buff.value.length
    let header = buff.value

    async function inner_read_until(offset) {
        if (buff.done) {
            throw new Error('header length too short')
        }
        const len = offset - readed_len
        if (len < 1) {
            return
        }
        buff = await read_atleast(reader, len)
        readed_len += buff.value.length
        header = concat_typed_arrays(header, buff.value)
    }

    const version = header[0]
    const uuid = header.slice(1, 1 + 16)
    const cfg_uuid = parse_uuid(cfg_uuid_str)
    if (!validate_uuid(uuid, cfg_uuid)) {
        throw new Error(`invalid UUID`)
    }
    const pb_len = header[1 + 16]
    const addr_plus1 = 1 + 16 + 1 + pb_len + 1 + 2 + 1
    await inner_read_until(addr_plus1 + 1)

    const cmd = header[1 + 16 + 1 + pb_len]
    const COMMAND_TYPE_TCP = 1
    if (cmd !== COMMAND_TYPE_TCP) {
        throw new Error(`unsupported command: ${cmd}`)
    }

    const port = (header[addr_plus1 - 1 - 2] << 8) + header[addr_plus1 - 1 - 1]
    const atype = header[addr_plus1 - 1]

    const ADDRESS_TYPE_IPV4 = 1
    const ADDRESS_TYPE_STRING = 2
    const ADDRESS_TYPE_IPV6 = 3
    let header_len = -1
    if (atype === ADDRESS_TYPE_IPV4) {
        header_len = addr_plus1 + 4
    } else if (atype === ADDRESS_TYPE_IPV6) {
        header_len = addr_plus1 + 16
    } else if (atype === ADDRESS_TYPE_STRING) {
        header_len = addr_plus1 + 1 + header[addr_plus1]
    }
    if (header_len < 0) {
        throw new Error('read address type failed')
    }
    await inner_read_until(header_len)

    const idx = addr_plus1
    let hostname = ''
    if (atype === ADDRESS_TYPE_IPV4) {
        hostname = header.slice(idx, idx + 4).join('.')
    } else if (atype === ADDRESS_TYPE_STRING) {
        hostname = new TextDecoder().decode(
            header.slice(idx + 1, idx + 1 + header[idx]),
        )
    } else if (atype === ADDRESS_TYPE_IPV6) {
        hostname = header
            .slice(idx, idx + 16)
            .reduce(
                (s, b2, i2, a) =>
                    i2 % 2 ? s.concat(((a[i2 - 1] << 8) + b2).toString(16)) : s,
                [],
            )
            .join(':')
    }
    if (!hostname) {
        throw new Error('parse hostname failed')
    }

    return {
        hostname,
        port,
        data: header.slice(header_len),
        resp: new Uint8Array([version, 0]),
    }
}

async function pump(readable, writable, first_packet) {
    if (get_length(first_packet) > 0) {
        const writer = writable.getWriter()
        await writer.write(first_packet)
        writer.releaseLock()
    }
    await readable.pipeTo(writable)
}

function pick_random_proxy(cfg_proxy) {
    if (!cfg_proxy || typeof cfg_proxy !== 'string') {
        return ''
    }
    const arr = cfg_proxy.split(/[ ,\n\r]+/).filter((s) => s)
    const r = arr[Math.floor(Math.random() * arr.length)]
    return r || ''
}

async function connect_remote(log, hostname, port, cfg_proxy) {
    async function inner_connect(remote) {
        const conn = connect({ hostname: remote, port })
        const info = await conn.opened
        log.debug(`connection opened: ${info.remoteAddress}`)
        return conn
    }

    try {
        log.info(`direct connect [${hostname}]:${port}`)
        return await inner_connect(hostname)
    } catch (err) {
        log.debug(`direct connect failed: ${err}`)
    }

    const proxy = pick_random_proxy(cfg_proxy)
    if (proxy) {
        log.info(`proxy [${hostname}]:${port} through [${proxy}]`)
        return await inner_connect(proxy)
    }

    throw new Error('all attempts failed')
}

async function parse_header(log, uuid_str, client_readable) {
    const reader = client_readable.getReader()
    try {
        const vless = await read_vless_header(reader, uuid_str)
        reader.releaseLock()
        return vless
    } catch (err) {
        drain_connection(log, reader).catch((err) =>
            log.info(`drain error: ${err}`),
        )
        throw new Error(`read vless header error: ${err.message}`)
    }
}

async function read_atleast(reader, n) {
    const buffs = []
    let done = false
    while (n > 0 && !done) {
        const r = await reader.read()
        if (r.value) {
            const b = new Uint8Array(r.value)
            buffs.push(b)
            n -= get_length(b)
        }
        done = r.done
    }
    if (n > 0) {
        throw new Error(`not enough data to read`)
    }

    return {
        value: concat_typed_arrays(...buffs),
        done,
    }
}

function create_xhttp_client(cfg, client_readable) {
    const buff_stream = new TransformStream(
        {
            transform(chunk, controller) {
                controller.enqueue(chunk)
            },
        },
        new ByteLengthQueuingStrategy({ highWaterMark: BUFFER_SIZE }),
        new ByteLengthQueuingStrategy({ highWaterMark: BUFFER_SIZE }),
    )

    const headers = {
        'X-Accel-Buffering': 'no',
        'Cache-Control': 'no-store',
        Connection: 'Keep-Alive',
        'User-Agent': 'Go-http-client/2.0',
        'Content-Type': 'application/grpc',
        // 'Content-Type': 'text/event-stream',
        // 'Transfer-Encoding': 'chunked',
    }
    const padding = random_padding(cfg.XPADDING_RANGE)
    if (padding) {
        headers['X-Padding'] = padding
    }
    const resp = new Response(buff_stream.readable, { headers })

    return {
        readable: client_readable,
        writable: buff_stream.writable,
        resp,
    }
}

function create_ws_client() {
    const [ws_client, ws_server] = Object.values(new WebSocketPair())
    ws_server.accept()

    const readable = new ReadableStream(
        {
            start(controller) {
                ws_server.addEventListener('message', ({ data }) => {
                    controller.enqueue(data)
                })
                ws_server.addEventListener('error', (err) => {
                    controller.error(err)
                })
                ws_server.addEventListener('close', () => {
                    controller.close()
                })
            },
        },
        new ByteLengthQueuingStrategy({ highWaterMark: BUFFER_SIZE }),
    )

    const writable = new WritableStream(
        {
            write(chunk) {
                ws_server.send(chunk)
            },
        },
        new ByteLengthQueuingStrategy({ highWaterMark: BUFFER_SIZE }),
    )

    function on_closed() {
        try {
            ws_server.close()
        } catch {}
    }

    const resp = new Response(null, {
        status: 101,
        webSocket: ws_client,
    })

    return {
        readable,
        writable,
        on_closed,
        resp,
    }
}

async function handle_client(cfg, log, client) {
    const vless = await parse_header(log, cfg.UUID, client.readable)

    const remote = await connect_remote(
        log,
        vless.hostname,
        vless.port,
        cfg.PROXY,
    )

    const upload_done = pump(client.readable, remote.writable, vless.data)
    const download_done = pump(remote.readable, client.writable, vless.resp)

    download_done
        .catch((err) => log.error(`download error: ${err}`))
        .finally(() => upload_done)
        .catch((err) => log.debug(`upload error: ${err}`))
        .finally(() => {
            client.on_closed && client.on_closed()
            log.info('connection closed')
        })
}

function append_slash(path) {
    if (!path) {
        return '/'
    }
    return path.endsWith('/') ? path : `${path}/`
}

function create_config(ctype, url, uuid) {
    const config = JSON.parse(config_template)
    const vless = config['outbounds'][0]['settings']['vnext'][0]
    const stream = config['outbounds'][0]['streamSettings']

    const host = url.hostname
    vless['users'][0]['id'] = uuid
    vless['address'] = host
    stream['tlsSettings']['serverName'] = host

    const path = append_slash(url.pathname)
    if (ctype === 'ws') {
        delete stream['tlsSettings']['alpn']
        stream['wsSettings'] = {
            path,
            host,
        }
    } else if (ctype === 'xhttp') {
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

    if (url.searchParams.get('fragment') === 'true') {
        config['outbounds'][0]['proxySettings'] = {
            tag: 'direct',
            transportLayer: true,
        }
        config['outbounds'].push({
            tag: 'direct',
            protocol: 'freedom',
            settings: {
                fragment: {
                    packets: 'tlshello',
                    length: '100-200',
                    interval: '10-20',
                },
            },
        })
    }
    stream['network'] = ctype
    return config
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

function get_ip_info(request) {
    const info = {
        ip: request.headers.get('cf-connecting-ip') || '',
        userAgent: request.headers.get('user-agent') || '',
    }

    const keys = [
        'asOrganization',
        'city',
        'continent',
        'country',
        'latitude',
        'longitude',
        'region',
        'regionCode',
        'timezone',
    ]

    const transforms = { asOrganization: 'organization' }
    for (let key of keys) {
        const tkey = transforms[key] || key
        info[tkey] = request.cf[key] || ''
    }
    return info
}

function handle_json(cfg, url, request) {
    if (cfg.IP_QUERY_PATH && request.url.endsWith(cfg.IP_QUERY_PATH)) {
        return get_ip_info(request)
    }

    const path = append_slash(url.pathname)
    if (url.searchParams.get('uuid') === cfg.UUID) {
        if (cfg.XHTTP_PATH && path.endsWith(cfg.XHTTP_PATH)) {
            return create_config('xhttp', url, cfg.UUID)
        }
        if (cfg.WS_PATH && path.endsWith(cfg.WS_PATH)) {
            return create_config('ws', url, cfg.UUID)
        }
    }
    return null
}

function load_settings(env, settings) {
    const cfg = {}
    for (let key in settings) {
        cfg[key] = env[key] || settings[key]
    }
    const features = ['XHTTP_PATH', 'WS_PATH', 'DOH_QUERY_PATH']
    for (let feature of features) {
        cfg[feature] = cfg[feature] && append_slash(cfg[feature])
    }
    return cfg
}

function example(url) {
    const ws_path = random_str(8)
    const xhttp_path = random_str(8)
    const uuid = random_uuid()

    return `Error: UUID is empty

Settings example:
UUID ${uuid}
WS_PATH /${ws_path}
XHTTP_PATH /${xhttp_path}

WebSocket config.json:
${url.origin}/${ws_path}/?fragment=true&uuid=${uuid}

XHTTP config.json:
${url.origin}/${xhttp_path}/?fragment=true&uuid=${uuid}

Refresh this page to re-generate a random settings example.`
}

async function main(request, env) {
    const cfg = load_settings(env, SETTINGS)
    const url = new URL(request.url)
    if (!cfg.UUID) {
        const text = example(url)
        return new Response(text)
    }

    const log = new Logger(cfg.LOG_LEVEL, cfg.TIME_ZONE)
    const path = url.pathname

    if (
        cfg.WS_PATH &&
        request.headers.get('Upgrade') === 'websocket' &&
        path.endsWith(cfg.WS_PATH)
    ) {
        log.info('handle ws client')
        const client = create_ws_client()
        // Do not block here. Client is waiting for upgrade-response.
        handle_client(cfg, log, client).catch((err) =>
            log.error(`handle ws client error: ${err}`),
        )
        return client.resp
    }

    if (
        cfg.XHTTP_PATH &&
        request.method === 'POST' &&
        path.endsWith(cfg.XHTTP_PATH)
    ) {
        log.info('handle xhttp client')
        try {
            const client = create_xhttp_client(cfg, request.body)
            await handle_client(cfg, log, client)
            return client.resp
        } catch (err) {
            log.error(`handle xhttp client error: ${err}`)
        }
        return BAD_REQUEST
    }

    if (cfg.DOH_QUERY_PATH && append_slash(path).endsWith(cfg.DOH_QUERY_PATH)) {
        return handle_doh(log, request, url, cfg.UPSTREAM_DOH)
    }

    if (request.method === 'GET' && !request.headers.get('Upgrade')) {
        const o = handle_json(cfg, url, request)
        if (o) {
            return new Response(JSON.stringify(o), {
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
    pick_random_proxy,
    random_id,
    random_padding,
    validate_uuid,
}

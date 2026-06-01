# FMS2 端到端加密与多 VPS 分布式同步方案

## 目标

FMS2 当前是纯离线 PWA，数据保存在浏览器 IndexedDB 中。后续如果要跨设备同步，同时又不能泄露数据，推荐采用：

```text
本地 IndexedDB 明文使用
  ↓
客户端生成同步事件
  ↓
浏览器端端到端加密
  ↓
多个 VPS 只保存密文事件日志
  ↓
其他设备拉取密文、解密、合并
```

核心原则：

- VPS 不能看到人员姓名、备注、标签、分数、榜单标题等明文。
- 任意一台 VPS 离线或损坏，不影响本地继续使用。
- 多台 VPS 不要求强一致，由客户端负责最终一致同步和修复。
- IndexedDB 仍然是前端业务读取的本地数据源。

## 威胁模型

需要防护：

- VPS 被入侵，数据库被完整复制。
- VPS 运维方读取数据库。
- 某个同步端点丢失部分数据。
- 网络传输被监听。

不完全防护：

- 用户设备被恶意软件控制。
- 用户泄露同步密钥。
- 浏览器本地存储被同设备攻击者读取。
- 同步元数据泄露，例如事件时间、事件数量、密文大小。

因此同步功能必须使用 HTTPS，并且业务数据必须在浏览器端加密后再上传。

## 总体架构

```text
Device A
  Dexie / IndexedDB
  sync_outbox
  sync_event_log
  crypto engine
      ↓ push encrypted events
VPS A
VPS B
VPS C
      ↑ pull encrypted events
Device B
  crypto engine
  merge engine
  Dexie / IndexedDB
```

每台 VPS 都是一个简单的密文事件仓库，不需要互相通信。设备在同步时从所有 VPS 拉取事件，并把缺失事件补推给其他 VPS。

## 为什么不直接用分布式数据库

不建议一开始上 PostgreSQL 主从、Raft、CockroachDB、etcd 这类强一致分布式方案。原因：

- FMS2 是个人/小规模应用，不需要服务器端强一致事务。
- 强一致分布式数据库维护成本高。
- 业务数据需要端到端加密，服务端即使有 SQL 能力也无法理解数据。
- 客户端本来就是离线优先，最终一致更合适。

更推荐：

```text
多个独立 VPS + 加密事件日志 + 客户端合并
```

## 数据同步模型

采用 append-only event log。

每次本地业务变更，生成一个同步事件：

```ts
interface PlainSyncEvent {
  eventId: string;
  deviceId: string;
  recordId: string;
  entityType: "person" | "tag" | "person_tag" | "leaderboard" | "leaderboard_entry" | "settings";
  operation: "upsert" | "delete";
  recordClock: string;
  payload: unknown;
  deletedAt: string | null;
  createdAt: string;
}
```

上传前加密为：

```ts
interface EncryptedSyncEvent {
  eventId: string;
  deviceIdHash: string;
  recordIdHash: string;
  keyVersion: number;
  nonce: string;
  ciphertext: string;
  payloadHash: string;
  createdAt: string;
}
```

说明：

- `eventId` 由客户端生成，推荐 ULID 或 UUID v7。
- `recordClock` 用于冲突处理，推荐 Hybrid Logical Clock；第一版可用 `updatedAt + deviceId`。
- `entityType`、`operation`、`payload` 放入密文，不在服务端明文保存。
- `recordIdHash` 只用于服务端去重和排查，不保存明文 ID。
- 删除也是事件，不做物理删除。

## 加密设计

### 同步密钥

不要只用账号密码加密数据。账号密码只用于登录同步服务。

同步密钥应该独立生成：

```text
256-bit random sync key
```

用户需要在新设备上输入或导入该同步密钥。可以用以下形式呈现：

- 24 个助记词
- 一串 Base64URL 恢复密钥
- 二维码，仅用于设备间迁移

### 密钥派生

推荐：

```text
masterSyncKey
  ↓ HKDF
eventEncryptionKey
```

如果要从用户输入的恢复短语派生密钥，推荐使用 Argon2id。浏览器端可通过可靠 WASM 库实现。第一版也可以直接生成高熵随机密钥，避免弱密码问题。

### 加密算法

浏览器原生 Web Crypto 可用：

```text
AES-256-GCM
```

每条事件使用唯一随机 nonce：

```text
96-bit random nonce
```

注意：

- 同一个 key 下 nonce 不能重复。
- `eventId`、`keyVersion`、`deviceIdHash` 可作为 AAD 参与认证。
- 密文中包含完整业务 payload。

### 服务端可见信息

服务端只能看到：

- eventId
- deviceIdHash
- recordIdHash
- keyVersion
- nonce
- ciphertext
- payloadHash
- createdAt
- serverSeq

服务端不应看到：

- 人员姓名
- 标签名
- 榜单标题
- 分数
- 备注
- entityType
- operation

## 客户端本地表

在现有 Dexie 表之外新增：

```ts
sync_events_local
- eventId
- endpointStatus
- encryptedEvent
- appliedAt
- createdAt

sync_outbox
- eventId
- encryptedEvent
- pendingEndpointIds
- retryCount
- lastError
- createdAt

sync_endpoints
- id
- url
- enabled
- lastPulledCursor
- lastSuccessAt
- lastError

sync_settings
- deviceId
- keyVersion
- syncEnabled
- lastSyncAt
```

业务表仍然保留：

- people
- tags
- person_tags
- leaderboards
- leaderboard_entries
- settings

## 服务端数据结构

每台 VPS 可以先使用 SQLite。个人应用足够简单，也便于备份。

```sql
create table sync_events (
  event_id text primary key,
  user_id_hash text not null,
  device_id_hash text not null,
  record_id_hash text not null,
  key_version integer not null,
  nonce text not null,
  ciphertext text not null,
  payload_hash text not null,
  created_at text not null,
  server_seq integer primary key autoincrement
);

create index idx_sync_events_user_seq
on sync_events (user_id_hash, server_seq);

create index idx_sync_events_record
on sync_events (user_id_hash, record_id_hash);
```

如果 SQLite 不方便一个表两个 primary key，则可改为：

```sql
server_seq integer primary key autoincrement,
event_id text not null unique
```

## 服务端 API

### 登录

```http
POST /auth/login
```

请求：

```json
{
  "username": "user",
  "password": "password"
}
```

响应：

```json
{
  "token": "jwt"
}
```

服务端认证只用于隔离用户空间，不参与数据解密。

### 上传事件

```http
POST /sync/events
Authorization: Bearer <token>
```

请求：

```json
{
  "events": [
    {
      "eventId": "01HX...",
      "deviceIdHash": "...",
      "recordIdHash": "...",
      "keyVersion": 1,
      "nonce": "...",
      "ciphertext": "...",
      "payloadHash": "...",
      "createdAt": "2026-06-01T00:00:00.000Z"
    }
  ]
}
```

响应：

```json
{
  "accepted": ["01HX..."],
  "duplicates": []
}
```

服务端按 `eventId` 去重。重复上传必须是幂等操作。

### 拉取事件

```http
GET /sync/events?after=12345&limit=500
Authorization: Bearer <token>
```

响应：

```json
{
  "events": [
    {
      "serverSeq": 12346,
      "eventId": "01HX...",
      "deviceIdHash": "...",
      "recordIdHash": "...",
      "keyVersion": 1,
      "nonce": "...",
      "ciphertext": "...",
      "payloadHash": "...",
      "createdAt": "2026-06-01T00:00:00.000Z"
    }
  ],
  "nextCursor": 12346
}
```

每个 VPS 的 `serverSeq` 独立存在。客户端为每个 endpoint 分别保存 `lastPulledCursor`。

### 健康检查

```http
GET /health
```

响应：

```json
{
  "ok": true,
  "serverTime": "2026-06-01T00:00:00.000Z"
}
```

## 多 VPS 同步策略

客户端配置多个端点：

```text
https://sync-a.example.com
https://sync-b.example.com
https://sync-c.example.com
```

### Push

本地待上传事件尽量推送到所有启用端点。

策略：

- 成功上传到任意一个端点，即可认为数据已有远端备份。
- 成功上传到多数端点，可显示“同步健康”。
- 部分端点失败时，保留 pending 状态，下次继续补推。

### Pull

客户端从所有启用端点拉取事件：

```text
for endpoint in endpoints:
  pull events after endpoint.lastPulledCursor
```

拉取后：

1. 按 `eventId` 去重。
2. 解密事件。
3. 检查 payloadHash。
4. 应用到本地业务表。
5. 写入 `sync_events_local`。
6. 更新该 endpoint 的 cursor。

### Repair

客户端可以把从 VPS A 拉到、但 VPS B 没有的事件补推到 VPS B。

这使多个 VPS 最终趋于一致：

```text
pull from all
  ↓
local union event set
  ↓
push missing events to all
```

第一版可以不做复杂差异对比，只要本地保存最近 N 条事件并定期补推即可。

## 冲突处理

第一版采用确定性 Last Writer Wins。

比较规则：

```text
recordClock 大者胜出
recordClock 相同则 deviceId 字典序大者胜出
```

同一个 `recordId` 的多条事件按上述规则合并。

删除事件参与同样比较：

```text
如果 delete 事件胜出，本地标记 deletedAt
```

业务层需要从硬删除改为软删除，至少同步层必须保留墓碑信息。

## 与现有业务表的关系

本地业务表仍然是页面读取来源。

同步事件应用到业务表时：

- `person` 事件更新 people。
- `tag` 事件更新 tags。
- `person_tag` 事件更新 person_tags。
- `leaderboard` 事件更新 leaderboards。
- `leaderboard_entry` 事件更新 leaderboard_entries。

为了减少改动，推荐先在 repository 写操作中增加统一 hook：

```text
业务写入成功
  ↓
生成 PlainSyncEvent
  ↓
加密为 EncryptedSyncEvent
  ↓
写 sync_outbox
```

## 备份策略

虽然 VPS 只保存密文，仍然建议做服务端备份。

推荐：

- 每台 VPS 本地 SQLite 文件定时快照。
- 使用 restic 或 borg 做加密备份。
- 可把备份推送到对象存储或另一台 VPS。

备份层也要加密，避免密文事件之外的服务端元数据泄露更多信息。

## VPS 部署建议

第一版可使用：

```text
Node.js/Fastify 或 Go
SQLite
Caddy
Docker Compose
```

示例：

```yaml
services:
  sync-api:
    image: fms2-sync-api:latest
    restart: unless-stopped
    environment:
      DATABASE_PATH: /data/fms2-sync.sqlite
      JWT_SECRET: ${JWT_SECRET}
    volumes:
      - ./data:/data

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./caddy-data:/data
      - ./caddy-config:/config
```

如果 VPS 已绑定域名，`Caddyfile` 可以使用域名，并让 Caddy 自动申请公开可信证书：

```caddyfile
sync-a.example.com {
  reverse_proxy sync-api:3000
}
```

Caddy 可自动处理 HTTPS 证书申请与续期。

## 公网 IP + 自签证书部署

如果 VPS 没有绑定域名，也可以使用：

```text
https://203.0.113.10
https://198.51.100.20
https://192.0.2.30
```

但浏览器和 PWA 对证书非常严格。不能只在浏览器里临时点击“继续访问”，而应该：

1. 自建一个私有 CA。
2. 用该 CA 给每台 VPS 的公网 IP 签发服务端证书。
3. 证书必须包含 IP 类型的 Subject Alternative Name。
4. 把私有 CA 根证书安装到每台客户端设备的系统/浏览器信任库。
5. FMS2 同步端点使用 `https://公网IP`。

原因：

- HTTPS 页面中的 `fetch()` 请求不能访问明文 HTTP API，否则会被浏览器按 mixed content 阻止。
- PWA、Service Worker、Web Crypto 等能力依赖浏览器认可的安全上下文。
- 自签证书如果没有被设备信任，浏览器会拒绝请求，前端代码无法绕过。

### 证书结构

推荐使用“私有 CA + 每台 VPS 一个服务端证书”，不要每台机器直接使用孤立自签 leaf 证书。

```text
FMS2 Sync Root CA
  ├─ sync-vps-a certificate, SAN = IP:203.0.113.10
  ├─ sync-vps-b certificate, SAN = IP:198.51.100.20
  └─ sync-vps-c certificate, SAN = IP:192.0.2.30
```

这样客户端只需要信任一次 `FMS2 Sync Root CA`。之后新增或轮换 VPS 证书时，只要仍由该 CA 签发，客户端无需重新信任每个服务端证书。

### OpenSSL 示例

生成私有 CA：

```bash
openssl genrsa -out fms2-sync-ca.key 4096
openssl req -x509 -new -nodes -key fms2-sync-ca.key -sha256 -days 3650 -out fms2-sync-ca.crt -subj "/CN=FMS2 Sync Root CA"
```

为某台 VPS 创建扩展文件，例如 `sync-a.ext`：

```ini
subjectAltName = IP:203.0.113.10
extendedKeyUsage = serverAuth
```

签发服务端证书：

```bash
openssl genrsa -out sync-a.key 2048
openssl req -new -key sync-a.key -out sync-a.csr -subj "/CN=203.0.113.10"
openssl x509 -req -in sync-a.csr -CA fms2-sync-ca.crt -CAkey fms2-sync-ca.key -CAcreateserial -out sync-a.crt -days 825 -sha256 -extfile sync-a.ext
```

注意：

- `subjectAltName` 必须写公网 IP。
- 如果 VPS 更换公网 IP，需要重新签发该 VPS 证书。
- `fms2-sync-ca.key` 必须离线妥善保存，不能放在 VPS 上。
- VPS 上只需要放 `sync-a.crt` 和 `sync-a.key`。

### Caddy 配置

将证书挂载到容器：

```yaml
services:
  sync-api:
    image: fms2-sync-api:latest
    restart: unless-stopped
    environment:
      DATABASE_PATH: /data/fms2-sync.sqlite
      JWT_SECRET: ${JWT_SECRET}
    volumes:
      - ./data:/data

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./certs:/certs:ro
      - ./caddy-data:/data
      - ./caddy-config:/config
```

`Caddyfile`：

```caddyfile
https://203.0.113.10 {
  tls /certs/sync-a.crt /certs/sync-a.key
  reverse_proxy sync-api:3000
}
```

客户端同步端点配置为：

```text
https://203.0.113.10
```

如果不想占用 443，也可以使用：

```text
https://203.0.113.10:8443
```

但需要同时调整 Caddy 监听地址和 Docker 端口映射。

### 客户端信任安装

每台使用 FMS2 同步的设备都需要安装 `fms2-sync-ca.crt`。

建议：

- Windows：导入到“受信任的根证书颁发机构”。
- macOS：导入钥匙串并设为始终信任。
- Linux：放入系统 CA 目录并更新 CA trust。
- Android/iOS：导入配置文件或证书，并在系统设置中启用信任。

移动端的证书信任流程因系统版本和浏览器不同而不同，后续实现前需要实际测试目标设备。

### 安全建议

- 只开放 443 端口，不暴露数据库端口。
- 同步 API 必须有登录认证。
- 业务数据仍然必须端到端加密，TLS 只保护传输层。
- 每台 VPS 使用不同服务端私钥。
- 定期轮换服务端证书。
- 私有 CA 私钥不要上传到任何 VPS。
- 服务器可增加 rate limit 和失败登录限制。

## 客户端设置页设计

设置页可新增：

- 同步开关
- 设备名称
- 同步密钥创建/导入
- 当前 keyVersion
- 同步端点列表
- 添加/删除 VPS 端点
- 手动同步按钮
- 上次同步时间
- 每个端点的健康状态
- 导出加密恢复包

端点状态示例：

```text
sync-a.example.com  正常  2 分钟前
sync-b.example.com  失败  连接超时
sync-c.example.com  正常  1 小时前
```

## 实施阶段

### 阶段 1：本地同步事件层

- 新增 sync tables。
- repository 写操作生成同步事件。
- 本地保存事件日志。
- 不连接服务器。

### 阶段 2：端到端加密

- 生成同步密钥。
- 实现事件加密/解密。
- 设置页支持导出/导入同步密钥。
- 本地验证加密事件可恢复业务数据。

### 阶段 3：单 VPS 同步服务

- 实现登录。
- 实现 push/pull API。
- 客户端支持一个 endpoint。
- 支持手动同步。

### 阶段 4：多 VPS 同步

- 客户端支持多个 endpoints。
- 每个 endpoint 独立 cursor。
- push 到多个端点。
- pull from all。
- eventId 去重。

### 阶段 5：修复与健康检查

- 端点健康状态。
- 失败重试。
- 缺失事件补推。
- 同步结果摘要。

### 阶段 6：冲突优化

- 第一版使用 Last Writer Wins。
- 后续可增加冲突记录表。
- 对备注、标题等字段提供人工冲突解决。

## 关键风险

- 同步密钥丢失后，远端密文无法恢复。
- 浏览器本地存储仍然有明文 IndexedDB。
- 如果使用弱口令派生密钥，安全性会下降。
- 多 VPS 最终一致不保证实时一致。
- 事件日志长期增长，需要设计压缩或快照。

## 快照与日志压缩

事件日志会不断增长。后续可加入加密快照：

```text
每隔 N 条事件或 N 天
  ↓
生成当前完整业务数据快照
  ↓
客户端加密快照
  ↓
上传 snapshot event
```

新设备初始化时：

1. 拉取最新快照。
2. 解密并导入。
3. 再拉取快照之后的增量事件。

旧事件不能立刻删除，建议保留一段时间，或者等所有设备确认已应用后再清理。

## 推荐结论

FMS2 的同步功能推荐采用：

```text
E2EE encrypted event log
+ client-side merge
+ multi-VPS endpoints
+ local-first Dexie storage
```

这套方案比传统服务端数据库同步更适合 FMS2：

- 隐私更强。
- VPS 不可信也能使用。
- 多 VPS 容灾简单。
- 离线优先体验不变。
- 后续可逐步增强，不需要一次性做复杂分布式系统。

## 参考资料

- [PouchDB Replication Guide](https://pouchdb.com/guides/replication.html)
- [Apache CouchDB Replication](https://docs.couchdb.org/en/stable/replication/intro.html)
- [Apache CouchDB Docker Installation](https://docs.couchdb.org/en/stable/install/docker.html)
- [Apache CouchDB CORS Configuration](https://docs.couchdb.org/en/stable/config/http.html)
- [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [Caddy TLS Directive](https://caddyserver.com/docs/caddyfile/directives/tls)
- [MDN Secure Contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)
- [MDN Mixed Content](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content)
- [MDN SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto)
- [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Dexie Cloud Pricing](https://dexie.org/pricing)
- [Supabase Pricing](https://supabase.com/pricing)

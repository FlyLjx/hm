# Docker 部署

## 默认模式

项目现在默认使用 `Postgres` 作为主库。
仓库已内置一份默认初始化数据，首次启动空白 Postgres 数据卷时会自动导入。

直接启动：

```bash
docker compose pull
docker compose up -d
```

默认会启动：

- `ai-pai-postgres`
- `ai-pai`

默认访问端口：

```text
http://127.0.0.1:6985
```

## 首次迁移旧 MySQL 数据

如果你只是部署最新仓库并接受仓库内默认数据：

```bash
docker compose up -d
```

不需要再额外跑迁移。

如果你还要从旧 MySQL 覆盖导入你自己的历史数据，需要再迁移一次：

1. 确认 `.env` 里两组配置：

Postgres 主库：

```env
DB_DRIVER=postgres
DB_HOST=postgres
DB_PORT=5432
DB_USER=ai_pai
DB_PASSWORD=你的新密码
DB_NAME=ai_pai
DB_SSLMODE=disable
```

旧 MySQL 来源：

```env
MYSQL_HOST=旧MySQL地址
MYSQL_PORT=3306
MYSQL_USER=旧MySQL用户
MYSQL_PASSWORD=旧MySQL密码
MYSQL_DATABASE=旧MySQL库名
```

2. 先启动 Postgres：

```bash
docker compose up -d postgres
```

3. 在本机执行迁移：

Windows：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\postgres-bootstrap.ps1
```

或手动执行：

```powershell
$env:DB_DRIVER='postgres'
$env:DB_HOST='127.0.0.1'
$env:DB_PORT='5432'
$env:DB_USER='ai_pai'
$env:DB_PASSWORD='你的新密码'
$env:DB_NAME='ai_pai'
$env:DB_SSLMODE='disable'
go run ./go-server/cmd/pgmigrate
go run ./go-server/cmd/pgsmoke
docker compose up -d ai-pai
```

说明：

- 迁移会保留业务数据。
- `generation_tasks` 里的图片大字段会清空。
- MySQL 仅作为迁移来源，不再是运行主库。
- 如果你不执行迁移，系统会直接使用仓库内置的默认初始化数据。

## 使用 GitHub 镜像

```bash
docker compose pull
docker compose up -d
```

## 本地构建镜像

如果需要在服务器本地构建：

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

## 一次性代理

如果拉镜像需要代理：

```bash
export HTTP_PROXY="http://192.168.1.5:7897"
export HTTPS_PROXY="http://192.168.1.5:7897"
export NO_PROXY="localhost,127.0.0.1,::1"
export http_proxy="http://192.168.1.5:7897"
export https_proxy="http://192.168.1.5:7897"
export no_proxy="localhost,127.0.0.1,::1"

docker compose pull
docker compose up -d
```

## 宝塔反代

反代到：

```text
http://127.0.0.1:6985
```

并开启 WebSocket。

## 常用命令

```bash
docker compose ps
docker compose logs -f ai-pai
docker compose logs -f postgres
docker compose restart
docker compose down
docker compose pull
docker compose up -d
```

# Docker 部署

## 本地构建

```bash
docker compose build
docker compose up -d
```

## 服务器上

1. 上传整个项目，至少保留这些目录/文件：

```text
apps/
go-server/
public/vendor/
Dockerfile
docker-compose.yml
.env
```

2. 确认 `.env` 里的关键配置：

```env
PORT=3001
SERVE_STATIC=true
PUBLIC_DIR=public
LOG_DIR=logs
TZ=Asia/Shanghai
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=数据库用户
MYSQL_PASSWORD=数据库密码
MYSQL_DATABASE=数据库名
```

如果 MySQL 也跑在 Docker Compose 里，`MYSQL_HOST` 要改成 MySQL 服务名。

3. 启动：

```bash
docker compose up -d --build
```

如果服务器访问 Docker/Go 依赖源较慢或失败，可以临时给构建过程加代理：

```bash
export HTTP_PROXY="http://192.168.1.5:7897"
export HTTPS_PROXY="http://192.168.1.5:7897"
export http_proxy="http://192.168.1.5:7897"
export https_proxy="http://192.168.1.5:7897"

docker compose up -d --build
```

如果是 SOCKS5 代理，把地址改成 `socks5h://192.168.1.5:7897`。代理软件需要开启允许局域网连接。

4. 宝塔网站反向代理到：

```text
http://127.0.0.1:3001
```

同时开启 WebSocket 支持。

## 宝塔 Docker 项目

如果用宝塔面板的 Docker 项目：

1. 新建项目，项目路径选择上传后的项目目录。
2. Compose 文件选择 `docker-compose.yml`。
3. 点击构建/启动。
4. 网站反代到 `127.0.0.1:3001`。

## 说明

- `.env` 通过 compose 的 `env_file` 注入，不会打进镜像。
- `public` 会在镜像构建时从 `apps/web/src` 和 `apps/admin/src` 同步生成。
- `logs` 建议单独挂载，方便看运行日志。
- 镜像和 Compose 默认使用 `Asia/Shanghai`，日志时间会按中国时区输出。
- 不要把 Windows 本机路径放进 Linux Docker 的 `.env`，例如 `E:/...`、`C:/...`。这些要改成容器内路径，或者先删掉不用的配置项。

## 常用命令

```bash
docker compose ps
docker compose logs -f
docker compose restart
docker compose down
docker compose up -d --build
```

# Docker 部署

## 使用 GitHub 镜像

```bash
docker compose pull
docker compose up -d
```

## 服务器上

1. 上传或拉取项目，至少保留这些文件：

```text
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
docker compose pull
docker compose up -d
```

如果服务器拉取 GitHub 镜像较慢或失败，可以只给拉取过程加一次性代理：

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

如果是 SOCKS5 代理，把地址改成 `socks5h://192.168.1.5:7897`。代理软件需要开启允许局域网连接。
服务器默认不再本地构建镜像，所以不需要下载 Go 或 Debian 依赖。

4. 宝塔网站反向代理到：

```text
http://127.0.0.1:6985
```

同时开启 WebSocket 支持。

## 宝塔 Docker 项目

如果用宝塔面板的 Docker 项目：

1. 新建项目，项目路径选择上传后的项目目录。
2. Compose 文件选择 `docker-compose.yml`。
3. 点击拉取/启动。
4. 网站反代到 `127.0.0.1:6985`。

## 说明

- `.env` 通过 compose 的 `env_file` 注入，不会打进镜像。
- 镜像由 GitHub Actions 自动构建并推送到 `ghcr.io/flyljx/hm:latest`。
- 如需在服务器本地构建，使用 `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build`。
- Compose 默认暴露外部端口 `6985`，容器内部仍监听 `3001`。
- `logs` 建议单独挂载，方便看运行日志。
- 镜像和 Compose 默认使用 `Asia/Shanghai`，日志时间会按中国时区输出。
- 不要把 Windows 本机路径放进 Linux Docker 的 `.env`，例如 `E:/...`、`C:/...`。这些要改成容器内路径，或者先删掉不用的配置项。

## 常用命令

```bash
docker compose ps
docker compose logs -f
docker inspect --format='{{json .State.Health}}' aipi-go
docker compose restart
docker compose down
docker compose pull
docker compose up -d
```

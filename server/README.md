# AIπ 后端接口

## 启动

1. 配置 `.env` 的 MySQL 连接信息。

2. 自动初始化数据库和表：

```bash
npm run db:init
```

也可以直接启动后端，启动时会自动执行一次初始化。

3. 复制环境变量：

```bash
cp .env.example .env
```

4. 启动后端：

```bash
npm run dev:server
```

## 用户管理

- `GET /api/users` 用户列表
- `POST /api/users` 创建用户
- `POST /api/users/login` 登录
- `PATCH /api/users/:id/status` 启用/禁用用户
- `DELETE /api/users/:id` 删除用户

创建用户示例：

```json
{
  "email": "admin@example.com",
  "password": "123456",
  "role": "admin"
}
```

## API 接口管理

- `GET /api/api-providers` 接口配置列表
- `POST /api/api-providers` 新增接口配置
- `PATCH /api/api-providers/:id` 修改接口配置
- `DELETE /api/api-providers/:id` 删除接口配置

新增 sub2api 示例：

```json
{
  "name": "sub2api 主接口",
  "type": "sub2api",
  "baseUrl": "https://your-sub2api-domain.example.com/v1",
  "apiKey": "sk-xxxx"
}
```

import 'dotenv/config'

function parseCorsOrigins(value?: string) {
  return (value ?? 'http://localhost:5173')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),
  requestBodyLimit: process.env.REQUEST_BODY_LIMIT ?? '80mb',
  serveStatic: process.env.SERVE_STATIC !== 'false',
  promptReverse: {
    model: process.env.PROMPT_REVERSE_MODEL ?? 'gpt-4o-mini',
    endpoint: process.env.PROMPT_REVERSE_ENDPOINT ?? 'chat_completions',
    messagesVersion: process.env.PROMPT_REVERSE_MESSAGES_VERSION ?? '2023-06-01',
    maxAttempts: Number(process.env.PROMPT_REVERSE_MAX_ATTEMPTS ?? 3),
  },
  accountPool: {
    endpoint: process.env.ACCOUNT_POOL_ENDPOINT ?? 'https://free-api.yccc.me/api/accounts',
    apiKey: process.env.ACCOUNT_POOL_API_KEY ?? '',
    authHeader: process.env.ACCOUNT_POOL_AUTH_HEADER ?? 'Authorization',
  },
  alipay: {
    timeoutMs: Number(process.env.ALIPAY_TIMEOUT_MS ?? 30000),
    proxyUrl: process.env.ALIPAY_PROXY_URL
      ?? process.env.HTTPS_PROXY
      ?? process.env.HTTP_PROXY
      ?? '',
  },
  mysql: {
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    rootUser: process.env.MYSQL_ROOT_USER ?? process.env.MYSQL_USER ?? 'root',
    rootPassword: process.env.MYSQL_ROOT_PASSWORD ?? process.env.MYSQL_PASSWORD ?? '',
    user: process.env.MYSQL_USER ?? 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE ?? 'aipi',
  },
}

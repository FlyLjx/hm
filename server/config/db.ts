import mysql from 'mysql2/promise'
import { env } from './env.js'

export const rootDb = mysql.createPool({
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.user,
  password: env.mysql.password,
  waitForConnections: true,
  connectionLimit: 3,
  namedPlaceholders: true,
})

export const db = mysql.createPool({
  ...env.mysql,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
})

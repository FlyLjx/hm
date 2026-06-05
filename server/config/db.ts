import mysql from 'mysql2/promise'
import { env } from './env.js'

export const rootDb = mysql.createPool({
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.rootUser,
  password: env.mysql.rootPassword,
  waitForConnections: true,
  connectionLimit: 3,
  namedPlaceholders: true,
})

export const db = mysql.createPool({
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.user,
  password: env.mysql.password,
  database: env.mysql.database,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
})

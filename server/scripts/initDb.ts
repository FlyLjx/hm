import { initializeDatabase } from '../config/migrate.js'

initializeDatabase()
  .then(() => {
    console.log('数据库初始化完成')
    process.exit(0)
  })
  .catch((error) => {
    console.error('数据库初始化失败')
    console.error(error)
    process.exit(1)
  })

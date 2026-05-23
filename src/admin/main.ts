import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '../index.css'
import './admin.css'
import AdminApp from './AdminApp.vue'

createApp(AdminApp).use(ElementPlus).mount('#admin-root')

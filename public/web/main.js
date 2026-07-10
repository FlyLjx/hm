import { RootApp } from './components/rootApp.js?v=20260710-api-access-v18'

const app = Vue.createApp(RootApp)

app.use(antd)
installElementCompat(app)
app.mount('#app')

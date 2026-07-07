import { RootApp } from './components/rootApp.js?v=20260707-subscription-dialog-compact-v1'

const app = Vue.createApp(RootApp)

app.use(antd)
installElementCompat(app)
app.mount('#app')

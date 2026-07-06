import { RootApp } from './components/rootApp.js?v=20260706-mobile-fit-v7'

const app = Vue.createApp(RootApp)

app.use(antd)
installElementCompat(app)
app.mount('#app')

import { RootApp } from './components/rootApp.js'

const app = Vue.createApp(RootApp)

app.use(antd)
installElementCompat(app)
app.mount('#app')

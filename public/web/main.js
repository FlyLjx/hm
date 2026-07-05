import { RootApp } from './components/rootApp.js?v=20260705-ai-pai-display-v1'

const app = Vue.createApp(RootApp)

app.use(antd)
installElementCompat(app)
app.mount('#app')


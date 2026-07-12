const entryUrl = new URL(import.meta.url)
const entryVersion = entryUrl.searchParams.get('v') || 'dev'
const { RootApp } = await import(`./components/rootApp.js?v=${encodeURIComponent(entryVersion)}`)

const app = Vue.createApp(RootApp)

app.use(antd)
installElementCompat(app)
app.mount('#app')

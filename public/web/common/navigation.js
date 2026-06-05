export function pageFromHash() {
  const page = window.location.hash.replace(/^#\/?/, '')
  return ['home', 'chat', 'reverse', 'plaza'].includes(page) ? page : 'home'
}

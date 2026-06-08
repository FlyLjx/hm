export function pageFromHash() {
  const page = window.location.hash.replace(/^#\/?/, '')
  if (page === 'favorites') return 'history'
  return ['home', 'chat', 'reverse', 'plaza', 'history', 'docs', 'status', 'profile'].includes(page) ? page : 'home'
}

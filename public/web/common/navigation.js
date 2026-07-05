export function pageFromHash() {
  const page = window.location.hash.replace(/^#\/?/, '')
  if (page === 'favorites') return 'history'
  return ['home', 'announcements', 'chat', 'plaza', 'history', 'profile', 'invite'].includes(page) ? page : 'home'
}

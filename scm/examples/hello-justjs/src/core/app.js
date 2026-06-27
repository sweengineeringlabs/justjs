import { observer } from './observability.js'
import '../components/counter.js'
import '../components/fetch-demo.js'
import '../components/form-demo.js'

observer.log('Boot', '→', { event: 'app_init', layers: ['Network', 'Transport', 'Application', 'Data'] })

document.addEventListener('DOMContentLoaded', () => {
  observer.log('Application', '→', { event: 'dom_ready' })

  const navButtons = document.querySelectorAll('.nav-btn')
  const pages = document.querySelectorAll('.page')

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page

      observer.log('Application', '→', { event: 'route_change', to: page })

      pages.forEach((p) => (p.style.display = 'none'))
      navButtons.forEach((b) => b.classList.remove('active'))

      document.getElementById(`${page}-page`).style.display = 'block'
      btn.classList.add('active')
    })
  })

  observer.log('Application', '←', { event: 'app_ready', routes: ['counter', 'fetch', 'form'] })
})

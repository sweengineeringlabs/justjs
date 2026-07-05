import { observer } from './observability.js'
import { boot } from './app.gen.ts'
import { ROUTES, REGISTRY, DOM_ADDRESS_MAP } from './manifest.js'
import '../components/counter.js'
import '../components/fetch-demo.js'
import '../components/form-demo.js'

observer.log('Boot', '→', { event: 'app_init', layers: ['Network', 'Transport', 'Application', 'Data'] })

// Proves the vite-plugin -> generated app.gen.ts -> JustJS.boot() pipeline
// (ADR-0001 §Strategy configuration) actually runs, not just typechecks.
// routes/registry/domAddressMap stand in for justweb-generated artifacts
// this demo doesn't produce - see src/core/manifest.js and justjs#37.
try {
  await boot({ routes: ROUTES, registry: REGISTRY, domAddressMap: DOM_ADDRESS_MAP })
  observer.log('Boot', '←', { event: 'justjs_boot_succeeded' })
} catch (error) {
  observer.log('Boot', '✗', { event: 'justjs_boot_failed', message: String(error) })
  throw error
}

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

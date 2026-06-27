import { store } from '../core/state.js'
import { logApplicationLayer } from '../core/observability.js'

class FetchDemoComponent extends HTMLElement {
  connectedCallback() {
    logApplicationLayer('→', { event: 'component_mount', component: 'fetch-demo' })
    this.render()
    this.unsubscribe = store.subscribe(() => this.render())
  }

  disconnectedCallback() {
    if (this.unsubscribe) this.unsubscribe()
  }

  render() {
    const state = store.getState()

    this.innerHTML = `
      <div>
        <h2>Fetch Data Component</h2>
        <p style="color: #666; margin-bottom: 20px;">
          Shows data flowing through all 4 layers: Network → Transport → Application → Data
        </p>

        <button id="fetch-btn" ${state.loading ? 'disabled' : ''} style="width: 100%; padding: 15px;">
          ${state.loading ? '⏳ Loading...' : '📡 Fetch Random User'}
        </button>

        ${
          state.fetchData
            ? `
          <div class="fetch-result">
            <h3>✓ Data Received</h3>
            <pre><strong>Name:</strong> ${state.fetchData.name}
<strong>Email:</strong> ${state.fetchData.email}
<strong>Phone:</strong> ${state.fetchData.phone}
<strong>Website:</strong> ${state.fetchData.website}</pre>
          </div>
        `
            : ''
        }

        <div style="margin-top: 20px; padding: 15px; background: #f0f0f0; border-radius: 6px; font-size: 13px; line-height: 1.6;">
          <strong>Data Flow:</strong>
          <br/>1. <span style="color: #667eea;"><strong>Network</strong></span> layer: HTTP request to API
          <br/>2. <span style="color: #667eea;"><strong>Transport</strong></span> layer: Parse JSON response
          <br/>3. <span style="color: #667eea;"><strong>Application</strong></span> layer: Process data
          <br/>4. <span style="color: #667eea;"><strong>Data</strong></span> layer: Store in state
          <br/>5. Component re-renders with new data
        </div>
      </div>
    `

    const fetchBtn = this.querySelector('#fetch-btn')
    if (fetchBtn && !state.loading) {
      fetchBtn.addEventListener('click', () => {
        logApplicationLayer('→', { event: 'user_click', action: 'fetch_user' })
        store.fetchRandomUser()
      })
    }
  }
}

customElements.define('x-fetch', FetchDemoComponent)

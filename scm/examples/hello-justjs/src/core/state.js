import { logDataLayer, logApplicationLayer } from './observability.js'

class StateStore {
  constructor() {
    this.state = {
      counter: 0,
      fetchData: null,
      loading: false,
    }
    this.listeners = new Set()
  }

  subscribe(callback) {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  _notify() {
    logDataLayer('→', this.state)
    this.listeners.forEach((callback) => callback(this.state))
  }

  incrementCounter() {
    logApplicationLayer('→', { action: 'increment_counter' })
    this.state.counter++
    logDataLayer('←', { counter: this.state.counter }, 'state-mutation')
    this._notify()
  }

  decrementCounter() {
    logApplicationLayer('→', { action: 'decrement_counter' })
    this.state.counter--
    logDataLayer('←', { counter: this.state.counter }, 'state-mutation')
    this._notify()
  }

  async fetchRandomUser() {
    logApplicationLayer('→', { action: 'fetch_user' })
    this.state.loading = true
    this._notify()

    try {
      // justjs#155: this originally called jsonplaceholder.typicode.com
      // directly from the browser -- a stand-in specifically because
      // there was no real backend. Now that edge-bootstrap IS the
      // backend, it serves this data itself (scm/examples/
      // hello-justjs-backend.rs), not a forward to the same placeholder
      // -- no network egress happens anywhere in this call anymore, and
      // the response is plain JSON, no envelope to unwrap.
      const backendUrl = '/api/hello-justjs/user'
      logNetworkLayer('→', { method: 'POST', url: backendUrl }, 'network-request')

      const response = await fetch(backendUrl, { method: 'POST' })
      const data = await response.json()

      logNetworkLayer('←', { status: response.status, dataSize: JSON.stringify(data).length }, 'network-response')
      logTransportLayer('→', { parsed: true, fields: Object.keys(data).length })

      this.state.fetchData = data
      this.state.loading = false

      logDataLayer('←', { user: data.name }, 'api-response')
      this._notify()
    } catch (error) {
      this.state.loading = false
      logDataLayer('←', { error: error.message }, 'error')
      this._notify()
    }
  }

  getState() {
    return this.state
  }
}

export const store = new StateStore()

import { logNetworkLayer, logTransportLayer } from './observability.js'

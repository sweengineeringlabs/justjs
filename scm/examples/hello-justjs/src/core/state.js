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
      logNetworkLayer('→', { method: 'GET', url: 'https://jsonplaceholder.typicode.com/users/1' }, 'network-request')

      const response = await fetch('https://jsonplaceholder.typicode.com/users/1')
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

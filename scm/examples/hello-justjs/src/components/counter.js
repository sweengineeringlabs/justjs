import { store } from '../core/state.js'
import { logApplicationLayer } from '../core/observability.js'

class CounterComponent extends HTMLElement {
  connectedCallback() {
    logApplicationLayer('→', { event: 'component_mount', component: 'counter' })
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
        <h2>Counter Component</h2>
        <p style="color: #666; margin-bottom: 20px;">
          Shows data flowing through: Application → Data layers
        </p>

        <div class="counter-display" id="counter-value">${state.counter}</div>

        <div class="button-group">
          <button id="decrement">− Decrement</button>
          <button id="reset">↻ Reset</button>
          <button id="increment">+ Increment</button>
        </div>

        <div style="margin-top: 20px; padding: 15px; background: #f0f0f0; border-radius: 6px; font-size: 14px;">
          <strong>Data Flow:</strong> User click → Application layer processes action → Data layer updates state → Component re-renders
        </div>
      </div>
    `

    this.querySelector('#increment').addEventListener('click', () => {
      logApplicationLayer('→', { event: 'user_click', action: 'increment' })
      store.incrementCounter()
    })

    this.querySelector('#decrement').addEventListener('click', () => {
      logApplicationLayer('→', { event: 'user_click', action: 'decrement' })
      store.decrementCounter()
    })

    this.querySelector('#reset').addEventListener('click', () => {
      logApplicationLayer('→', { event: 'user_click', action: 'reset' })
      store.state.counter = 0
      store._notify()
    })
  }
}

customElements.define('x-counter', CounterComponent)

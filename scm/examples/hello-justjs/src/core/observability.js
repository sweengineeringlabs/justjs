class DataFlowObserver {
  constructor() {
    this.logs = []
    this.maxLogs = 50
    this.logPanel = null
  }

  init(logPanelId) {
    this.logPanel = document.getElementById(logPanelId)
  }

  log(layer, direction, data, aspect = null) {
    const timestamp = new Date().toLocaleTimeString()
    const aspectStr = aspect ? ` [${aspect}]` : ''
    const entry = {
      timestamp,
      layer,
      direction,
      data,
      aspect,
    }

    this.logs.unshift(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs.pop()
    }

    this._render()
    console.log(`[${timestamp}] ${layer} ${direction} ${JSON.stringify(data)}${aspectStr}`)
  }

  _render() {
    if (!this.logPanel) return

    const html = this.logs
      .map((entry) => {
        const arrow = entry.direction === '→' ? '→' : '←'
        return `<div class="log-entry">
          <span class="log-layer">${entry.layer} ${arrow}</span>
          <span class="log-data">${JSON.stringify(entry.data).substring(0, 80)}</span>
          ${entry.aspect ? `<span style="color: #999;">[${entry.aspect}]</span>` : ''}
        </div>`
      })
      .join('')

    this.logPanel.innerHTML = html
  }
}

export const observer = new DataFlowObserver()

// Only init in browser environment
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    observer.init('log-output')
  })
}

export const logNetworkLayer = (direction, data, aspect) =>
  observer.log('Network', direction, data, aspect)
export const logTransportLayer = (direction, data, aspect) =>
  observer.log('Transport', direction, data, aspect)
export const logApplicationLayer = (direction, data, aspect) =>
  observer.log('Application', direction, data, aspect)
export const logDataLayer = (direction, data, aspect) =>
  observer.log('Data', direction, data, aspect)

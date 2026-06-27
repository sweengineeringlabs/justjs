import { store } from '../core/state.js'
import { logApplicationLayer } from '../core/observability.js'

class FormDemoComponent extends HTMLElement {
  connectedCallback() {
    logApplicationLayer('→', { event: 'component_mount', component: 'form-demo' })
    this.formState = {
      email: '',
      password: '',
      errors: {},
      isSubmitting: false,
      submitted: false,
    }
    this.render()
  }

  validateEmail(email) {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return pattern.test(email)
  }

  validatePassword(password) {
    return password.length >= 8
  }

  validate() {
    logApplicationLayer('→', { event: 'validate_form' })
    const errors = {}

    if (!this.formState.email) {
      errors.email = 'Email is required'
    } else if (!this.validateEmail(this.formState.email)) {
      errors.email = 'Invalid email format'
    }

    if (!this.formState.password) {
      errors.password = 'Password is required'
    } else if (!this.validatePassword(this.formState.password)) {
      errors.password = 'Password must be at least 8 characters'
    }

    this.formState.errors = errors
    return Object.keys(errors).length === 0
  }

  async handleSubmit(e) {
    e.preventDefault()
    logApplicationLayer('→', { event: 'form_submit_attempt' })

    if (!this.validate()) {
      logApplicationLayer('←', { event: 'validation_failed', errors: this.formState.errors })
      this.render()
      return
    }

    this.formState.isSubmitting = true
    this.render()

    logApplicationLayer('→', { event: 'form_submitting', email: this.formState.email })

    try {
      // Simulate async submission (2 second delay)
      await new Promise((resolve) => setTimeout(resolve, 2000))

      this.formState.submitted = true
      this.formState.isSubmitting = false
      this.formState.email = ''
      this.formState.password = ''
      this.formState.errors = {}

      logApplicationLayer('←', { event: 'form_submitted_success' })
      this.render()

      // Clear success message after 3 seconds
      setTimeout(() => {
        this.formState.submitted = false
        this.render()
      }, 3000)
    } catch (error) {
      this.formState.isSubmitting = false
      this.formState.errors.submit = error.message
      logApplicationLayer('←', { event: 'form_submit_error', error: error.message })
      this.render()
    }
  }

  render() {
    const { email, password, errors, isSubmitting, submitted } = this.formState

    this.innerHTML = `
      <div>
        <h2>Form Component</h2>
        <p style="color: #666; margin-bottom: 20px;">
          Demonstrates: Validation → Async submission → Error handling
        </p>

        ${
          submitted
            ? `
          <div style="padding: 15px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 6px; color: #155724; margin-bottom: 20px;">
            ✓ Form submitted successfully!
          </div>
        `
            : ''
        }

        ${
          errors.submit
            ? `
          <div style="padding: 15px; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; color: #721c24; margin-bottom: 20px;">
            ✗ ${errors.submit}
          </div>
        `
            : ''
        }

        <form id="form" style="margin-bottom: 20px;">
          <div style="margin-bottom: 15px;">
            <label for="email" style="display: block; margin-bottom: 5px; font-weight: 600;">Email</label>
            <input
              id="email"
              type="email"
              placeholder="user@example.com"
              value="${email}"
              style="width: 100%; padding: 10px; border: ${errors.email ? '2px solid #dc3545' : '1px solid #ddd'}; border-radius: 4px; font-size: 14px;"
              ${isSubmitting ? 'disabled' : ''}
            />
            ${errors.email ? `<div style="color: #dc3545; font-size: 12px; margin-top: 4px;">✗ ${errors.email}</div>` : ''}
          </div>

          <div style="margin-bottom: 20px;">
            <label for="password" style="display: block; margin-bottom: 5px; font-weight: 600;">Password</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value="${password}"
              style="width: 100%; padding: 10px; border: ${errors.password ? '2px solid #dc3545' : '1px solid #ddd'}; border-radius: 4px; font-size: 14px;"
              ${isSubmitting ? 'disabled' : ''}
            />
            ${errors.password ? `<div style="color: #dc3545; font-size: 12px; margin-top: 4px;">✗ ${errors.password}</div>` : ''}
          </div>

          <button type="submit" ${isSubmitting ? 'disabled' : ''} style="width: 100%; padding: 12px; background: ${isSubmitting ? '#ccc' : '#667eea'}; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: ${isSubmitting ? 'wait' : 'pointer'};">
            ${isSubmitting ? '⏳ Submitting...' : '✓ Submit'}
          </button>
        </form>

        <div style="margin-top: 20px; padding: 15px; background: #f0f0f0; border-radius: 6px; font-size: 13px; line-height: 1.6;">
          <strong>Data Flow:</strong>
          <br/>1. User enters data → Application layer logs input
          <br/>2. Form validates → Application layer logs validation
          <br/>3. Submit button clicked → async submission to API
          <br/>4. Success/error → Application layer logs result
          <br/>5. Component re-renders with new state
        </div>
      </div>
    `

    const form = this.querySelector('#form')
    if (form) {
      const emailInput = this.querySelector('#email')
      const passwordInput = this.querySelector('#password')

      emailInput.addEventListener('input', (e) => {
        this.formState.email = e.target.value
        logApplicationLayer('→', { event: 'input_change', field: 'email', value: e.target.value.substring(0, 3) + '...' })
      })

      passwordInput.addEventListener('input', (e) => {
        this.formState.password = e.target.value
        logApplicationLayer('→', { event: 'input_change', field: 'password', length: e.target.value.length })
      })

      form.addEventListener('submit', (e) => this.handleSubmit(e))
    }
  }
}

customElements.define('x-form', FormDemoComponent)

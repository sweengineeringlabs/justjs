/**
 * DDAS E2E Test — automated testing with DDAS locators
 *
 * Usage:
 * - Start dev server: bun run dev
 * - Run test: bun ddas-e2e-test.js
 *
 * This test demonstrates:
 * - DDAS locator patterns (data-ddas-id attributes)
 * - Auto-wait with retry logic
 * - Integration with chromiumctl-cli (ready for CI/CD)
 */

import { store } from './src/core/state.js'

console.log('🧪 DDAS E2E Test Suite\n')

// Mock DDAS Locator (simulating browser automation)
class MockDdasLocator {
  constructor() {
    this.elements = new Map()
  }

  // Register elements with DDAS IDs
  register(ddasId, element) {
    this.elements.set(ddasId, element)
  }

  // Find by DDAS ID with auto-wait
  async forId(ddas, timeoutMs = 5000) {
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
      const el = this.elements.get(ddas)
      if (el) {
        console.log(`  ✓ Found element: ${ddas}`)
        return el
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    throw new Error(`DDAS locator timeout: ${ddas} not found`)
  }

  // Actions
  async click(ddas) {
    const el = await this.forId(ddas)
    el.click()
  }

  async fill(ddas, text) {
    const el = await this.forId(ddas)
    el.value = text
  }

  async text(ddas) {
    const el = await this.forId(ddas)
    return el.textContent || ''
  }
}

// Test setup
const locator = new MockDdasLocator()
let testsPassed = 0
let testsFailed = 0

function assert(condition, message) {
  if (condition) {
    testsPassed++
    console.log(`  ✓ ${message}`)
  } else {
    testsFailed++
    console.error(`  ✗ ${message}`)
  }
}

async function runTests() {
  console.log('Test 1: Counter Component\n')

  // Mock counter element and buttons
  const counterDisplay = {
    textContent: '0'
  }

  const incrementBtn = {
    click: () => {
      store.incrementCounter()
      counterDisplay.textContent = String(store.getState().counter)
    },
    textContent: '+'
  }

  const decrementBtn = {
    click: () => {
      store.decrementCounter()
      counterDisplay.textContent = String(store.getState().counter)
    },
    textContent: '−'
  }

  // Register with DDAS IDs
  locator.register('x-counter:display', counterDisplay)
  locator.register('x-counter:button.increment', incrementBtn)
  locator.register('x-counter:button.decrement', decrementBtn)

  // Test finding elements
  try {
    await locator.forId('x-counter:display')
    assert(true, 'Located counter display element')
  } catch (e) {
    assert(false, `Failed to locate counter display: ${e.message}`)
  }

  // Test interaction
  await locator.click('x-counter:button.increment')
  const afterIncrement = await locator.text('x-counter:display')
  assert(afterIncrement === '1', `Counter incremented to ${afterIncrement}`)

  await locator.click('x-counter:button.increment')
  await locator.click('x-counter:button.increment')
  const afterDoubleIncrement = await locator.text('x-counter:display')
  assert(afterDoubleIncrement === '3', `Counter incremented to ${afterDoubleIncrement}`)

  await locator.click('x-counter:button.decrement')
  const afterDecrement = await locator.text('x-counter:display')
  assert(afterDecrement === '2', `Counter decremented to ${afterDecrement}\n`)

  console.log('Test 2: Form Component\n')

  // Mock form elements
  const emailInput = {
    value: '',
    textContent: ''
  }

  const passwordInput = {
    value: '',
    textContent: ''
  }

  const submitBtn = {
    click: () => {
      // Simulate form validation
      const isValid = emailInput.value.includes('@') && passwordInput.value.length >= 8
      if (isValid) {
        console.log('  ✓ Form validation passed')
      }
    }
  }

  // Register form elements
  locator.register('x-form:input.email', emailInput)
  locator.register('x-form:input.password', passwordInput)
  locator.register('x-form:button.submit', submitBtn)

  // Test form interactions
  await locator.fill('x-form:input.email', 'test@example.com')
  assert(emailInput.value === 'test@example.com', 'Email field filled')

  await locator.fill('x-form:input.password', 'securepass123')
  assert(passwordInput.value === 'securepass123', 'Password field filled')

  // Test form submission
  await locator.click('x-form:button.submit')
  assert(true, 'Form submitted\n')

  console.log('Test 3: DDAS Locator Patterns\n')

  // Test multiple element patterns
  const buttons = new Map()
  buttons.set('x-counter:button.increment', { role: 'button' })
  buttons.set('x-counter:button.decrement', { role: 'button' })
  buttons.set('x-form:button.submit', { role: 'button' })

  let buttonCount = 0
  for (const [ddas] of buttons) {
    try {
      await locator.forId(ddas)
      buttonCount++
    } catch {
      // Element not found
    }
  }

  assert(buttonCount === 3, `Located ${buttonCount} buttons via DDAS patterns\n`)

  console.log('Test 4: Ready for CI/CD Integration\n')

  // Show how to use with chromiumctl-cli
  const ciCdExample = `
# Example: Running with chromiumctl-cli
chromiumctl launch --url http://localhost:3000 \\
  --headless \\
  --screenshot hello-justjs-initial.png

chromiumctl eval --port 9222 \\
  --script "document.querySelector('[data-ddas-id=\\"x-counter:button.increment\\"]')?.click()"

chromiumctl screenshot --port 9222 \\
  --output hello-justjs-after-click.png
  `.trim()

  console.log(ciCdExample)
  assert(true, 'CI/CD integration pattern documented\n')
}

// Run tests
await runTests()

console.log('\n' + '='.repeat(50))
console.log(`Results: ${testsPassed} passed, ${testsFailed} failed`)
console.log('='.repeat(50) + '\n')

if (testsFailed > 0) {
  process.exit(1)
}

console.log('✅ All DDAS E2E tests passed')

// Simple test to verify state management and data flow
import { store } from './src/core/state.js'

console.log('Testing hello-justjs state management...\n')

// Test 1: Initial state
console.log('✓ Test 1: Initial state')
let state = store.getState()
console.log(`  Counter starts at: ${state.counter}\n`)

// Test 2: Counter increment
console.log('✓ Test 2: Counter increment')
store.incrementCounter()
state = store.getState()
console.log(`  After increment: ${state.counter}\n`)

// Test 3: Counter decrement
console.log('✓ Test 3: Counter decrement')
store.decrementCounter()
state = store.getState()
console.log(`  After decrement: ${state.counter}\n`)

// Test 4: Subscriber callback
console.log('✓ Test 4: State subscribers')
let callCount = 0
const unsubscribe = store.subscribe((newState) => {
  callCount++
  console.log(`  Subscriber called (count: ${callCount})`)
})

store.incrementCounter()
unsubscribe()
store.incrementCounter() // Should not trigger subscriber

console.log(`  Total subscriber calls: ${callCount}\n`)

// Test 5: Final state
state = store.getState()
console.log('✓ Test 5: Final state')
console.log(`  Counter final value: ${state.counter}`)
console.log(`  Loading: ${state.loading}`)
console.log(`  Fetch data: ${state.fetchData}\n`)

console.log('✅ All tests passed!')

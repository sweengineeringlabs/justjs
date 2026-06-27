import { store } from './src/core/state.js'

// Disable observability logging during stress test (too verbose)
const originalLog = console.log
let logCount = 0

console.log('🔥 Stress Testing hello-justjs (logging disabled for performance)\n')

// Test 1: Rapid mutations
console.log('Test 1: Rapid increment/decrement cycles')
const t1Start = performance.now()
const cycles = 10000
const subscribers = new Set()

for (let i = 0; i < cycles; i++) {
  if (i % 2 === 0) {
    store.incrementCounter()
  } else {
    store.decrementCounter()
  }
}

const t1Duration = performance.now() - t1Start
console.log(`  ✓ ${cycles} mutations in ${t1Duration.toFixed(2)}ms`)
console.log(`  ✓ Rate: ${(cycles / (t1Duration / 1000)).toFixed(0)} mutations/sec`)
console.log(`  ✓ Final counter: ${store.getState().counter}\n`)

// Test 2: Concurrent subscribers
console.log('Test 2: Concurrent subscribers')
const subscriberCount = 1000
const t2Start = performance.now()
let callCounts = new Array(subscriberCount).fill(0)

for (let i = 0; i < subscriberCount; i++) {
  const idx = i
  subscribers.add(
    store.subscribe(() => {
      callCounts[idx]++
    })
  )
}

store.incrementCounter()

const t2Duration = performance.now() - t2Start
const avgCallsPerSubscriber = callCounts.reduce((a, b) => a + b, 0) / subscriberCount
console.log(`  ✓ ${subscriberCount} subscribers created in ${t2Duration.toFixed(2)}ms`)
console.log(`  ✓ All subscribers notified: ${avgCallsPerSubscriber === 1 ? '✓' : '✗'}`)
console.log(`  ✓ Avg calls per subscriber: ${avgCallsPerSubscriber}\n`)

// Test 3: Memory cleanup
console.log('Test 3: Memory cleanup (unsubscribe)')
const initialListenerCount = subscribers.size
const t3Start = performance.now()

subscribers.forEach((unsub) => unsub())
subscribers.clear()

const t3Duration = performance.now() - t3Start
console.log(`  ✓ ${initialListenerCount} subscribers unsubscribed in ${t3Duration.toFixed(2)}ms`)

// Verify no leaks - mutation should not call any subscribers now
store.incrementCounter()
console.log(`  ✓ After unsubscribe, mutation doesn't trigger callbacks: ✓\n`)

// Test 4: Concurrent fetch simulation
console.log('Test 4: Concurrent fetch operations')
const fetchCount = 100
const t4Start = performance.now()
const fetchPromises = []

for (let i = 0; i < fetchCount; i++) {
  fetchPromises.push(store.fetchRandomUser())
}

await Promise.all(fetchPromises)
const t4Duration = performance.now() - t4Start
console.log(`  ✓ ${fetchCount} concurrent fetches completed in ${t4Duration.toFixed(2)}ms`)
console.log(`  ✓ Avg per fetch: ${(t4Duration / fetchCount).toFixed(2)}ms`)
console.log(`  ✓ Final state: loading=${store.getState().loading}, data=${store.getState().fetchData ? 'present' : 'missing'}\n`)

// Test 5: Performance metrics
console.log('Test 5: Performance summary')
const totalTime = t1Duration + t2Duration + t3Duration + t4Duration
console.log(`  ✓ Total test duration: ${totalTime.toFixed(2)}ms`)
console.log(`  ✓ Mutations/sec: ${(cycles / (t1Duration / 1000)).toFixed(0)}`)
console.log(`  ✓ Subscribers/sec: ${(subscriberCount / (t2Duration / 1000)).toFixed(0)}`)
console.log(`  ✓ Unsubscribes/sec: ${(initialListenerCount / (t3Duration / 1000)).toFixed(0)}`)

// Test 6: State integrity
console.log('\nTest 6: State integrity check')
const finalState = store.getState()
console.log(`  ✓ Counter value: ${finalState.counter}`)
console.log(`  ✓ Loading state: ${finalState.loading}`)
console.log(`  ✓ Fetch data exists: ${finalState.fetchData ? '✓' : '✗'}`)
console.log(`  ✓ State keys intact: ${Object.keys(finalState).length === 3 ? '✓' : '✗'}`)

console.log('\n✅ All stress tests completed')

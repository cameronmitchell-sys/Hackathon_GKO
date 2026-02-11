// Test file to verify Sentry-GitHub integration and Seer code review
import * as Sentry from '@sentry/nextjs'

export function testFunction(data: any) {
  // Deliberate bug #1: No null check before accessing property
  const result = data.value.toString()

  // Deliberate bug #2: Empty catch block (swallowed error)
  try {
    JSON.parse(result)
  } catch (error) {
    // Empty catch - Seer should flag this
  }

  // Deliberate bug #3: Unsafe type assertion
  const userId = (data as any).user.id

  return userId
}

export async function testAsyncFunction(url: string) {
  // Deliberate bug #4: No error handling
  const response = await fetch(url)
  const data = await response.json()

  // Deliberate bug #5: Missing null check
  return data.items[0].name
}

// Deliberate bug #6: Incorrect Sentry usage (if metrics API was available)
export function trackEvent() {
  // This would be incorrect if we were using metrics
  // Sentry.metrics.increment('test.event') // Missing value parameter
}

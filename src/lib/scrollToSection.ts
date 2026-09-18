function resolveFocusTarget(element: HTMLElement): HTMLElement {
  if (element.hasAttribute('tabindex')) return element

  const nested = element.querySelector<HTMLElement>(
    'h1[tabindex], h2[tabindex], h3[tabindex], [tabindex="-1"]',
  )
  if (nested) return nested

  element.tabIndex = -1
  return element
}

export function scrollToSection(id: string, focus = true) {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLElement)) return

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  element.scrollIntoView({
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
    block: 'start',
  })

  if (!focus) return

  const target = resolveFocusTarget(element)
  window.requestAnimationFrame(() => {
    target.focus({ preventScroll: true })
  })
}

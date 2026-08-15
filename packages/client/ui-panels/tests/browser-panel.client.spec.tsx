// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BrowserPanel, type BrowserPanelProps } from '../src/client/BrowserPanel.tsx'
import { en, type PanelsLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: PanelsLocaleKey): string => en[key]) as BrowserPanelProps['t']

function renderPanel(): void {
  render(<BrowserPanel t={t} />)
}

function frame(): HTMLIFrameElement {
  return screen.getByTitle(en.panelBrowser) as HTMLIFrameElement
}

function submitUrl(value: string): void {
  const input = screen.getByRole<HTMLInputElement>('textbox', { name: en.browserAddress })
  fireEvent.change(input, { target: { value } })
  fireEvent.submit(input.closest('form') as HTMLFormElement)
}

describe('BrowserPanel', () => {
  it('shows the start hint and disables navigation before any URL is entered', () => {
    renderPanel()
    expect(screen.getByText(en.browserEmpty)).toBeTruthy()
    expect(screen.queryByTitle(en.panelBrowser)).toBeNull()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: en.browserBack }).disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: en.browserForward }).disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: en.browserReload }).disabled).toBe(true)
    expect(screen.queryByRole('link', { name: en.browserOpenExternal })).toBeNull()
  })

  it('navigates to an https URL on submit and renders the frame', () => {
    renderPanel()
    submitUrl('example.com')
    expect(frame().getAttribute('src')).toBe('https://example.com')
    expect(screen.queryByText(en.browserEmpty)).toBeNull()
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: en.browserAddress }).value).toBe('https://example.com')
  })

  it('keeps an explicit http(s) URL unchanged', () => {
    renderPanel()
    submitUrl('https://example.org/path?q=1')
    expect(frame().getAttribute('src')).toBe('https://example.org/path?q=1')
  })

  it('rejects a non-http(s) scheme and shows the error copy', () => {
    renderPanel()
    submitUrl('javascript:alert(1)')
    expect(screen.getByText(en.browserInvalidUrl)).toBeTruthy()
    expect(screen.queryByTitle(en.panelBrowser)).toBeNull()
  })

  it('steps back and forward through the local history', () => {
    renderPanel()
    submitUrl('a.example')
    submitUrl('b.example')
    fireEvent.click(screen.getByRole('button', { name: en.browserBack }))
    expect(frame().getAttribute('src')).toBe('https://a.example')
    fireEvent.click(screen.getByRole('button', { name: en.browserForward }))
    expect(frame().getAttribute('src')).toBe('https://b.example')
  })

  it('exposes the current URL as a safe external link', () => {
    renderPanel()
    submitUrl('example.com')
    const link = screen.getByRole('link', { name: en.browserOpenExternal })
    expect(link.getAttribute('href')).toBe('https://example.com')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('reloads the current frame without changing the address', () => {
    renderPanel()
    submitUrl('example.com')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: en.browserReload }).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: en.browserReload }))
    expect(frame().getAttribute('src')).toBe('https://example.com')
  })
})

describe('BrowserPanel tabs', () => {
  it('starts with one page tab', () => {
    renderPanel()
    expect(screen.getAllByRole('tab').length).toBe(1)
    expect(screen.getByRole('tab', { name: en.browserTab + ' 1' })).toBeTruthy()
  })

  it('adds a tab and restores the previous tab on switch back', () => {
    renderPanel()
    submitUrl('example.com')
    fireEvent.click(screen.getByRole('button', { name: en.addTab }))
    expect(screen.getAllByRole('tab').length).toBe(2)
    // The new tab is active and blank.
    expect(screen.getByText(en.browserEmpty)).toBeTruthy()
    // Switch back to the first tab: its submitted address is preserved.
    fireEvent.click(screen.getByRole('tab', { name: en.browserTab + ' 1' }))
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: en.browserAddress }).value).toBe('https://example.com')
  })

  it('closes the active tab and keeps the remaining one', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: en.addTab }))
    expect(screen.getAllByRole('tab').length).toBe(2)
    const closes = screen.getAllByRole('button', { name: en.closeTab })
    fireEvent.click(closes[closes.length - 1]!)
    expect(screen.getAllByRole('tab').length).toBe(1)
    expect(screen.getByRole('tab', { name: en.browserTab + ' 1' })).toBeTruthy()
  })
})

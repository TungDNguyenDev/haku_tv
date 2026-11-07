import { configureStore } from '@reduxjs/toolkit'
import { render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import authReducer from '../features/auth/authSlice'
import profilesReducer from '../features/profiles/profilesSlice'

/** A store with the slices the signed-out pages and dialogs read (no sagas: tests look at the dispatched state). */
export function makeStore() {
  return configureStore({ reducer: { auth: authReducer, profiles: profilesReducer } })
}

export type TestStore = ReturnType<typeof makeStore>

/** Renders inside the Redux provider and a memory router, like main.tsx + App.tsx do in the app. */
export function renderWithStore(ui: ReactElement, { store = makeStore(), route = '/' }: { store?: TestStore; route?: string } = {}) {
  // As a wrapper (not wrapped by hand), so rerender() keeps the providers.
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </Provider>
  )
  return { store, ...render(ui, { wrapper }) }
}

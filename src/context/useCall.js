import { useContext } from 'react'
import CallContext from './callContext.js'

export function useCall() {
  const context = useContext(CallContext)

  if (!context) {
    throw new Error('useCall must be used inside CallProvider')
  }

  return context
}

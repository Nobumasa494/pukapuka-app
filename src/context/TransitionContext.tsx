import React, { createContext, useRef, useCallback } from 'react';
import { useSharedValue } from 'react-native-reanimated';

type TransitionState = 'idle' | 'to-archive' | 'to-home';

// Create dummy shared value for default context
const createDummySharedValue = () => {
  let value = 0;
  return {
    value,
    set: (v: number) => { value = v; },
  } as any;
};

export const TransitionContext = createContext<{
  transitionState: TransitionState;
  transitionProgress: any;
  startTransition: (target: 'archive' | 'home') => void;
  completeTransition: () => void;
}>({
  transitionState: 'idle',
  transitionProgress: createDummySharedValue(),
  startTransition: () => {},
  completeTransition: () => {},
});

export function TransitionProvider({ children }: { children: React.ReactNode }) {
  const stateRef = useRef<TransitionState>('idle');
  const transitionProgress = useSharedValue(0);

  const startTransition = useCallback((target: 'archive' | 'home') => {
    stateRef.current = target === 'archive' ? 'to-archive' : 'to-home';
    transitionProgress.value = 0;
  }, [transitionProgress]);

  const completeTransition = useCallback(() => {
    stateRef.current = 'idle';
    transitionProgress.value = 0;
  }, [transitionProgress]);

  return (
    <TransitionContext.Provider value={{
      transitionState: stateRef.current,
      transitionProgress,
      startTransition,
      completeTransition
    }}>
      {children}
    </TransitionContext.Provider>
  );
}

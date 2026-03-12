import { create } from 'zustand';
import type { UatTest } from '../uat/uatTests';

interface UatOnboardingState {
  activeTest: UatTest | null;
  currentStepIndex: number;
  startTest: (test: UatTest) => void;
  nextStep: () => void;
  prevStep: () => void;
  stopTest: () => void;
}

export const useUatOnboardingStore = create<UatOnboardingState>((set, get) => ({
  activeTest: null,
  currentStepIndex: 0,

  startTest: (test) =>
    set({
      activeTest: test,
      currentStepIndex: 0,
    }),

  nextStep: () => {
    const { activeTest, currentStepIndex } = get();
    if (!activeTest) return;
    const nextIndex = currentStepIndex + 1;
    if (nextIndex >= activeTest.steps.length) {
      set({ activeTest: null, currentStepIndex: 0 });
    } else {
      set({ currentStepIndex: nextIndex });
    }
  },

  prevStep: () => {
    const { currentStepIndex } = get();
    if (currentStepIndex === 0) return;
    set({ currentStepIndex: currentStepIndex - 1 });
  },

  stopTest: () => set({ activeTest: null, currentStepIndex: 0 }),
}));


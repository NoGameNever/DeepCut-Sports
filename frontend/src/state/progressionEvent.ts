// Tiny cross-screen handoff for post-match progression summaries
// (quiz screen submits, lobby/results screen shows the level-up modal).
let pending: any = null;

export const setPendingProgression = (p: any) => {
  pending = p;
};

export const consumePendingProgression = () => {
  const p = pending;
  pending = null;
  return p;
};

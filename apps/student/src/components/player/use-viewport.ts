"use client";

import * as React from "react";

/** True when the viewport is below `breakpoint` (handoff: < 900px => mobile drawer). */
export function useIsNarrow(breakpoint = 900): boolean {
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return narrow;
}

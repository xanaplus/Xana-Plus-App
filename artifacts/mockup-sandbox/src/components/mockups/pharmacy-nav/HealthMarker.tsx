import { Preview } from './_Preview';
import { HealthTabBar } from './_HealthTabBar';

/** Preview entry for the quiet, cross-marked Pharmacy destination. */
export function HealthMarker() {
  return (
    <Preview
      Bar={HealthTabBar}
      note="Pharmacy stays on the shared tab baseline; a small medical cross and an inset tint mark the selected service."
    />
  );
}

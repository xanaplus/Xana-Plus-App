import { TabBar } from './_ExtractedTabBar';
import { Preview } from './_Preview';

export function Current() {
  return <Preview Bar={TabBar} note="Current app navigation. Pharmacy stays raised even when another tab is selected." />;
}

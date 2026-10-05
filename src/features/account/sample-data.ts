import { REPEAT_SCRIPTS } from '@/data/prescriptions';
import { useSession } from '@/store/session';

/**
 * The repeat prescriptions on file. There is no prescriptions backend yet, so
 * only the demo account sees the sample scripts; real customers have none.
 */
export function useRepeatScripts() {
  const { isDemo } = useSession();
  return isDemo ? REPEAT_SCRIPTS : [];
}

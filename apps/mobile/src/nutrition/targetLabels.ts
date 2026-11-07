import type { NutritionTargetSource } from '@athlete/contracts';

export const TARGET_SOURCE_LABEL: Readonly<Record<NutritionTargetSource, string>> = {
  estimated: 'Plan provisional · sugerencia de la app',
  professional: 'De tu nutriólogo',
  manual: 'Tus metas',
};

import type { MaintenanceItemDto, PaceDto } from '@car-checkup/shared/dto';
import { Button, Sheet } from '../../design/components';
import { t } from '../../i18n/es';
import { explain } from './explain';

export function ExplanationSheet({
  item,
  pace,
  currentOdometerKm,
  onClose,
  onAskHistory,
}: {
  item: MaintenanceItemDto | null;
  pace: PaceDto;
  currentOdometerKm: number;
  onClose: () => void;
  onAskHistory: (item: MaintenanceItemDto) => void;
}) {
  return (
    <Sheet
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={item !== null ? t.maintenance.names[item.typeCode] : ''}
    >
      {item !== null && (
        <div className="flex flex-col gap-3">
          <p>{t.maintenance.whyText[item.typeCode]}</p>
          <ul className="flex flex-col gap-2 rounded-card bg-surface-muted p-4">
            {explain(item, pace, currentOdometerKm).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-sm text-text-muted">{t.maintenance.disclaimer}</p>
          {item.askHistory && (
            <Button
              variant="secondary"
              onClick={() => {
                onAskHistory(item);
              }}
            >
              {t.maintenance.askHistory}
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

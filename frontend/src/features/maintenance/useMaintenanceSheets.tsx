import type { MaintenanceItemDto, VehicleDto, VehicleMaintenanceDto } from '@car-checkup/shared/dto';
import { type ReactNode, useState } from 'react';
import { ExplanationSheet } from './ExplanationSheet';
import { MaintenanceSettingsSheet } from './MaintenanceSettingsSheet';
import { PriorHistorySheet } from './PriorHistorySheet';
import { RecordServiceSheet, type RecordServiceTarget } from './RecordServiceSheet';

type Open =
  | { kind: 'why'; item: MaintenanceItemDto }
  | { kind: 'record'; target: RecordServiceTarget }
  | { kind: 'prior'; item: MaintenanceItemDto }
  | { kind: 'settings'; item: MaintenanceItemDto }
  | null;

/** Shared sheets for maintenance actions (alerts on the home screen and the detail page). */
export function useMaintenanceSheets(vehicle: VehicleDto, maintenance: VehicleMaintenanceDto | undefined) {
  const [open, setOpen] = useState<Open>(null);
  const close = () => {
    setOpen(null);
  };
  const typeCodes = (maintenance?.items ?? []).filter((i) => i.enabled).map((i) => i.typeCode);

  const sheets: ReactNode = (
    <>
      {maintenance !== undefined && (
        <ExplanationSheet
          item={open?.kind === 'why' ? open.item : null}
          pace={maintenance.pace}
          currentOdometerKm={maintenance.currentOdometerKm}
          onClose={close}
          onAskHistory={(item) => {
            setOpen({ kind: 'prior', item });
          }}
        />
      )}
      <RecordServiceSheet
        vehicle={vehicle}
        typeCodes={typeCodes}
        target={open?.kind === 'record' ? open.target : null}
        onClose={close}
      />
      <PriorHistorySheet vehicleId={vehicle.id} item={open?.kind === 'prior' ? open.item : null} onClose={close} />
      <MaintenanceSettingsSheet vehicleId={vehicle.id} item={open?.kind === 'settings' ? open.item : null} onClose={close} />
    </>
  );

  return {
    sheets,
    explain: (item: MaintenanceItemDto) => {
      setOpen({ kind: 'why', item });
    },
    record: (target: RecordServiceTarget) => {
      setOpen({ kind: 'record', target });
    },
    askHistory: (item: MaintenanceItemDto) => {
      setOpen({ kind: 'prior', item });
    },
    adjust: (item: MaintenanceItemDto) => {
      setOpen({ kind: 'settings', item });
    },
  };
}

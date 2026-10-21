import { MaintenanceSettingUpdateSchema } from '@car-checkup/shared/schemas';
import { MaintenanceTypeCode } from '@car-checkup/shared/prisma/enums';
import { Router } from 'express';
import { z } from 'zod';
import { requireUserId } from '../../middleware/auth';
import { requestClock } from '../../middleware/timezone';
import { parseInput } from '../../middleware/validate';
import { VehicleParams } from '../vehicles/vehicles.routes';
import { getVehicleMaintenance, updateMaintenanceSetting } from './maintenance.service';

const TypeParams = VehicleParams.extend({ typeCode: z.enum(MaintenanceTypeCode) });

export const maintenanceRouter = Router();

maintenanceRouter.get('/vehicles/:vehicleId/maintenance', async (req, res) => {
  const { vehicleId } = parseInput(VehicleParams, req.params);
  res.json(await getVehicleMaintenance(requireUserId(req), vehicleId, requestClock(req)));
});

maintenanceRouter.patch('/vehicles/:vehicleId/maintenance/:typeCode', async (req, res) => {
  const { vehicleId, typeCode } = parseInput(TypeParams, req.params);
  const input = parseInput(MaintenanceSettingUpdateSchema, req.body);
  res.json(await updateMaintenanceSetting(requireUserId(req), vehicleId, typeCode, input, requestClock(req)));
});

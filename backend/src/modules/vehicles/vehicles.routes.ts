import { VehicleCreateSchema, VehicleUpdateSchema } from '@car-checkup/shared/schemas';
import { Router } from 'express';
import { z } from 'zod';
import { requireUserId } from '../../middleware/auth';
import { parseInput } from '../../middleware/validate';
import {
  createVehicle,
  deleteVehicle,
  getVehicle,
  listVehicles,
  updateVehicle,
} from './vehicles.service';

export const VehicleParams = z.object({ vehicleId: z.uuid() });

export const vehiclesRouter = Router();

vehiclesRouter.get('/vehicles', async (req, res) => {
  res.json({ items: await listVehicles(requireUserId(req)) });
});

vehiclesRouter.post('/vehicles', async (req, res) => {
  const input = parseInput(VehicleCreateSchema, req.body);
  const { vehicle } = await createVehicle(requireUserId(req), input);
  res.status(201).json(vehicle);
});

vehiclesRouter.get('/vehicles/:vehicleId', async (req, res) => {
  const { vehicleId } = parseInput(VehicleParams, req.params);
  res.json(await getVehicle(requireUserId(req), vehicleId));
});

vehiclesRouter.patch('/vehicles/:vehicleId', async (req, res) => {
  const { vehicleId } = parseInput(VehicleParams, req.params);
  const input = parseInput(VehicleUpdateSchema, req.body);
  res.json(await updateVehicle(requireUserId(req), vehicleId, input));
});

vehiclesRouter.delete('/vehicles/:vehicleId', async (req, res) => {
  const { vehicleId } = parseInput(VehicleParams, req.params);
  await deleteVehicle(requireUserId(req), vehicleId);
  res.status(204).end();
});

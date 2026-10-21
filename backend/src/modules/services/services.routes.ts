import {
  ServiceCreateSchema,
  ServicesListQuery,
  ServiceUpdateSchema,
} from '@car-checkup/shared/schemas';
import { Router } from 'express';
import { z } from 'zod';
import { requireUserId } from '../../middleware/auth';
import { requestClock } from '../../middleware/timezone';
import { parseInput } from '../../middleware/validate';
import { VehicleParams } from '../vehicles/vehicles.routes';
import { createService, deleteService, listServices, updateService } from './services.service';

const ServiceParams = VehicleParams.extend({ serviceId: z.uuid() });

export const servicesRouter = Router();

servicesRouter.get('/vehicles/:vehicleId/services', async (req, res) => {
  const { vehicleId } = parseInput(VehicleParams, req.params);
  const query = parseInput(ServicesListQuery, req.query);
  res.json(await listServices(requireUserId(req), vehicleId, query));
});

servicesRouter.post('/vehicles/:vehicleId/services', async (req, res) => {
  const { vehicleId } = parseInput(VehicleParams, req.params);
  const input = parseInput(ServiceCreateSchema, req.body);
  const { result, replayed } = await createService(requireUserId(req), vehicleId, input, requestClock(req));
  res.status(replayed ? 200 : 201).json(result);
});

servicesRouter.patch('/vehicles/:vehicleId/services/:serviceId', async (req, res) => {
  const { vehicleId, serviceId } = parseInput(ServiceParams, req.params);
  const input = parseInput(ServiceUpdateSchema, req.body);
  res.json(await updateService(requireUserId(req), vehicleId, serviceId, input, requestClock(req)));
});

servicesRouter.delete('/vehicles/:vehicleId/services/:serviceId', async (req, res) => {
  const { vehicleId, serviceId } = parseInput(ServiceParams, req.params);
  res.json(await deleteService(requireUserId(req), vehicleId, serviceId, requestClock(req)));
});

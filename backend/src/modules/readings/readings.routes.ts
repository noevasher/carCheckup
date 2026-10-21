import {
  ReadingCreateSchema,
  ReadingsListQuery,
  ReadingUpdateSchema,
} from '@car-checkup/shared/schemas';
import { Router } from 'express';
import { z } from 'zod';
import { requireUserId } from '../../middleware/auth';
import { parseInput } from '../../middleware/validate';
import { VehicleParams } from '../vehicles/vehicles.routes';
import { createReading, deleteReading, listReadings, updateReading } from './readings.service';

const ReadingParams = VehicleParams.extend({ readingId: z.uuid() });

export const readingsRouter = Router();

readingsRouter.get('/vehicles/:vehicleId/readings', async (req, res) => {
  const { vehicleId } = parseInput(VehicleParams, req.params);
  const { cursor, limit, reviewStatus } = parseInput(ReadingsListQuery, req.query);
  res.json(await listReadings(requireUserId(req), vehicleId, { cursor, limit, reviewStatus }));
});

readingsRouter.post('/vehicles/:vehicleId/readings', async (req, res) => {
  const { vehicleId } = parseInput(VehicleParams, req.params);
  const input = parseInput(ReadingCreateSchema, req.body);
  const { result, replayed } = await createReading(requireUserId(req), vehicleId, input);
  res.status(replayed ? 200 : 201).json(result);
});

readingsRouter.patch('/vehicles/:vehicleId/readings/:readingId', async (req, res) => {
  const { vehicleId, readingId } = parseInput(ReadingParams, req.params);
  const input = parseInput(ReadingUpdateSchema, req.body);
  res.json(await updateReading(requireUserId(req), vehicleId, readingId, input));
});

readingsRouter.delete('/vehicles/:vehicleId/readings/:readingId', async (req, res) => {
  const { vehicleId, readingId } = parseInput(ReadingParams, req.params);
  res.json(await deleteReading(requireUserId(req), vehicleId, readingId));
});

import { ProfileUpdateSchema } from '@car-checkup/shared/schemas';
import { Router } from 'express';
import { requireUserId } from '../../middleware/auth';
import { parseInput } from '../../middleware/validate';
import { getProfile, setActiveVehicle } from './profile.service';

export const profileRouter = Router();

profileRouter.get('/me', async (req, res) => {
  res.json(await getProfile(requireUserId(req)));
});

profileRouter.patch('/me', async (req, res) => {
  const input = parseInput(ProfileUpdateSchema, req.body);
  res.json(await setActiveVehicle(requireUserId(req), input.activeVehicleId));
});

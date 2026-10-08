import { prisma } from "./db";
import { hashToken, newDeviceToken } from "./crypto.server";

export type DeviceDto = { id: string; name: string; platform: string; status: string; lastSyncAt: string | null };

const dto = (d: { id: string; name: string; platform: string; status: string; lastSyncAt: Date | null }): DeviceDto => ({
  id: d.id, name: d.name, platform: d.platform, status: d.status, lastSyncAt: d.lastSyncAt?.toISOString() ?? null,
});

export async function listDevices(userId: string) {
  return (await prisma.device.findMany({ where: { userId }, orderBy: { name: "asc" } })).map(dto);
}

/** The plaintext token is returned once and never stored; only its hash is kept. */
export async function createDevice(userId: string, name: string, platform: "ANDROID" | "IOS") {
  const token = newDeviceToken();
  const d = await prisma.device.create({ data: { userId, name, platform, tokenHash: hashToken(token) } });
  return { device: dto(d), token };
}

export async function revokeDevice(userId: string, id: string) {
  const { count } = await prisma.device.updateMany({ where: { id, userId }, data: { status: "REVOKED" } });
  return count > 0;
}

export async function authenticateDevice(token: string) {
  const d = await prisma.device.findUnique({ where: { tokenHash: hashToken(token) } });
  return d && d.status === "ACTIVE" ? d : null;
}

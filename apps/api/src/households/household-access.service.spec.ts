import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HouseholdRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HouseholdAccessService } from './household-access.service';

describe('HouseholdAccessService', () => {
  let service: HouseholdAccessService;
  let findUnique: jest.Mock;

  const membership = (role: HouseholdRole) => ({
    id: 'm1',
    householdId: 'h1',
    userId: 'u1',
    role,
    joinedAt: new Date(),
  });

  beforeEach(async () => {
    findUnique = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        HouseholdAccessService,
        { provide: PrismaService, useValue: { householdMember: { findUnique } } },
      ],
    }).compile();
    service = moduleRef.get(HouseholdAccessService);
  });

  it('looks membership up by the (householdId, userId) unique key', async () => {
    findUnique.mockResolvedValue(membership(HouseholdRole.MEMBER));

    await service.requireMember('u1', 'h1');

    expect(findUnique).toHaveBeenCalledWith({
      where: { householdId_userId: { householdId: 'h1', userId: 'u1' } },
    });
  });

  it('treats non-members as "household not found" (404, no enumeration)', async () => {
    findUnique.mockResolvedValue(null);

    await expect(service.requireMember('u1', 'h1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.requireAdmin('u1', 'h1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requireAdmin accepts OWNER and ADMIN but rejects MEMBER with 403', async () => {
    findUnique.mockResolvedValue(membership(HouseholdRole.OWNER));
    await expect(service.requireAdmin('u1', 'h1')).resolves.toBeDefined();

    findUnique.mockResolvedValue(membership(HouseholdRole.ADMIN));
    await expect(service.requireAdmin('u1', 'h1')).resolves.toBeDefined();

    findUnique.mockResolvedValue(membership(HouseholdRole.MEMBER));
    await expect(service.requireAdmin('u1', 'h1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requireOwner rejects admins', async () => {
    findUnique.mockResolvedValue(membership(HouseholdRole.ADMIN));

    await expect(service.requireOwner('u1', 'h1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

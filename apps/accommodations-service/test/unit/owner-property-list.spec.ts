import { PrismaPropertyRepository } from '../../src/infrastructure/persistence/prisma/property.repository';
import { PropertiesController } from '../../src/interfaces/http/properties/properties.controller';

describe('owner property list', () => {
  it('scopes the query to the requested authenticated owner', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new PrismaPropertyRepository({ property: { findMany } } as never);
    await expect(repository.findByOwner('owner-one')).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: 'owner-one' } }));
  });

  it('checks property visibility before reading a photo', async () => {
    const read = jest.fn();
    const get = { execute: jest.fn().mockRejectedValue(new Error('NOT_FOUND')) };
    const controller = new PropertiesController({} as never, get as never, {} as never, {} as never, {} as never, { read } as never);
    await expect(controller.getPhoto(undefined, '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', {} as never)).rejects.toThrow('NOT_FOUND');
    expect(read).not.toHaveBeenCalled();
  });
});

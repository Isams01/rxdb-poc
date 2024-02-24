import { DateTime } from 'luxon';
import { createDatabaseAndReplication } from '.';

describe('replication push handler', () => {
  test('should send the new local changes to the server when a change is made', async () => {
    const { db, repState } = await createDatabaseAndReplication(
      'http://localhost:3000/pull',
      'http://localhost:3000/push/no-change'
    );
    const push = repState.push;
    if (!push) throw new Error('push handler is not defined');
    const pushHandlerSpy = jest.spyOn(push, 'handler');
    await repState.awaitInitialReplication();
    const updated = DateTime.utc().toISO();
    db.humans.insert({
      passportId: 'test-id',
      firstName: 'Bob',
      lastName: 'Kelso',
      age: 56,
      updated: updated,
    });
    await new Promise((res) => setTimeout(res, 1000));
    try {
      expect(pushHandlerSpy).toHaveBeenCalledWith([
        {
          assumedMasterState: undefined,
          newDocumentState: {
            passportId: 'test-id',
            firstName: 'Bob',
            lastName: 'Kelso',
            age: 56,
            updated: updated,
            _deleted: false,
          },
        },
      ]);
      const dbDoc = await db.humans
        .findOne({
          selector: {
            passportId: {
              $eq: 'test-id',
            },
          },
        })
        .exec();
      if (!dbDoc) throw new Error('dbDoc is null');
      expect(dbDoc.age).toBe(56);
    } finally {
      await repState.cancel();
      await db.remove();
    }
  });
  test('Doc was changed on master and client, server should respond with updated doc', async () => {
    const updated = DateTime.utc(1970, 1, 1).toISO() ?? '';
    const { db, repState } = await createDatabaseAndReplication(
      'http://localhost:3000/pull',
      'http://localhost:3000/push/change',
      [
        {
          passportId: 'test-id',
          firstName: 'Bob',
          lastName: 'Kelso1',
          age: 80,
          updated: updated,
        },
      ]
    );
    const push = repState.push;
    if (!push) throw new Error('push handler is not defined');
    await repState.awaitInitialReplication();
    const pushHandlerSpy = jest.spyOn(push, 'handler');
    // const newUpdated =  DateTime.utc().toISO()
    db.humans.upsert({
      passportId: 'test-id',
      firstName: 'Bob',
      lastName: 'Kelso',
      age: 40,
      updated: updated,
    });
    await new Promise((res) => setTimeout(res, 1000));
    try {
      expect(pushHandlerSpy).toHaveBeenCalledWith([
        {
          assumedMasterState: {
            passportId: 'test-id',
            firstName: 'Bob',
            lastName: 'Kelso',
            age: 100,
            _deleted: false,
          },
          newDocumentState: {
            passportId: 'test-id',
            firstName: 'Bob',
            lastName: 'Kelso',
            age: 40,
            updated: updated,
            _deleted: false,
          },
        },
      ]);
      const dbDoc = await db.humans
        .findOne({
          selector: {
            passportId: {
              $eq: 'test-id',
            },
          },
        })
        .exec();
      if (!dbDoc) throw new Error('dbDoc is null');
      // server returned different master doc
      expect(dbDoc.age).toBe(100);
    } finally {
      await repState.cancel();
      await db.remove();
    }
  });
});

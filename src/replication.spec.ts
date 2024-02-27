import { DateTime } from 'luxon';
import { createDatabaseAndReplication } from '.';
import axios from 'axios';
import { addRxPlugin } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
addRxPlugin(RxDBDevModePlugin);

describe('replication push handler', () => {
  beforeEach(async () => {
    const { data } = await axios.post('http://localhost:3000/reset');
    expect(data).toEqual('ok');
  });
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
  test('Doc was changed on master, server should respond with updated doc', async () => {
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
    await axios.post('http://localhost:3000/set-person-by-passport-id', {
      passportId: 'test-id',
      firstName: 'Bob',
      lastName: 'Kelso',
      age: 100,
      updated: DateTime.utc().toISO(),
    });
    await db.humans.upsert({
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
            lastName: 'Kelso1',
            age: 80,
            updated: '1970-01-01T00:00:00.000Z',
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
  test('Updated field should not be able to be updated by the client', async () => {
    const updated = DateTime.utc(1970, 1, 1).toISO() ?? '';
    await axios.post('http://localhost:3000/set-person-by-passport-id', {
      passportId: 'test-id',
      firstName: 'Bob',
      lastName: 'Kelso',
      age: 100,
      updated: DateTime.utc().toISO(),
    });
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
    try {
      const currectDoc = await db.humans
        .findOne({
          selector: {
            passportId: {
              $eq: 'test-id',
            },
          },
        })
        .exec();
      const newDoc = {
        passportId: 'test-id',
        firstName: 'Bob',
        lastName: 'Kelso',
        age: 40,
        updated: 'test',
      };
      // this is the function that validates changes in schema but its only available in devMode
      expect(() => db.humans.schema.validateChange(currectDoc, newDoc)).toThrow();
      expect(db.humans.upsert(newDoc)).rejects.toThrow();
    } finally {
      await repState.cancel();
      await db.remove();
    }
  });
  test('Updated field should be able to be updated by the server', async () => {
    const updated = DateTime.utc(1970, 10, 1).toISO() ?? '';
    const updated1 = DateTime.utc(1970, 11, 1).toISO() ?? '';
    await axios.post('http://localhost:3000/set-person-by-passport-id', {
      passportId: 'test-id',
      firstName: 'Bob',
      lastName: 'Kelso',
      age: 100,
      updated: updated,
    });
    const { db, repState } = await createDatabaseAndReplication(
      'http://localhost:3000/pull',
      'http://localhost:3000/push/change'
    );
    const push = repState.push;
    if (!push) throw new Error('push handler is not defined');
    await repState.awaitInitialReplication();
    await axios.post('http://localhost:3000/set-person-by-passport-id', {
      passportId: 'test-id',
      firstName: 'Bob',
      lastName: 'Kelso',
      age: 99,
      updated: updated1,
    });
    try {
      await db.humans.upsert({
        passportId: 'test-id',
        firstName: 'Bob',
        lastName: 'Kelso',
        age: 40,
        updated: updated,
      });

      await new Promise((res) => setTimeout(res, 1000));
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
      expect(dbDoc.age).toBe(99);
      expect(dbDoc.updated).toBe(updated1);
    } finally {
      await repState.cancel();
      await db.remove();
    }
  });
});

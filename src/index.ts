import { RxReplicationPullStreamItem, createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import axios from 'axios';
import _ from 'lodash';
import { Subject } from 'rxjs';

// see this link for help https://rxdb.info/replication-http.html#push-from-the-client-to-the-server

interface Checkpoint {
  lastUpdate: Date;
  lastId: string | undefined;
}

interface DocType {
  passportId: string;
  firstName: string;
  lastName: string;
  age: number;
  updated: string; // iso 8601 string
}

// const pullEndpoint = 'http://localhost:3000/pull';
// const pushEndpoint = 'http://localhost:3000/push';
const pullStream$ = new Subject<
  RxReplicationPullStreamItem<{ passportId: string }[], Checkpoint>
>();

export const humansSchema = {
  title: 'human schema',
  version: 0,
  primaryKey: 'passportId',
  type: 'object',
  properties: {
    passportId: {
      type: 'string',
      maxLength: 100, // <- the primary key must have set maxLength
    },
    firstName: {
      type: 'string',
    },
    lastName: {
      type: 'string',
    },
    updated: {
      type: 'string',
      final: true, // try this. What you are looking for is the client cannot set this.
    },
    age: {
      description: 'age in years',
      type: 'integer',

      // number fields that are used in an index, must have set minimum, maximum and multipleOf
      minimum: 0,
      maximum: 150,
      multipleOf: 1,
    },
  },
  required: ['firstName', 'lastName', 'passportId'],
  indexes: ['age'],
};
export const createDB = async () => {
  const db = await createRxDatabase({
    name: 'heroesdb',
    multiInstance: true,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    ignoreDuplicate: true,
  });

  await db.addCollections({
    humans: {
      schema: humansSchema,
    },
  });
  return db;
};

export async function createDatabaseAndReplication(
  pullUrl: string,
  pushUrl: string,
  docsToInsert?: DocType[]
) {
  const db = await createDB();
  if (docsToInsert) {
    await db.humans.bulkInsert(docsToInsert);
  }
  const repState = replicateRxCollection({
    collection: db.humans,
    replicationIdentifier: 'my-rest-replication-to-localhost:8999',
    live: true,
    retryTime: 5 * 1000,
    waitForLeadership: true,
    autoStart: true,
    deletedField: '_deleted',
    push: {
      async handler(docs) {
        const rawResponse = await axios.post(pushUrl, docs);
        const response = rawResponse.data;
        return response;
      },
      batchSize: 5,
      modifier: (d) => d,
    },
    pull: {
      async handler(lastCheckpoint: Checkpoint | undefined) {
        // define it as an empty array for now
        const res = await axios.get(pullUrl);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const documentsFromRemote: any[] = res.data;
        return {
          documents: documentsFromRemote,
          checkpoint: lastCheckpoint
            ? lastCheckpoint ?? null
            : ({
                lastId: _.last(documentsFromRemote)?.passportId ?? '',
                lastUpdate: new Date(),
              } as Checkpoint | null),
        };
      },
      batchSize: 10,
      modifier: (d) => d,
      stream$: pullStream$.asObservable(),
    },
  });
  return {
    db,
    repState,
  };
}

// createDB().then(async (db) => {
//   await db.humans.insert({
//     passportId: 'test-id',
//     firstName: 'Bob',
//     lastName: 'Kelso',
//     age: 55,
//   });
// const repState = replicateRxCollection({
//   collection: db.humans,
//   replicationIdentifier: 'my-rest-replication-to-localhost:8999',
//   live: true,
//   retryTime: 5 * 1000,
//   waitForLeadership: true,
//   autoStart: true,
//   deletedField: '_deleted',
//   push: {
//     async handler(docs) {
//       console.log('sending docs to server', docs);
//       const rawResponse = await axios.post(pushEndpoint, docs);
//       console.log(rawResponse.data);
//       const response = rawResponse.data;
//       return response;
//     },
//     batchSize: 5,
//     modifier: (d) => d,
//   },
//   pull: {
//     async handler(lastCheckpoint: Checkpoint | undefined) {
//       // define it as an empty array for now
//       const documentsFromRemote: any[] = [];
//       const res: ReplicationPullHandlerResult<unknown, Checkpoint> = {
//         documents: documentsFromRemote,
//         checkpoint: lastCheckpoint
//           ? lastCheckpoint ?? null
//           : ({
//               lastId: _.last(documentsFromRemote)?.passportId ?? '',
//               lastUpdate: new Date(),
//             } as Checkpoint | null),
//       };
//       return res as ReplicationPullHandlerResult<unknown, Checkpoint>;
//     },
//     batchSize: 10,
//     modifier: (d) => d,
//     stream$: pullStream$.asObservable(),
//   },
// });
//   await repState.awaitInitialReplication();
//   await db.humans.upsert({
// passportId: 'test-id',
// firstName: 'Bob',
// lastName: 'Kelso',
// age: 56,
//   });
// });

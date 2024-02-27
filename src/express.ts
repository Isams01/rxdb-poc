import express from 'express';
import bodyParser from 'body-parser';
import { DateTime } from 'luxon';

interface Person {
  passportId: string;
  firstName: string;
  lastName: string;
  age: number;
  updated: string;
  _deleted: boolean;
}

interface PushPersonChangeRequest {
  assumedMasterState: Person | undefined;
  newDocumentState: Person;
}

let personByPassportId: Record<string, Person> = {};

function resetDb() {
  personByPassportId = {};
}

resetDb();

const app = express();
app.use(bodyParser.json());
const port = 3000;

app.post('/reset', (req, res) => {
  resetDb();
  res.send('ok');
});

app.post('/set-person-by-passport-id', (req, res) => {
  const person = req.body as Person;
  personByPassportId[person.passportId] = person;
  res.send('ok');
});

app.get('/pull', (req, res) => {
  res.send(Object.values(personByPassportId));
});

app.post('/push/change', (req, res) => {
  const changes = req.body as PushPersonChangeRequest[];
  const deconflict: Person[] = [];
  for (const change of changes) {
    const passportId = change.assumedMasterState?.passportId;
    if (passportId === undefined) {
      // THis is a new doc
      personByPassportId[change.newDocumentState.passportId] = {
        ...change.newDocumentState,
        updated: DateTime.utc().toISO(),
      };
      continue;
    }

    const masterDoc = personByPassportId[passportId];

    // Is there a conflict
    if (change.assumedMasterState?.updated !== masterDoc.updated) {
      deconflict.push(masterDoc);
      continue;
    }

    // Otherwise, this is a good update
    personByPassportId[passportId] = {
      ...change.newDocumentState,
      updated: DateTime.utc().toISO(),
    };
  }

  res.send(deconflict);
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});

import express from 'express';

const app = express();
const port = 3000;
app.get('/pull', (req, res) => {
  res.send([]);
});

app.post('/push/no-change', (req, res) => {
  res.send([]);
});

app.post('/push/change', (req, res) => {
  res.send([
    {
      passportId: 'test-id',
      firstName: 'Bob',
      lastName: 'Kelso',
      age: 100,
    },
  ]);
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});

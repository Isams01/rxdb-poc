import Ajv from 'ajv';
import { humansSchema } from '.';

describe('Data Validation', () => {
  test('should validate the schema', () => {
    const ajv = new Ajv();
    ajv.addVocabulary(['final', 'version', 'primaryKey', 'indexes']);
    const validate = ajv.compile(humansSchema);
    const valid = validate({
      passportId: 'test-id',
      firstName: 'Bob',
      lastName: 'Kelso',
      age: 40,
      updated: '1970-01-01T00:00:00.000Z',
    });
    expect(valid).toBe(true);
  });
  test('should not validate the schema with wrong data type', () => {
    const ajv = new Ajv();
    ajv.addVocabulary(['final', 'version', 'primaryKey', 'indexes']);
    const validate = ajv.compile(humansSchema);

    const valid = validate({
      passportId: 'test-id',
      firstName: 'Bob',
      lastName: 1,
      age: 40,
      updated: '1970-01-01T00:00:00.000Z',
    });
    expect(valid).toBe(false);
  });
  test('should not validate the schema with missing data', () => {
    const ajv = new Ajv();
    ajv.addVocabulary(['final', 'version', 'primaryKey', 'indexes']);
    const validate = ajv.compile(humansSchema);

    const valid = validate({
      passportId: 'test-id',
      firstName: 'Bob',
      age: 40,
      updated: '1970-01-01T00:00:00.000Z',
    });
    expect(valid).toBe(false);
  });
});

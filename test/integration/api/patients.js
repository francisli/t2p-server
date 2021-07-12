const assert = require('assert');
const HttpStatus = require('http-status-codes');
const session = require('supertest-session');
const uuid = require('uuid/v4');

const helpers = require('../../helpers');
const app = require('../../../app');
const models = require('../../../models');

describe('/api/patients', () => {
  let testSession;

  beforeEach(async () => {
    await helpers.loadFixtures([
      'users',
      'cities',
      'counties',
      'states',
      'agencies',
      'facilities',
      'contacts',
      'employments',
      'scenes',
      'sceneObservations',
      'responders',
      'patients',
      'patientObservations',
    ]);
    testSession = session(app);
    await testSession
      .post('/login')
      .set('Host', `bmacc.${process.env.BASE_HOST}`)
      .send({ email: 'regular@peakresponse.net', password: 'abcd1234' })
      .expect(HttpStatus.OK);
  });

  describe('GET /', () => {
    it('returns a list of patients', async () => {
      const response = await testSession
        .get('/api/patients?sceneId=25db9094-03a5-4267-8314-bead229eff9d')
        .set('Host', `bmacc.${process.env.BASE_HOST}`)
        .expect(HttpStatus.OK);
      assert.deepStrictEqual(response.body.length, 7);
    });

    it('includes dependent objects when first encountered, references after', async () => {
      /// setup- assign diff assign different agency and facility records
      let response = await testSession
        .get('/api/patients?sceneId=25db9094-03a5-4267-8314-bead229eff9d')
        .set('Host', `bmacc.${process.env.BASE_HOST}`)
        .expect(200);
      let i = 0;
      for (const data of response.body) {
        // eslint-disable-next-line no-await-in-loop
        const patient = await models.Patient.findByPk(data.id);
        patient.isTransported = true;
        if (i < 4) {
          patient.transportAgencyId = 'e705f64b-1399-436e-a428-18c8378b3444';
          patient.transportFacilityId = '104a7a04-b05f-4200-8d7d-c45124012d19';
        } else {
          patient.transportAgencyId = '5de082f2-3242-43be-bc2b-6e9396815b4f';
          patient.transportFacilityId = 'b1a137ab-2625-4ecc-9dcd-41683a63bfa1';
        }
        // eslint-disable-next-line no-await-in-loop
        await patient.save();
        i += 1;
      }
      /// now, re-fetch and assert
      response = await testSession
        .get('/api/patients?sceneId=25db9094-03a5-4267-8314-bead229eff9d')
        .set('Host', `bmacc.${process.env.BASE_HOST}`)
        .expect(200);
      i = 0;
      for (const data of response.body) {
        if (i < 4) {
          if (i === 0) {
            /// we should have a full serialized object for the first record
            assert(data.transportAgency);
            assert.deepStrictEqual(data.transportAgency.id, 'e705f64b-1399-436e-a428-18c8378b3444');
            assert(data.transportFacility);
            assert.deepStrictEqual(data.transportFacility.id, '104a7a04-b05f-4200-8d7d-c45124012d19');
          } else {
            /// the rest should just have id
            assert(!data.transportAgency);
            assert.deepStrictEqual(data.transportAgencyId, 'e705f64b-1399-436e-a428-18c8378b3444');
            assert(!data.transportFacility);
            assert.deepStrictEqual(data.transportFacilityId, '104a7a04-b05f-4200-8d7d-c45124012d19');
          }
        } else if (i === 4) {
          /// we should have a full serialized object for the first record
          assert(data.transportAgency);
          assert.deepStrictEqual(data.transportAgency.id, '5de082f2-3242-43be-bc2b-6e9396815b4f');
          assert(data.transportFacility);
          assert.deepStrictEqual(data.transportFacility.id, 'b1a137ab-2625-4ecc-9dcd-41683a63bfa1');
        } else {
          /// the rest should just have id
          assert(!data.transportAgency);
          assert.deepStrictEqual(data.transportAgencyId, '5de082f2-3242-43be-bc2b-6e9396815b4f');
          assert(!data.transportFacility);
          assert.deepStrictEqual(data.transportFacilityId, 'b1a137ab-2625-4ecc-9dcd-41683a63bfa1');
        }
        i += 1;
      }
    });
  });

  describe('POST /', () => {
    it('adds a new Patient to the specified Scene', async () => {
      const id = uuid();
      const response = await testSession
        .post('/api/patients')
        .set('Host', `bmacc.${process.env.BASE_HOST}`)
        .send({
          id,
          sceneId: '25db9094-03a5-4267-8314-bead229eff9d',
          pin: '123456',
          version: 1,
          firstName: 'John',
          lastName: 'Doe',
          priority: 2,
        })
        .expect(HttpStatus.CREATED);
      assert(response.body?.id);
      const patient = await models.Patient.findByPk(response.body.id);
      assert(patient);
      assert.deepStrictEqual(patient.sceneId, '25db9094-03a5-4267-8314-bead229eff9d');
      assert.deepStrictEqual(patient.firstName, 'John');
      assert.deepStrictEqual(patient.lastName, 'Doe');
      assert.deepStrictEqual(patient.priority, 2);

      const observations = await patient.getObservations();
      assert.deepStrictEqual(observations.length, 1);
      assert.deepStrictEqual(observations[0].id, id);
    });

    it('adds a new Observation to update a Patient', async () => {
      const patient = await models.Patient.findByPk('47449282-c48a-4ca1-a719-5117b790fc70');
      assert.deepStrictEqual(patient.version, 2);
      let observations = await patient.getObservations();
      assert.deepStrictEqual(observations.length, 2);

      const id = uuid();
      const response = await testSession
        .post(`/api/patients`)
        .set('Host', `bmacc.${process.env.BASE_HOST}`)
        .send({
          id,
          sceneId: patient.sceneId,
          pin: patient.pin,
          version: patient.version + 1,
          firstName: 'New',
          lastName: 'Name',
        })
        .expect(HttpStatus.OK);
      assert.deepStrictEqual(response.body?.version, 3);
      assert.deepStrictEqual(response.body?.firstName, 'New');
      assert.deepStrictEqual(response.body?.lastName, 'Name');

      await patient.reload();
      assert.deepStrictEqual(patient.version, 3);
      assert.deepStrictEqual(patient.firstName, 'New');
      assert.deepStrictEqual(patient.lastName, 'Name');

      observations = await patient.getObservations();
      assert.deepStrictEqual(observations.length, 3);

      const observation = await models.PatientObservation.findByPk(id);
      assert(observation);
    });
  });

  describe('GET /:id', () => {
    it('returns a patient', async () => {
      const response = await testSession
        .get(`/api/patients/47449282-c48a-4ca1-a719-5117b790fc70`)
        .set('Host', `bmacc.${process.env.BASE_HOST}`)
        .expect(HttpStatus.OK);
      assert.deepStrictEqual(response.body?.id, '47449282-c48a-4ca1-a719-5117b790fc70');
    });
  });
});

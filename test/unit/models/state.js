const assert = require('assert');

const helpers = require('../../helpers');
const models = require('../../../models');
const nemsisMocks = require('../../mocks/nemsis');

describe('models', () => {
  describe('State', () => {
    describe('.getAbbrForCode()', () => {
      it('should return the state abbreviation for a given code', () => {
        assert.deepStrictEqual(models.State.getAbbrForCode('06'), 'CA');
      });
    });

    describe('.getCodeForName()', () => {
      it('should return the state code for a given name', () => {
        assert.deepStrictEqual(models.State.getCodeForName('California'), '06');
      });
    });

    describe('.getNameForCode()', () => {
      it('should return the state name for a given code', () => {
        assert.deepStrictEqual(models.State.getNameForCode('06'), 'California');
      });
    });

    describe('.configure()', () => {
      beforeEach(async () => {
        await helpers.loadFixtures(['cities', 'counties', 'states', 'users']);
      });

      it('should configure a Washington State record and associated Agency and Facility records', async function () {
        if (!process.env.CI) {
          this.skip();
        }
        nemsisMocks.mockReposRequest();
        nemsisMocks.mockWashingtonFilesRequest();
        nemsisMocks.mockWashingtonDownloads();

        const userId = '7f666fe4-dbdd-4c7f-ab44-d9157379a680';
        const state = await models.State.findByPk('53');
        assert(state);
        await state.configure(userId);
        assert.deepStrictEqual(state.name, 'Washington');
        assert.deepStrictEqual(await state.countAgencies(), 495);
        assert.deepStrictEqual(await models.Facility.count(), 159);
      });
    });
  });
});

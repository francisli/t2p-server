const assert = require('assert');

const helpers = require('../../helpers');
const models = require('../../../models');
const nemsisMocks = require('../../mocks/nemsis');

describe('models', () => {
  describe('State', () => {
    describe('.configure', () => {
      beforeEach(async () => {
        await helpers.loadFixtures(['cities', 'counties', 'states', 'users']);
      });

      it('should configure a Washington State record and associated Agency and Facility records', async () => {
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

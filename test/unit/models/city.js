const assert = require('assert');

const helpers = require('../../helpers');
const models = require('../../../models');
const geonamesMocks = require('../../mocks/geonames');

describe('models', () => {
  describe('City', () => {
    context('lookup', () => {
      beforeEach(async () => {
        await helpers.loadFixtures(['cities']);
      });

      describe('.getCode()', () => {
        it('should return the closest matching code', async () => {
          assert.deepStrictEqual(await models.City.getCode('san francisco', '06'), '2411786');
        });
      });

      describe('.getName()', () => {
        it('should return the matching name', async () => {
          assert.deepStrictEqual(await models.City.getName('2411786'), 'City of San Francisco');
        });
      });
    });

    describe('.importCitiesForState()', () => {
      it('downloads and imports city data for a given state', async () => {
        geonamesMocks.mockWashingtonDownloads();
        await models.City.importCitiesForState('53');
        assert.deepStrictEqual(await models.City.count(), 1);
      });
    });
  });
});

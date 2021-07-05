const assert = require('assert');

const helpers = require('../../helpers');
const models = require('../../../models');

describe('models', () => {
  describe('City', () => {
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
});

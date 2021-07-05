const assert = require('assert');

const helpers = require('../../helpers');
const models = require('../../../models');

describe('models', () => {
  describe('County', () => {
    beforeEach(async () => {
      await helpers.loadFixtures(['counties']);
    });

    describe('getCode()', () => {
      it('should return the closest matching code', async () => {
        assert.deepStrictEqual(await models.County.getCode('san francisco', '06'), '06075');
      });
    });

    describe('getName()', () => {
      it('should return the matching name', async () => {
        assert.deepStrictEqual(await models.County.getName('06075'), 'San Francisco County');
      });
    });
  });
});

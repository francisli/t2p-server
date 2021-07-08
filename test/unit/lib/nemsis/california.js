/* eslint-disable no-await-in-loop */
const assert = require('assert');
const path = require('path');

const helpers = require('../../../helpers');
const models = require('../../../../models');
const nemsis = require('../../../../lib/nemsis');
const nemsisStates = require('../../../../lib/nemsis/states');
const nemsisMocks = require('../../../mocks/nemsis');

describe('lib', () => {
  describe('nemsisStates.california', () => {
    // eslint-disable-next-line func-names
    beforeEach(async function () {
      await helpers.loadFixtures(['cities', 'counties']);
    });

    describe('appendAgenciesFromSpreadsheet()', () => {
      it('should return the additional agencies as a json sAgency object', async () => {
        nemsisMocks.mockCaliforniaFilesRequest();
        nemsisMocks.mockCaliforniaDownloads();

        const data = await nemsis.getStateRepoFiles('california');
        const tmpDir = await nemsis.downloadRepoFiles('california', data.values);
        for (const filePath of data.values) {
          if (filePath.startsWith('Resources') && filePath.endsWith('StateDataSet.xml')) {
            const dataSet = await nemsis.parseStateDataSet(path.resolve(tmpDir.name, filePath));
            const agencies = await nemsisStates.california.appendAgenciesFromSpreadsheet(models, dataSet);
            assert(agencies.sAgencyGroup);
            assert.deepStrictEqual(agencies.sAgencyGroup.length, 647);
            assert.deepStrictEqual(dataSet.json.StateDataSet.sAgency.sAgencyGroup.length, 1444);
            break;
          }
        }
        tmpDir.removeCallback();
      });
    });

    describe('parseFacilitySpreadsheet()', () => {
      it('should return the spreadsheet data as a json sFacility object', async () => {
        nemsisMocks.mockCaliforniaFilesRequest();
        nemsisMocks.mockCaliforniaDownloads();

        const data = await nemsis.getStateRepoFiles('california');
        const tmpDir = await nemsis.downloadRepoFiles('california', data.values);
        for (const filePath of data.values) {
          if (filePath.startsWith('Resources') && filePath.endsWith('Facilities.xlsx')) {
            const result = await nemsisStates.california.parseSpreadsheet(path.resolve(tmpDir.name, filePath));
            assert.deepStrictEqual(result.rows.length, 119);
            const facilities = await nemsisStates.california.parseFacilitySpreadsheet(models, result);
            assert(facilities.sFacilityGroup);
            assert.deepStrictEqual(facilities.sFacilityGroup.length, 7);

            const facility = facilities.sFacilityGroup[0]['sFacility.FacilityGroup'][0];
            assert.deepStrictEqual(facility, {
              'sFacility.02': { _text: 'Coventry Place' },
              'sFacility.03': { _text: '64673' },
              'sFacility.07': { _text: '1550 Sutter St' },
              'sFacility.12': { _text: 'US' },
              'sFacility.09': { _text: '06' },
              'sFacility.11': { _text: '06075' },
              'sFacility.08': { _text: '2411786' },
              'sFacility.10': { _text: '94109' },
            });
            break;
          }
        }
        tmpDir.removeCallback();
      });
    });
  });
});

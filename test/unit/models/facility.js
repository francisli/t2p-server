const assert = require('assert');
const nock = require('nock');
const path = require('path');

const helpers = require('../../helpers');
const models = require('../../../models');
const nemsis = require('../../../lib/nemsis');

describe('models', () => {
  describe('Facility', () => {
    describe('findNear()', () => {
      beforeEach(async () => {
        await helpers.loadFixtures(['cities', 'counties', 'states', 'users', 'facilities']);
      });

      it('should return a paginated list of facilities near the specified point', async () => {
        const { docs, total } = await models.Facility.findNear('37.7866029', '-122.4560444');
        assert.deepStrictEqual(total, 127);
        assert.deepStrictEqual(docs[0].name, 'CPMC - 3801 Sacramento Street'); /// this is the exact match to the coordinates above
      });

      it('should support additional query conditions', async () => {
        const { docs, total } = await models.Facility.findNear('37.7866029', '-122.4560444', {
          where: {
            name: { [models.Sequelize.Op.iLike]: '%cpmc%' },
          },
        });
        assert(total, 7);
        assert.deepStrictEqual(docs[0].name, 'CPMC - 3801 Sacramento Street');
        for (const facility of docs) {
          assert(facility.name.match(/cpmc/i));
        }
      });
    });

    describe('geog', () => {
      it('should be set automatically when assigning to lat/lng', async () => {
        const facility = await models.Facility.create({
          lat: '37.7873437',
          lng: '-122.4536086',
        });
        assert(facility.geog);
      });
    });

    describe('geocode()', () => {
      it('should geocode address into lat/lng', async () => {
        nock('https://maps.googleapis.com:443', { encodedQueryParams: true })
          .get('/maps/api/geocode/json')
          .query({
            address: '3698%20Sacramento%20Street%2C%20City%20of%20San%20Francisco%2C%20California',
            key: process.env.GOOGLE_MAPS_API_KEY,
          })
          .reply(
            200,
            '1f8b08000000000002ffb5955b739a4014c7dff3297678b619b943dfbca03117735193b19d0cb3c21636c22e038b8966fcee5dd05a11536863791139ffb3fcce7fcf1edecf0000428c9234608900be82efd9037ebd6f7fb330745dae486c8786112588149525fd362ba0c4b3090c51261664cd3484464994f83466952ab68cd0e69d3c83c508f194349ca15800cf05f1baf1575023e8c4fc9e300a46f9b2d58485940ad498a60c7d12f18e3b8f5d4cc105c29ecf9daf24ac91b10f4932d58cc63ea5aed000424403ccb003834f7b4b402f86c4c189436bf8daabe00c2867c26cf9df184187a6245bbfba056a65edc34337c404f3d6850c2f900d6304ed002d50604ba7aca7c31dfa4163826175159dd63f338ba7649e10cc90cb0f1364a846774f4615d84eb61ff149dbc45444b1c6f0fa48b64f17d184c1804f52b73c187eff7bde5b44e01b1a42c63db2b7737837294161183540a1311ba0d3023952034c4685cd163c44439499c4572a169f1f3386292987f228645940d6cf75439715592f571b102f937c1125e95c5165ad69687ff27ef7423bb3292feda135ec5bf66038b61eee6eaf5b63ab7b60aab0c0e835e2de1f87243ce223981c0f1f966168a6a4194dc914d55231e57a24493535d1d49b867a285e1f6910fe01f05f514d12d534157db3760d12c5547575c35d22f9a8aff6118528800eb2b19b7b6ebdb456c397b932e80dfda97ce9cf9e1e53b76f7813f93ec99ecd70bbef84bd742a05aba96424036bd81e74e7cd9bb1a55c77da8f93a685fb6f836f1dfffecaf2e62b5bbcd46fa6a8e7b5fb547a5a4d5786113aedeef2a2d888473eecbb26ff753a72fecd89e01ac8d2cd01b8bd12ced6673f01dc307e38c0080000',
            ['Content-Type', 'application/json; charset=UTF-8', 'Content-Encoding', 'gzip']
          );

        await helpers.loadFixtures(['cities', 'states']);
        const facility = await models.Facility.create({
          data: {
            'sFacility.FacilityGroup': {
              'sFacility.07': { _text: '3698 Sacramento Street' },
              'sFacility.08': { _text: '2411786'},
              'sFacility.09': { _text: '06'},
            }
          }
        });

        await facility.geocode();
        assert.deepStrictEqual(facility.lat, '37.7873437');
        assert.deepStrictEqual(facility.lng, '-122.4536086');
      });
    });

    describe('save()', () => {
      it('should extract from NEMSIS data into fields', async () => {
        await helpers.loadFixtures(['cities', 'counties', 'states', 'users']);
        const dataSet = await nemsis.parseStateDataSet(
          path.resolve(__dirname, '../../mocks/nemsis/washington/Resources/WA_StateDataSet.xml')
        );
        const { sFacilityGroup } = dataSet.json.StateDataSet.sFacility;
        const sFacility = sFacilityGroup['sFacility.FacilityGroup'][0];
        const facility = models.Facility.build();
        facility.data = {
          'sFacility.01': sFacilityGroup['sFacility.01'],
          'sFacility.FacilityGroup': {
            ...sFacility,
            'sFacility.05': { _text: 'Test NPI' },
            'sFacility.06': { _text: 'Test Unit' },
          },
        };
        await facility.save();

        assert.deepStrictEqual(facility.type, '1701005');
        assert.deepStrictEqual(facility.name, 'Astria Regional Medical Center');
        assert.deepStrictEqual(facility.locationCode, 'HAC.FS.00000102');
        assert.deepStrictEqual(facility.primaryDesignation, '9908007');
        assert.deepStrictEqual(facility.primaryNationalProviderId, 'Test NPI');
        assert.deepStrictEqual(facility.unit, 'Test Unit');
        assert.deepStrictEqual(facility.address, '110 S 9th Ave');
        assert.deepStrictEqual(facility.cityId, '2412314');
        assert.deepStrictEqual(facility.cityName, 'City of Yakima');
        assert.deepStrictEqual(facility.stateId, '53');
        assert.deepStrictEqual(facility.zip, '98902');
        assert.deepStrictEqual(facility.countyId, '53077');
        assert.deepStrictEqual(facility.countyName, 'Yakima County');
        assert.deepStrictEqual(facility.country, 'US');
        assert.deepStrictEqual(facility.geog?.coordinates, [-120.52111, 46.59662]);
        assert.deepStrictEqual(facility.lat, '46.59662');
        assert.deepStrictEqual(facility.lng, '-120.52111');
        assert.deepStrictEqual(facility.primaryPhone, '509-575-5000');
      });
    });
  });
});

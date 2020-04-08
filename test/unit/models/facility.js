'use strict'

const assert = require('assert');
const nock = require('nock');

const helpers = require('../../helpers');
const models = require('../../../models');

describe('models', function() {
  describe('Facility', function() {
    describe('findNear()', function() {
      beforeEach(async function() {
        await helpers.loadFixtures(['facilities']);
      });

      it('should return a paginated list of facilities near the specified point', async function() {
        const {docs, pages, total} = await models.Facility.findNear('37.7873437', '-122.4536086');
        assert.equal(total, 216);
        assert.equal(docs[0].name, 'CPMC - 3801 Sacramento Street'); /// this is the exact match to the coordinates above
      });

      it('should support additional query conditions', async function() {
        const {docs, pages, total} = await models.Facility.findNear('37.7873437', '-122.4536086', {
          where: {
            name: {[models.Sequelize.Op.iLike]: '%cpmc%'}
          }
        });
        assert(total, 7);
        assert.equal(docs[0].name, 'CPMC - 3801 Sacramento Street');
        for (let facility of docs) {
          assert(facility.name.match(/cpmc/i));
        }
      });
    });

    describe('geog', function() {
      it('should be set automatically when assigning to lat/lng', async function() {
        const facility = await models.Facility.create({
          address: '3698 Sacramento Street',
          city: 'San Francisco',
          state: 'CA',
          lat: '37.7873437',
          lng: '-122.4536086'
        });
        assert(facility.geog);
      });
    });

    describe('geocode()', function() {
      it('should geocode address into lat/lng', async function() {
        nock('https://maps.googleapis.com:443', {"encodedQueryParams":true})
          .get('/maps/api/geocode/json')
          .query({"address": "3698%20Sacramento%20Street%2C%20San%20Francisco%2C%20CA", "key": process.env.GOOGLE_MAPS_API_KEY})
          .reply(200,
            "1f8b08000000000002ffb5955b739a4014c7dff3297678b619b943dfbca03117735193b19d0cb3c21636c22e038b8966fcee5dd05a11536863791139ffb3fcce7fcf1edecf0000428c9234608900be82efd9037ebd6f7fb330745dae486c8786112588149525fd362ba0c4b3090c51261664cd3484464994f83466952ab68cd0e69d3c83c508f194349ca15800cf05f1baf1575023e8c4fc9e300a46f9b2d58485940ad498a60c7d12f18e3b8f5d4cc105c29ecf9daf24ac91b10f4932d58cc63ea5aed000424403ccb003834f7b4b402f86c4c189436bf8daabe00c2867c26cf9df184187a6245bbfba056a65edc34337c404f3d6850c2f900d6304ed002d50604ba7aca7c31dfa4163826175159dd63f338ba7649e10cc90cb0f1364a846774f4615d84eb61ff149dbc45444b1c6f0fa48b64f17d184c1804f52b73c187eff7bde5b44e01b1a42c63db2b7737837294161183540a1311ba0d3023952034c4685cd163c44439499c4572a169f1f3386292987f228645940d6cf75439715592f571b102f937c1125e95c5165ad69687ff27ef7423bb3292feda135ec5bf66038b61eee6eaf5b63ab7b60aab0c0e835e2de1f87243ce223981c0f1f966168a6a4194dc914d55231e57a24493535d1d49b867a285e1f6910fe01f05f514d12d534157db3760d12c5547575c35d22f9a8aff6118528800eb2b19b7b6ebdb456c397b932e80dfda97ce9cf9e1e53b76f7813f93ec99ecd70bbef84bd742a05aba96424036bd81e74e7cd9bb1a55c77da8f93a685fb6f836f1dfffecaf2e62b5bbcd46fa6a8e7b5fb547a5a4d5786113aedeef2a2d888473eecbb26ff753a72fecd89e01ac8d2cd01b8bd12ced6673f01dc307e38c0080000",
            [
              'Content-Type', 'application/json; charset=UTF-8',
              'Content-Encoding', 'gzip',
            ]);

        const facility = await models.Facility.create({
          address: '3698 Sacramento Street',
          city: 'San Francisco',
          state: 'CA'
        });
        await facility.geocode();
        assert.equal(facility.lat, '37.7873437');
        assert.equal(facility.lng, '-122.4536086');
      });
    });
  });  
});

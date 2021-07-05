/* eslint-disable no-await-in-loop */
const express = require('express');
const fs = require('fs');
const HttpStatus = require('http-status-codes');
const _ = require('lodash');
const path = require('path');

const models = require('../../models');
const interceptors = require('../interceptors');
const helpers = require('../helpers');
const nemsis = require('../../lib/nemsis');
const nemsisStates = require('../../lib/nemsis/states');
const { State } = require('../../lib/codes');

const router = express.Router();

router.get('/', (req, res) => {
  models.State.findAll({
    order: [['name', 'ASC']],
  }).then((records) => {
    res.json(records.map((r) => r.toJSON()));
  });
});

router.get('/new', interceptors.requireAdmin(), (req, res) => {
  /// fetch the list of repos from the NEMSIS states project
  nemsis.getStateRepos().then((json) => res.json(json));
});

router.post(
  '/:id/configure',
  interceptors.requireAdmin(),
  helpers.async(async (req, res) => {
    const state = await models.State.findByPk(req.params.id);
    if (!state) {
      res.status(HttpStatus.NOT_FOUND).end();
      return;
    }
    await state.update({
      dataSet: { status: 'Downloading state data from NEMSIS...' },
    });
    /// send back ACCEPTED state while processing continues in background
    res.status(HttpStatus.ACCEPTED).json(state);
    /// now start processing NEMSIS data in background...
    const repos = await nemsis.getStateRepos();
    const repo = _.find(repos.values, { name: state.name });
    if (!repo) {
      res.status(HttpStatus.NOT_FOUND).end();
      return;
    }
    const files = await nemsis.getStateRepoFiles(repo.slug);
    const tmpDir = await nemsis.downloadRepoFiles(repo.slug, files.values);
    try {
      await state.update({
        dataSet: { status: 'Processing downloaded state data...' },
      });
      let dataSet = null;
      let schematronXml = null;
      for (const filePath of files.values) {
        if (filePath.startsWith('Resources') && filePath.endsWith('StateDataSet.xml')) {
          dataSet = await nemsis.parseStateDataSet(path.resolve(tmpDir.name, filePath));
        } else if (filePath.startsWith('Schematron') && filePath.endsWith('EMSDataSet.sch.xml')) {
          schematronXml = fs.readFileSync(path.resolve(tmpDir.name, filePath));
        }
      }
      if (!dataSet) {
        state.dataSet = {};
        await state.save();
        return;
      }
      /// special-case handling for states
      if (nemsisStates[repo.slug] && nemsisStates[repo.slug].processStateRepoFiles) {
        await nemsisStates[repo.slug].processStateRepoFiles(tmpDir, files.values, dataSet);
      }
      /// add associated Agencies
      await state.update({
        dataSet: { status: 'Populating state agencies...' },
      });
      if (dataSet.json.StateDataSet.sAgency && dataSet.json.StateDataSet.sAgency.sAgencyGroup) {
        await models.sequelize.transaction(async (transaction) => {
          for (const sAgency of dataSet.json.StateDataSet.sAgency.sAgencyGroup) {
            const [agency] = await models.Agency.findOrBuild({
              where: {
                stateUniqueId: sAgency['sAgency.01']._text,
                number: sAgency['sAgency.02']._text,
                stateId: state.id,
              },
              transaction,
            });
            agency.name = sAgency['sAgency.03']._text;
            agency.data = sAgency;
            agency.createdById = req.user.id;
            agency.updatedById = req.user.id;
            await agency.save({ transaction });
          }
        });
      }
      /// add associated Facilities
      await state.update({
        dataSet: { status: 'Populating state facilities...' },
      });
      if (dataSet.json.StateDataSet.sFacility && dataSet.json.StateDataSet.sFacility.sFacilityGroup) {
        if (!Array.isArray(dataSet.json.StateDataSet.sFacility.sFacilityGroup)) {
          dataSet.json.StateDataSet.sFacility.sFacilityGroup = [dataSet.json.StateDataSet.sFacility.sFacilityGroup];
        }
        await models.sequelize.transaction(async (transaction) => {
          for (const sFacilityGroup of dataSet.json.StateDataSet.sFacility.sFacilityGroup) {
            const type = sFacilityGroup['sFacility.01']._text;
            if (sFacilityGroup['sFacility.FacilityGroup']) {
              for (const sFacility of sFacilityGroup['sFacility.FacilityGroup']) {
                const [facility] = await models.Facility.findOrBuild({
                  where: {
                    stateId: sFacility['sFacility.09'] ? sFacility['sFacility.09']._text : null,
                    locationCode: sFacility['sFacility.03'] ? sFacility['sFacility.03']._text : null,
                  },
                  transaction,
                });
                facility.type = type;
                facility.name = sFacility['sFacility.02']?._text;
                facility.unit = sFacility['sFacility.06']?._text;
                facility.address = sFacility['sFacility.07']?._text;
                facility.cityId = sFacility['sFacility.08']?._text;
                facility.cityName = await models.City.getName(sFacility['sFacility.08']?._text, {
                  transaction,
                });
                facility.stateId = sFacility['sFacility.09']?._text;
                facility.stateName = State.codeMapping[sFacility['sFacility.09']?._text]?.name;
                facility.zip = sFacility['sFacility.10']?._text;
                facility.countyId = sFacility['sFacility.11']?._text;
                if (sFacility['sFacility.13']) {
                  const m = sFacility['sFacility.13']._text.match(/([-\d.]+),([-\d.]+)/);
                  if (m) {
                    [, facility.lat, facility.lng] = m;
                  }
                } else if (process.env.NODE_ENV !== 'test') {
                  /// don't perform in test, so we don't exceed request quotas
                  await facility.geocode();
                }
                facility.dataSet = sFacility;
                await facility.save({ transaction });
              }
            }
          }
        });
      }
      state.isConfigured = true;
      state.dataSet = dataSet.json;
      state.dataSetXml = dataSet.xml;
      state.schematronXml = schematronXml;
      await state.save();
    } catch (error) {
      // console.log(error);
      state.dataSet = {};
      await state.save();
    } finally {
      tmpDir.removeCallback();
    }
  })
);

router.get(
  '/:id',
  helpers.async(async (req, res) => {
    const { id } = req.params;
    const state = await models.State.unscoped().findOne({
      where: { id },
      attributes: { exclude: ['dataSetXml', 'schematronXml'] },
    });
    if (state) {
      if (req.user?.isAdmin && state.dataSet?.status) {
        res.setHeader('X-Status', state.dataSet.status);
      }
      res.status(state.dataSet?.status ? HttpStatus.ACCEPTED : HttpStatus.OK).json(state.toJSON());
    } else {
      res.status(HttpStatus.NOT_FOUND).end();
    }
  })
);

module.exports = router;

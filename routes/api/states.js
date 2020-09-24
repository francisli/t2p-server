/* eslint-disable no-await-in-loop */
const express = require('express');
const fs = require('fs');
const HttpStatus = require('http-status-codes');
const path = require('path');

const models = require('../../models');
const interceptors = require('../interceptors');
const helpers = require('../helpers');
const nemsis = require('../../lib/nemsis');
const nemsisStates = require('../../lib/nemsis/states');
const { City, State } = require('../../lib/codes');

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
  '/',
  interceptors.requireAdmin(),
  helpers.async(async (req, res) => {
    const { repo } = req.body;
    const { name } = req.body;
    const id = State.nameMapping[name] ? State.nameMapping[name].code : null;
    if (!id) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).end();
      return;
    }
    let state = null;
    await models.sequelize.transaction(async (transaction) => {
      /// check if already exists
      state = await models.State.findByPk(id, { transaction });
      /// if not, create, store everything...
      if (!state) {
        /// create State record
        state = await models.State.create(
          {
            id,
            name,
            dataSet: { status: 'Downloading state data from NEMSIS...' },
          },
          { transaction }
        );
      } else if (state.isConfigured) {
        state = null;
        res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          messages: [
            { path: 'repo', message: 'This State has already been added.' },
          ],
        });
      } else {
        await state.update(
          { dataSet: { status: 'Downloading state data from NEMSIS...' } },
          { transaction }
        );
      }
    });
    if (!state) {
      return;
    }
    /// send back ACCEPTED state while processing continues in background
    res.status(HttpStatus.ACCEPTED).json(state);
    /// now start processing NEMSIS data in background...
    const files = await nemsis.getStateRepoFiles(repo);
    const tmpDir = await nemsis.downloadRepoFiles(repo, files.values);
    try {
      await state.update({
        dataSet: { status: 'Processing downloaded state data...' },
      });
      let dataSet = null;
      let schematronXml = null;
      for (const filePath of files.values) {
        if (
          filePath.startsWith('Resources') &&
          filePath.endsWith('StateDataSet.xml')
        ) {
          dataSet = await nemsis.parseStateDataSet(
            path.resolve(tmpDir.name, filePath)
          );
        } else if (
          filePath.startsWith('Schematron') &&
          filePath.endsWith('EMSDataSet.sch.xml')
        ) {
          schematronXml = fs.readFileSync(path.resolve(tmpDir.name, filePath));
        }
      }
      if (!dataSet) {
        state.dataSet = {};
        await state.save();
        return;
      }
      /// special-case handling for states
      if (nemsisStates[repo] && nemsisStates[repo].processStateRepoFiles) {
        await nemsisStates[repo].processStateRepoFiles(
          tmpDir,
          files.values,
          dataSet
        );
      }
      /// add associated Agencies
      await state.update({
        dataSet: { status: 'Populating state agencies...' },
      });
      if (
        dataSet.json.StateDataSet.sAgency &&
        dataSet.json.StateDataSet.sAgency.sAgencyGroup
      ) {
        await models.sequelize.transaction(async (transaction) => {
          for (const sAgency of dataSet.json.StateDataSet.sAgency
            .sAgencyGroup) {
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
      if (
        dataSet.json.StateDataSet.sFacility &&
        dataSet.json.StateDataSet.sFacility.sFacilityGroup
      ) {
        await models.sequelize.transaction(async (transaction) => {
          for (const sFacilityGroup of dataSet.json.StateDataSet.sFacility
            .sFacilityGroup) {
            const type = sFacilityGroup['sFacility.01']._text;
            if (sFacilityGroup['sFacility.FacilityGroup']) {
              for (const sFacility of sFacilityGroup[
                'sFacility.FacilityGroup'
              ]) {
                const [facility] = await models.Facility.findOrBuild({
                  where: {
                    stateId: sFacility['sFacility.09']
                      ? sFacility['sFacility.09']._text
                      : null,
                    locationCode: sFacility['sFacility.03']
                      ? sFacility['sFacility.03']._text
                      : null,
                  },
                  transaction,
                });
                facility.type = type;
                facility.name = sFacility['sFacility.02']._text;
                facility.unit = sFacility['sFacility.06']
                  ? sFacility['sFacility.06']._text
                  : null;
                facility.address = sFacility['sFacility.07']
                  ? sFacility['sFacility.07']._text
                  : null;
                facility.city = sFacility['sFacility.08']
                  ? await City.getName(sFacility['sFacility.08']._text, {
                      transaction,
                    })
                  : null;
                facility.state = sFacility['sFacility.09']
                  ? State.codeMapping[sFacility['sFacility.09']._text].abbr
                  : null;
                facility.zip = sFacility['sFacility.10']
                  ? sFacility['sFacility.10']._text
                  : null;
                if (sFacility['sFacility.13']) {
                  const m = sFacility['sFacility.13']._text.match(
                    /([-\d.]+),([-\d.]+)/
                  );
                  if (m) {
                    [, facility.lat, facility.lng] = m;
                  }
                } else if (process.env.NODE_ENV !== 'test') {
                  /// don't perform in test, so we don't exceed request quotas
                  facility.geocode();
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
      if (req.user?.isAdmin && state.dataSet.status) {
        res.setHeader('X-Status', state.dataSet.status);
      }
      res
        .status(state.dataSet.status ? HttpStatus.ACCEPTED : HttpStatus.OK)
        .json(state.toJSON());
    } else {
      res.status(HttpStatus.NOT_FOUND).end();
    }
  })
);

module.exports = router;

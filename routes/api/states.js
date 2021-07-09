/* eslint-disable no-await-in-loop */
const express = require('express');
const HttpStatus = require('http-status-codes');

const models = require('../../models');
const interceptors = require('../interceptors');
const helpers = require('../helpers');
const nemsis = require('../../lib/nemsis');

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
    await state.startConfiguration(req.user);
    /// send back ACCEPTED state while processing continues in background
    res.status(HttpStatus.ACCEPTED).json(state);
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
        res.setHeader('X-Status-Code', state.dataSet.status.code);
        res.setHeader('X-Status', state.dataSet.status.message);
      }
      res.json(state.toJSON());
    } else {
      res.status(HttpStatus.NOT_FOUND).end();
    }
  })
);

module.exports = router;

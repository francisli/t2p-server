'use strict';

const express = require('express');
const router = express.Router();
const models = require('../../models');
const interceptors = require('../interceptors');
const helpers = require('../helpers');
const _ = require('lodash');

router.get('/', interceptors.requireLogin, function(req, res, next) {
  models.Observation.findAll({
    order: [['created_at', 'DESC']]
  }).then(function(records) {
    res.json(records.map(r => r.toJSON()));
  });
});

router.post('/', interceptors.requireLogin, function(req, res, next) {
  const updatedAttributes = _.keys(req.body);
  _.pullAll(updatedAttributes, models.Observation.SYSTEM_ATTRIBUTES);
  const data = _.pick(req.body, updatedAttributes);
  models.sequelize.transaction(function(transaction) {
    return models.Patient.findOrCreate({
      where: { pin: req.body.pin },
      defaults: { version: 0, priority: data.priority, createdById: req.user.id, updatedById: req.user.id },
      transaction
    }).then(function([patient, created]) {
      return patient.update(_.extend({
        version: patient.version + 1,
        updatedById: req.user.id
      }, data), {
        returning: true,
        plain: true,
        transaction
      });
    }).then(function(patient) {
      return models.Observation.create(_.extend({
        patientId: patient.id,
        version: patient.version,
        createdById: req.user.id,
        updatedById: req.user.id,
        updatedAttributes: updatedAttributes
      }, data), {transaction});
    });
  }).then(function(record){
    res.json(record.toJSON());
  }).catch(function(error) {
    console.log(error);
    if (error.name == 'SequelizeValidationError') {
      res.status(422).json({
        status: 422,
        messages: error.errors
      });
    } else {
      res.sendStatus(500);
    }
  });
});

module.exports = router;

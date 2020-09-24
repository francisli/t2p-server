const express = require('express');
const HttpStatus = require('http-status-codes');

const models = require('../../models');
const helpers = require('../helpers');
const interceptors = require('../interceptors');

const router = express.Router();

router.get(
  '/',
  interceptors.requireAdmin(),
  helpers.async(async (req, res) => {
    const { page } = req.query;
    const { docs, pages, total } = await models.User.paginate({
      page: req.query.page || 1,
      order: [
        ['last_name', 'ASC'],
        ['first_name', 'ASC'],
        ['email', 'ASC'],
      ],
    });
    helpers.setPaginationHeaders(req, res, page, pages, total);
    res.json(docs.map((d) => d.toJSON()));
  })
);

router.get(
  '/me',
  interceptors.requireLogin(),
  helpers.async(async (req, res) => {
    const data = {
      user: req.user.toJSON(),
    };
    /// add any active scenes the user may be a part of
    data.user.activeScenes = (await req.user.getActiveScenes()).map((s) =>
      s.toJSON()
    );
    if (req.agency) {
      data.agency = req.agency.toJSON();
      data.employment = (
        await models.Employment.findOne({
          where: { userId: req.user.id, agencyId: req.agency.id },
        })
      ).toJSON();
    }
    res.json(data);
  })
);

router.get(
  '/:id',
  interceptors.requireAdmin(),
  helpers.async(async (req, res) => {
    const user = await models.User.findByPk(req.params.id);
    if (user) {
      res.json(user.toJSON());
    } else {
      res.status(HttpStatus.NOT_FOUND).end();
    }
  })
);

router.patch(
  '/:id',
  interceptors.requireAdmin(),
  helpers.async(async (req, res) => {
    let user;
    await models.sequelize.transaction(async (transaction) => {
      user = await models.User.findByPk(req.params.id, { transaction });
      if (user) {
        await helpers.handleUpload(
          user,
          'iconUrl',
          req.body.iconUrl,
          'users/icon'
        );
        await user.update(
          {
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            email: req.body.email,
            iconUrl: user.iconUrl,
            password: req.body.password,
          },
          { transaction }
        );
      }
    });
    if (user) {
      res.json(user.toJSON());
    } else {
      res.status(HttpStatus.NOT_FOUND).end();
    }
  })
);

module.exports = router;

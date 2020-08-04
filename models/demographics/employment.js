'use strict';

const _ = require('lodash');
const moment = require('moment');
const sequelizePaginate = require('sequelize-paginate')
const uuid = require('uuid/v4');

const mailer = require('../../emails/mailer');
const nemsis = require('../../lib/nemsis');

const {NemsisModel} = require('../nemsis-model');

module.exports = (sequelize, DataTypes) => {
  class Employment extends NemsisModel {
    static get Roles() {
      return {
        BILLING: 'BILLING',
        CONFIGURAITON: 'CONFIGURATION',
        PERSONNEL: 'PERSONNEL',
        REPORTING: 'REPORTING'
      };
    };

    static associate(models) {
      // associations can be defined here
      Employment.belongsTo(models.DemAgency, {as: 'agency'});
      Employment.belongsTo(models.User, {as: 'user'});
      Employment.belongsTo(models.User, {as: 'updatedBy'});
      Employment.belongsTo(models.User, {as: 'createdBy'});
    };
  
    sendInvitationEmail = async function() {
      const agency = await this.getAgency();
      const user = await this.getCreatedBy();
      await mailer.send({
        template: 'invitation',
        message: {
          to: `${this.fullNameAndEmail}`
        },
        locals: {
          agencyName: agency?.name,
          senderName: user?.fullName,
          url: `${agency?.baseUrl}/sign-up?invitationCode=${this.invitationCode}`
        }
      });
    }
  };
  Employment.init({
    lastName: {
      type: DataTypes.STRING,
      field: 'last_name',
      set(value) {
        this.setDataValue('lastName', value);
        this.setNemsisValue(['dPersonnel.NameGroup', 'dPersonnel.01'], value);
      }
    },
    firstName: {
      type: DataTypes.STRING,
      field: 'first_name',
      set(value) {
        this.setDataValue('firstName', value);
        this.setNemsisValue(['dPersonnel.NameGroup', 'dPersonnel.02'], value);
      }
    },
    middleName: {
      type: DataTypes.STRING,
      field: 'middle_name',
      set(value) {
        this.setDataValue('middleName', value);
        this.setNemsisValue(['dPersonnel.NameGroup', 'dPersonnel.03'], value);
      }
    },
    email: {
      type: DataTypes.CITEXT,
      field: 'email',
      set(value) {
        this.setDataValue('email', value);
        this.setNemsisValue(['dPersonnel.10'], value);
      }
    },
    fullName: {
      type: DataTypes.VIRTUAL,
      get() {
        let name = `${this.firstName ?? ''} ${this.middleName ?? ''}`.trim();
        return `${name} ${this.lastName ?? ''}`.trim();
      },
      set(value) {
        let words = value.split(/\s+/);
        if (words.length > 0) {
          this.firstName = words[0];
        } else {
          this.firstName = null;
        }
        if (words.length > 1) {
          this.lastName = words[words.length - 1];
        } else {
          this.lastName = null;
        }
        if (words.length > 2) {
          this.middleName = words.slice(1, words.length - 1).join(' ');
        } else {
          this.middleName = null;
        }
      }
    },
    fullNameAndEmail: {
      type: DataTypes.VIRTUAL,
      get() {        
        return `${this.fullName} <${this.email}>`.trim();
      },
      set(value) {
        throw new Error('Do not try to set the `fullNameAndEmail` value!');
      }
    },
    invitationCode: {
      type: DataTypes.UUID,
      field: 'invitation_code'
    },
    invitationAt: {
      type: DataTypes.DATE,
      field: 'invitation_at'
    },
    isPending: {
      type: DataTypes.BOOLEAN,
      field: 'is_pending',
      allowNull: false,
      defaultValue: false
    },
    status: DataTypes.STRING,
    statusAt: {
      type: DataTypes.DATE,
      field: 'status_at'
    },
    primaryJobRole: {
      type: DataTypes.STRING,
      field: 'primary_job_role'
    },
    hiredAt: {
      type: DataTypes.DATE,
      field: 'hired_at'
    },
    startedAt: {
      type: DataTypes.DATE,
      field: 'started_at'
    },
    endedAt: {
      type: DataTypes.DATE,
      field: 'ended_at'
    },
    isActive: {
      type: DataTypes.VIRTUAL(DataTypes.BOOLEAN, ['isPending', 'endedAt']),
      get: function() {
        return !this.isPending && (this.endedAt == null || moment(this.endedAt).isAfter(moment()));
      }
    },
    isOwner: {
      type: DataTypes.BOOLEAN,
      field: 'is_owner'
    },
    roles: DataTypes.ARRAY(DataTypes.ENUM('BILLING', 'CONFIGURATION', 'PERSONNEL', 'REPORTING')),
    data: DataTypes.JSONB,
    isValid: {
      type: DataTypes.BOOLEAN,
      field: 'is_valid'
    }
  }, {
    sequelize,
    modelName: 'Employment',
    schema: 'demographics',
    tableName: 'employments',
    underscored: true,
    validate: {
      schema: async function() {
        this.validationError = await nemsis.validateSchema('dPersonnel_v3.xsd', 'dPersonnel', 'dPersonnel.PersonnelGroup', this.data);
      }
    }
  });
  Employment.beforeValidate(function(record, options) {
    record.data = record.data || {};
    if (record.getNemsisAttributeValue([], 'UUID') === undefined) {
      record.setNemsisAttributeValue([], 'UUID', uuid.v4());
    }
    if (!record.userId && !record.invitationCode) {
      record.setDataValue('invitationCode', uuid.v4());
      record.setDataValue('invitationAt', new Date());
    }
  });
  Employment.beforeSave(async function(record, options) {
    if (!record.id) {
      record.setDataValue('id', record.getNemsisAttributeValue([], 'UUID'));
    }
    if (record.userId) {
      const user = await record.getUser({transaction: options.transaction});
      record.setNemsisValue(['dPersonnel.NameGroup', 'dPersonnel.01'], user.lastName);
      record.setNemsisValue(['dPersonnel.NameGroup', 'dPersonnel.02'], user.firstName);
      record.addNemsisValue(['dPersonnel.10'], user.email);
      /// ensure data column is saved after changes: https://github.com/sequelize/sequelize/issues/3534
      options.fields.push('data');
    }
    record.setDataValue('lastName', record.getFirstNemsisValue(['dPersonnel.NameGroup', 'dPersonnel.01']));
    record.setDataValue('firstName', record.getFirstNemsisValue(['dPersonnel.NameGroup', 'dPersonnel.02']));
    record.setDataValue('middleName', record.getFirstNemsisValue(['dPersonnel.NameGroup', 'dPersonnel.03']));
    record.setDataValue('email', record.getFirstNemsisValue(['dPersonnel.10']));
    record.setDataValue('status', record.getFirstNemsisValue(['dPersonnel.31']));
    if (record.changed('status')) {
      record.setDataValue('statusAt', new Date());
    }
    record.setDataValue('hiredAt', record.getFirstNemsisValue(['dPersonnel.33']));
    record.setDataValue('primaryJobRole', record.getFirstNemsisValue(['dPersonnel.34']));
  
    record.setDataValue('isValid', record.getNemsisAttributeValue([], ['pr:isValid']));
  });
  Employment.afterCreate(async function(record, options) {
    if (record.invitationCode) {
      await record.sendInvitationEmail();
    }
  });
  sequelizePaginate.paginate(Employment);
  return Employment;
};

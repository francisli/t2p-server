/* eslint-disable no-await-in-loop */
const { Model } = require('sequelize');
const fs = require('fs');
const HttpStatus = require('http-status-codes');
const _ = require('lodash');
const path = require('path');

const nemsis = require('../lib/nemsis');
// const nemsisStates = require('../lib/nemsis/states');
const StateCodes = require('../lib/codes/state');

module.exports = (sequelize, DataTypes) => {
  class State extends Model {
    static associate(models) {
      // associations can be defined here
      State.hasMany(models.Agency, { as: 'agencies', foreignKey: 'stateId' });
    }

    toJSON() {
      const attributes = { ...this.get() };
      // by default, don't return the large attributes
      delete attributes.dataSet;
      delete attributes.dataSetXml;
      delete attributes.schematronXml;
      return attributes;
    }

    async startConfiguration(user) {
      // synchronously set starting status state...
      await this.update({
        dataSet: {
          status: {
            code: HttpStatus.ACCEPTED,
            message: 'Starting state configuration...',
          },
        },
      });
      // configure in background...
      this.configure(user.id);
    }

    async configure(userId) {
      // fetch NEMSIS state repositories list and find state repository
      const repos = await nemsis.getStateRepos();
      const repo = _.find(repos.values, { name: this.name });
      if (!repo) {
        await this.update({
          dataSet: {
            status: {
              code: HttpStatus.NOT_FOUND,
              message: 'NEMSIS state data repository not found.',
            },
          },
        });
        return;
      }
      // download all the files in the state repository
      const files = await nemsis.getStateRepoFiles(repo.slug);
      const tmpDir = await nemsis.downloadRepoFiles(repo.slug, files.values);
      try {
        await this.update({
          dataSet: {
            status: {
              code: HttpStatus.ACCEPTED,
              message: 'Processing downloaded NEMSIS state data...',
            },
          },
        });
        // find the NEMSIS state data set and schematron files
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
          await this.update({
            dataSet: {
              status: {
                code: HttpStatus.NOT_FOUND,
                message: 'NEMSIS state data set not found.',
              },
            },
          });
          return;
        }
        if (!schematronXml) {
          await this.update({
            dataSet: {
              status: {
                code: HttpStatus.NOT_FOUND,
                message: 'NEMSIS state schematron not found.',
              },
            },
          });
          return;
        }
        // special-case handling for states
        // if (nemsisStates[repo.slug] && nemsisStates[repo.slug].processStateRepoFiles) {
        //   await nemsisStates[repo.slug].processStateRepoFiles(tmpDir, files.values, dataSet);
        // }
        // add associated Agencies from the state data set
        await this.update({
          dataSet: {
            status: {
              code: HttpStatus.ACCEPTED,
              message: 'Populating state agencies...',
            },
          },
        });
        if (dataSet.json.StateDataSet.sAgency && dataSet.json.StateDataSet.sAgency.sAgencyGroup) {
          await sequelize.transaction(async (transaction) => {
            for (const sAgency of dataSet.json.StateDataSet.sAgency.sAgencyGroup) {
              const [agency] = await sequelize.models.Agency.findOrBuild({
                where: {
                  stateUniqueId: sAgency['sAgency.01']._text,
                  number: sAgency['sAgency.02']._text,
                  stateId: this.id,
                },
                transaction,
              });
              agency.name = sAgency['sAgency.03']._text;
              agency.data = sAgency;
              agency.createdById = userId;
              agency.updatedById = userId;
              await agency.save({ transaction });
            }
          });
        }
        // add associated Facilities from state data set
        await this.update({
          dataSet: {
            status: {
              code: HttpStatus.ACCEPTED,
              message: 'Populating state facilities...',
            },
          },
        });
        if (dataSet.json.StateDataSet.sFacility && dataSet.json.StateDataSet.sFacility.sFacilityGroup) {
          if (!Array.isArray(dataSet.json.StateDataSet.sFacility.sFacilityGroup)) {
            dataSet.json.StateDataSet.sFacility.sFacilityGroup = [dataSet.json.StateDataSet.sFacility.sFacilityGroup];
          }
          await sequelize.transaction(async (transaction) => {
            for (const sFacilityGroup of dataSet.json.StateDataSet.sFacility.sFacilityGroup) {
              const type = sFacilityGroup['sFacility.01']._text;
              if (sFacilityGroup['sFacility.FacilityGroup']) {
                for (const sFacility of sFacilityGroup['sFacility.FacilityGroup']) {
                  const [facility] = await sequelize.models.Facility.findOrBuild({
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
                  facility.cityName = await sequelize.models.City.getName(sFacility['sFacility.08']?._text, {
                    transaction,
                  });
                  facility.stateId = sFacility['sFacility.09']?._text;
                  facility.stateName = StateCodes.codeMapping[sFacility['sFacility.09']?._text]?.name;
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
                  facility.createdById = userId;
                  facility.updatedById = userId;
                  await facility.save({ transaction });
                }
              }
            }
          });
        }
        await this.update({
          isConfigured: true,
          dataSet: dataSet.json,
          dataSetXml: dataSet.xml,
          schematronXml,
        });
      } catch (error) {
        await this.update({
          dataSet: {
            status: {
              code: HttpStatus.INTERNAL_SERVER_ERROR,
              message: error.toString(),
            },
          },
        });
      } finally {
        tmpDir.removeCallback();
      }
    }
  }

  State.init(
    {
      name: DataTypes.STRING,
      abbr: {
        type: DataTypes.VIRTUAL(DataTypes.STRING),
        get() {
          return StateCodes.codeMapping[this.id]?.abbr;
        },
      },
      borderStates: {
        type: DataTypes.JSONB,
        field: 'border_states',
      },
      isConfigured: DataTypes.BOOLEAN,
      dataSet: {
        type: DataTypes.JSONB,
        field: 'data_set',
      },
      dataSetXml: {
        type: DataTypes.TEXT,
        field: 'data_set_xml',
      },
      schematronXml: {
        type: DataTypes.TEXT,
        field: 'schematron_xml',
      },
    },
    {
      sequelize,
      modelName: 'State',
      tableName: 'states',
      underscored: true,
      defaultScope: {
        attributes: {
          exclude: ['dataSet', 'dataSetXml', 'schematronXml'],
        },
      },
    }
  );

  return State;
};

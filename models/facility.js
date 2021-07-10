const sequelizePaginate = require('sequelize-paginate');
const GoogleMapsClient = require('@googlemaps/google-maps-services-js').Client;

const nemsis = require('../lib/nemsis');

const { Base } = require('./base');

module.exports = (sequelize, DataTypes) => {
  class Facility extends Base {
    static associate(models) {
      Facility.belongsTo(models.Facility, { as: 'canonicalFacility' });
      Facility.belongsTo(models.City, { as: 'city' });
      Facility.belongsTo(models.County, { as: 'county' });
      Facility.belongsTo(models.State, { as: 'state' });
      Facility.belongsTo(models.User, { as: 'updatedBy' });
      Facility.belongsTo(models.User, { as: 'createdBy' });
      Facility.belongsTo(models.Agency, { as: 'createdByAgency' });

      Facility.hasMany(models.Patient, {
        as: 'patients',
        foreignKey: 'transportFacilityId',
      });
      Facility.hasMany(models.PatientObservation, {
        as: 'patientObservations',
        foreignKey: 'transportFacilityId',
      });
    }

    static findNear(lat, lng, options = {}) {
      options.order = sequelize.literal(`"Facility".geog <-> ST_MakePoint(${lng}, ${lat})::geography`);
      return Facility.paginate(options);
    }

    toJSON() {
      const attributes = { ...this.get() };
      /// by default, don't return the large attributes
      delete attributes.data;
      delete attributes.geog;
      return attributes;
    }

    async geocode() {
      if (this.address && this.cityName && this.stateName) {
        const client = new GoogleMapsClient();
        const response = await client.geocode({
          params: {
            address: `${this.address}, ${this.cityName}, ${this.stateName}`,
            key: process.env.GOOGLE_MAPS_SERVER_API_KEY,
          },
        });
        if (response.data && response.data.results && response.data.results.length > 0) {
          /// take the (usually only) first result
          const result = response.data.results[0];
          if (result.geometry && result.geometry.location) {
            this.lat = `${result.geometry.location.lat}`;
            this.lng = `${result.geometry.location.lng}`;
          }
        }
      }
    }
  }

  Facility.init(
    {
      type: DataTypes.STRING,
      name: DataTypes.STRING,
      locationCode: {
        type: DataTypes.STRING,
        field: 'location_code',
      },
      primaryDesignation: {
        type: DataTypes.STRING,
        field: 'primary_designation',
      },
      primaryNationalProviderId: {
        type: DataTypes.STRING,
        field: 'primary_national_provider_id',
      },
      unit: DataTypes.STRING,
      address: DataTypes.STRING,
      cityName: {
        type: DataTypes.STRING,
        field: 'city_name',
      },
      stateName: {
        type: DataTypes.STRING,
        field: 'state_name',
      },
      zip: DataTypes.STRING,
      countyName: {
        type: DataTypes.STRING,
        field: 'county_name',
      },
      country: DataTypes.STRING,
      lat: {
        type: DataTypes.VIRTUAL(DataTypes.STRING),
        get() {
          return this.geog?.coordinates?.[1]?.toString();
        },
        set(newValue) {
          const geog = this.geog || { type: 'Point', coordinates: [0, 0] };
          geog.coordinates[1] = parseFloat(newValue.toString());
          this.setDataValue('geog', geog);
          const type = this.createdByAgencyId ? 'dFacility' : 'sFacility';
          this.setNemsisValue([`${type}.FacilityGroup`, `${type}.13`], `${geog.coordinates[1]},${geog.coordinates[0]}`);
        },
      },
      lng: {
        type: DataTypes.VIRTUAL(DataTypes.STRING),
        get() {
          return this.geog?.coordinates?.[0]?.toString();
        },
        set(newValue) {
          const geog = this.geog || { type: 'Point', coordinates: [0, 0] };
          geog.coordinates[0] = parseFloat(newValue.toString());
          this.setDataValue('geog', geog);
          const type = this.createdByAgencyId ? 'dFacility' : 'sFacility';
          this.setNemsisValue([`${type}.FacilityGroup`, `${type}.13`], `${geog.coordinates[1]},${geog.coordinates[0]}`);
        },
      },
      geog: DataTypes.GEOGRAPHY,
      primaryPhone: {
        type: DataTypes.STRING,
        field: 'primary_phone',
      },
      data: DataTypes.JSONB,
      isValid: {
        type: DataTypes.BOOLEAN,
        field: 'is_valid',
      },
    },
    {
      sequelize,
      modelName: 'Facility',
      tableName: 'facilities',
      underscored: true,
      validate: {
        async schema() {
          this.validationError = await nemsis.validateSchema('dFacility_v3.xsd', 'dFacility', 'dFacilityGroup', this.data);
        },
      },
    }
  );

  Facility.beforeSave(async (record, options) => {
    if (!record.id) {
      record.setDataValue('id', record.data?._attributes?.UUID);
    }
    const type = record.createdByAgencyId ? 'dFacility' : 'sFacility';
    record.setDataValue('type', record.getFirstNemsisValue([`${type}.01`]));
    record.setDataValue('name', record.getFirstNemsisValue([`${type}.FacilityGroup`, `${type}.02`]));
    record.setDataValue('locationCode', record.getFirstNemsisValue([`${type}.FacilityGroup`, `${type}.03`]));
    record.setDataValue('primaryDesignation', record.getFirstNemsisValue([`${type}.FacilityGroup`, `${type}.04`]));
    record.setDataValue('primaryNationalProviderId', record.getFirstNemsisValue([`${type}.FacilityGroup`, `${type}.05`]));
    record.setDataValue('unit', record.getFirstNemsisValue([`${type}.FacilityGroup`, `${type}.06`]));
    record.setDataValue('address', record.getFirstNemsisValue([`${type}.FacilityGroup`, `${type}.07`]));
    record.setDataValue(
      'cityName',
      await sequelize.models.City.getName(record.getFirstNemsisValue([`${type}.FacilityGroup`, `${type}.08`]), options)
    );
    if (record.cityName) {
      record.setDataValue('cityId', record.getFirstNemsisValue([`${type}.FacilityGroup`, `${type}.08`]));
    }
    record.setDataValue(
      'stateName',
      await sequelize.models.State.getNameForCode(record.getFirstNemsisValue([`${type}.FacilityGroup`, `${type}.09`]), options)
    );
    if (record.stateName) {
      record.setDataValue('stateId', record.getFirstNemsisValue([`${type}.FacilityGroup`, `${type}.09`]));
    }
    record.setDataValue('zip', record.getFirstNemsisValue([`${type}.FacilityGroup`, `${type}.10`]));
    record.setDataValue(
      'countyName',
      await sequelize.models.County.getName(record.getFirstNemsisValue([`${type}.FacilityGroup`, `${type}.11`]))
    );
    if (record.countyName) {
      record.setDataValue('countyId', record.getFirstNemsisValue([`${type}.FacilityGroup`, `${type}.11`]));
    }
    record.setDataValue('country', record.getFirstNemsisValue([`${type}.FacilityGroup`, `${type}.12`]));
    record.setDataValue('geog', Base.geometryFor(record.getFirstNemsisValue([`${type}.FacilityGroup`, `${type}.13`])));
    record.setDataValue('primaryPhone', record.getFirstNemsisValue([`${type}.FacilityGroup`, `${type}.15`]));
    record.setDataValue('isValid', record.data?._attributes?.['pr:isValid']);
  });

  sequelizePaginate.paginate(Facility);

  return Facility;
};

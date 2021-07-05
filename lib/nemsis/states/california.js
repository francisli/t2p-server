/* eslint-disable no-await-in-loop */
const fetch = require('node-fetch');
const fs = require('fs');
const _ = require('lodash');
const mkdirp = require('mkdirp');
const path = require('path');
const tmp = require('tmp');
const XLSX = require('xlsx');

const { Country, State } = require('../../codes');
const models = require('../../../models');
const CommonTypes = require('../commonTypes');

/// parse an XLSX spreadsheet at the given path
const parseSpreadsheet = (filePath) => {
  return new Promise((resolve) => {
    const workbook = XLSX.readFile(filePath);
    /// for now, just take the first sheet
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    resolve({ rows });
  });
};

/// helper for setting XML parser compatible json values
const setValue = (obj, property, isOptional, inputValue, isMulti, attrs) => {
  let value = `${inputValue || ''}`;
  if (value !== '') {
    if (obj[property]) {
      if (!Array.isArray(obj[property])) {
        obj[property] = [obj[property]];
      }
      value = { _text: value };
      if (attrs) {
        value._attributes = attrs;
      }
      obj[property].push(value);
    } else if (isMulti) {
      const values = `${value}`.split(',');
      for (value of values) {
        if (value !== '') {
          obj[property] = obj[property] || [];
          value = { _text: value };
          if (attrs) {
            value._attributes = attrs;
          }
          obj[property].push(value);
        }
      }
    } else {
      value = { _text: value };
      if (attrs) {
        value._attributes = attrs;
      }
      obj[property] = value;
    }
  } else if (!isOptional) {
    obj[property] = { _attributes: { 'xsi:nil': true, NV: '7701003' } };
  }
};

/// a few additional CA names that don't exactly match the v3.5 enum type
const CATypeOfFacilityNameValueMapping = {
  'Independent Living Facility': '1701001',
  Morgue: '1701023',
  'Rehabilitation Facility': '1701013',
};
const CAHospitalDesignationNameValueMapping = {
  'Stroke Center': '9908017',
  'STEMI Center (24/7)': '9908033',
};
const CACityMapping = {
  'City of West Hills': '2410877', // City of Los Angeles
  'Beale Air Force Base Census Designated Place': '2407813',
  'Fort Mojave Census Designated Place': '2628855', // Fort Mohave Census Designated Place
  Carmel: '2409987', // City of Carmel-by-the-Sea
  Arleta: '2410877', // City of Los Angeles
  'Echo Park': '2410877', // City of Los Angeles
  'McClellan Park': '2583067', // McClellan Park Census Designated Place
};
const CACountryMapping = {
  'United States': 'US', // United States of America
};
const parseFacilitySpreadsheet = async (data) => {
  const facilities = {};
  for (const row of data.rows) {
    const type =
      CommonTypes.enums.TypeOfFacility.nameMapping[row['Type of Facility']] ||
      CATypeOfFacilityNameValueMapping[row['Type of Facility']] ||
      null;
    facilities[type] = facilities[type] || [];
    const facility = {};
    setValue(facility, 'sFacility.02', false, row.Name);
    setValue(facility, 'sFacility.03', false, row.Code);
    if (row['Hospital Designation']) {
      const names = row['Hospital Designation'].split(',');
      for (const name of names) {
        if (name !== '') {
          const value = CommonTypes.enums.HospitalDesignation.nameMapping[name] || CAHospitalDesignationNameValueMapping[name];
          setValue(facility, 'sFacility.04', false, value);
        }
      }
    }
    setValue(
      facility,
      'sFacility.05',
      true,
      row['National Provider Identifier (comma separate for multiple. Max length allowed per code is 10 character. '],
      true
    );
    setValue(facility, 'sFacility.06', true, row['Room, \r\nSuite \r\nor Apt.']);
    setValue(facility, 'sFacility.07', true, `${row.Address || ''}\n${row.Address2 || ''}`.trim());

    let countryCode = null;
    if (row.Country && row.Country !== '') {
      countryCode = Country.getAlpha2Code(row.Country, 'en');
      if (!countryCode) {
        countryCode = CACountryMapping[row.Country];
        if (!countryCode) {
          throw new Error(`Not found: ${row.Country}`);
        }
      }
      if (countryCode) {
        setValue(facility, 'sFacility.12', true, countryCode);
      }
    }

    let stateCode = null;
    if (row.State && row.State !== '') {
      const state = State.nameMapping[row.State];
      if (state) {
        stateCode = state.code;
        setValue(facility, 'sFacility.09', false, stateCode);
      }
    }

    let countyCode = null;
    if (row.County && row.County !== '') {
      countyCode = await models.County.getCode(row.County, stateCode);
      // if (!countyCode) {
      //   throw new Error(`Not found county: ${row.County}`);
      // }
      if (countyCode) {
        setValue(facility, 'sFacility.11', false, countyCode);
      }
    }

    if (row.City && row.City !== '') {
      let code = await models.City.getCode(row.City, stateCode);
      if (!code) {
        code = CACityMapping[row.City];
      }
      setValue(facility, 'sFacility.08', true, code);
    }

    setValue(facility, 'sFacility.10', false, row['Postal \r\nCode']);
    const gps = `${row.Latitude},${row.Longitude}`.trim();
    if (gps.match(/[-\d.]+,[-\d.]+/)) {
      setValue(facility, 'sFacility.13', true, gps);
    }
    setValue(facility, 'sFacility.15', true, row['Work \r\nPhone \r\nNumber'], true, { PhoneNumberType: '9913009' });
    setValue(facility, 'sFacility.15', true, row['Fax \r\nNumber'], true, {
      PhoneNumberType: '9913001',
    });
    setValue(facility, 'sFacility.15', true, row['Home \r\nPhone \r\nNumber'], true, { PhoneNumberType: '9913003' });
    setValue(facility, 'sFacility.15', true, row['Mobile \r\nPhone \r\nNumber'], true, { PhoneNumberType: '9913005' });
    setValue(facility, 'sFacility.15', true, row['Pager \r\nNumber'], true, {
      PhoneNumberType: '9913007',
    });
    setValue(facility, 'sFacility.15', true, row['Primary \r\nNumber'], true, {
      PhoneNumberType: '9913009',
    });
    facilities[type].push(facility);
  }
  const sFacility = { sFacilityGroup: [] };
  for (const type of Object.keys(facilities)) {
    const sFacilityGroup = { 'sFacility.FacilityGroup': [] };
    if (type === 'null') {
      sFacilityGroup['sFacility.01'] = {
        _attributes: { 'xsi:nil': true, NV: '7701003' },
      };
    } else {
      sFacilityGroup['sFacility.01'] = { _text: type };
    }
    for (const facility of facilities[type]) {
      sFacilityGroup['sFacility.FacilityGroup'].push(facility);
    }
    sFacility.sFacilityGroup.push(sFacilityGroup);
  }
  return sFacility;
};

const appendAgenciesFromSpreadsheet = (dataSet) => {
  const tmpDir = tmp.dirSync();
  const fileName = 'Agency_list.xlsx';
  return new Promise((resolve, reject) => {
    fetch(`https://emsa.ca.gov/wp-content/uploads/sites/71/2021/04/201_CEMSIS_Provider_Agency_List-04.15.2021.xlsx`)
      .then((res) => {
        const destPath = path.resolve(tmpDir.name, fileName);
        mkdirp.sync(path.dirname(destPath));
        const dest = fs.createWriteStream(destPath);
        dest.on('error', (err) => reject(err));
        dest.on('finish', () => resolve(destPath));
        res.body.pipe(dest);
      })
      .catch((err) => reject(err));
  })
    .then((filePath) => {
      return parseSpreadsheet(path.resolve(tmpDir.name, filePath));
    })
    .then((data) => {
      const sAgencyGroup = [];
      for (const row of data.rows) {
        const agency = {};
        setValue(agency, 'sAgency.01', true, row.CEMSIS_Num);
        setValue(agency, 'sAgency.02', true, row.CEMSIS_Num);
        if (_.find(dataSet.json.StateDataSet.sAgency.sAgencyGroup, agency) === undefined) {
          setValue(agency, 'sAgency.03', true, row.EMS_Provider_Name);
          sAgencyGroup.push(agency);
        }
      }
      dataSet.json.StateDataSet.sAgency.sAgencyGroup = dataSet.json.StateDataSet.sAgency.sAgencyGroup.concat(sAgencyGroup);
      return { sAgencyGroup };
    })
    .finally(() => {
      tmpDir.removeCallback();
    });
};

const processStateRepoFiles = async (tmpDir, files, dataSet) => {
  let facilitySpreadsheet = null;
  for (const filePath of files) {
    if (filePath.startsWith('Resources') && filePath.endsWith('Facilities.xlsx')) {
      facilitySpreadsheet = await parseSpreadsheet(path.resolve(tmpDir.name, filePath));
      break;
    }
  }
  if (facilitySpreadsheet) {
    /// convert to sFacility records and add
    dataSet.json.StateDataSet.sFacility = await parseFacilitySpreadsheet(facilitySpreadsheet);
  }
  /// now download and add additional agency records from state-hosted spreadsheet (outside of NEMSIS repo)
  await appendAgenciesFromSpreadsheet(dataSet);
};

module.exports = {
  appendAgenciesFromSpreadsheet,
  parseFacilitySpreadsheet,
  parseSpreadsheet,
  processStateRepoFiles,
};

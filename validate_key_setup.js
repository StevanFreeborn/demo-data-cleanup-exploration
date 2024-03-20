'use strict';

import { OnspringClient, PagingRequest } from 'onspring-api-sdk';
import fs from 'fs';
import 'dotenv/config';

const baseUrl = process.env.API_URL;
const apiKey = process.env.API_KEY;

console.log('Validating Onspring key setup...');

console.log('Reading fields.csv...');

const fieldsCsv = fs.readFileSync('fields.csv', 'utf-8');

console.log('Parsing fields.csv...');

const csvMap = fieldsCsv
  .split('\r\n')
  .slice(1)
  .map(row => row.split(','))
  .reduce((acc, row) => {
    if (acc[row[0]]) {
      acc[row[0]].push(row[1]);
      return acc;
    }

    acc[row[0]] = [row[1]];
    return acc;
  }, {});

console.log('Fetching apps from Onspring...');

const client = new OnspringClient(baseUrl, apiKey);

const onspringMap = {};
let apps = [];
let pageNumber = 1;
let totalPages = 1;

while (pageNumber <= totalPages) {
  try {
    const response = await client.getApps(new PagingRequest(pageNumber, 100));
    apps = apps.concat(response.data.items);
    pageNumber++;
    totalPages = response.data.totalPages;
  } catch (e) {
    console.log('Error fetching apps');
    console.log(e);
  }
}

console.log('Fetching fields from Onspring...');

for (const app of apps) {
  let fields = [];
  let pageNumber = 1;
  let totalPages = 1;

  while (pageNumber <= totalPages) {
    try {
      const response = await client.getFieldsByAppId(
        app.id,
        new PagingRequest(pageNumber, 100)
      );
      fields = fields.concat(response.data.items);
      pageNumber++;
      totalPages = response.data.totalPages;
    } catch (e) {
      console.error(`Error fetching fields for app "${app.name}".`);
      console.error(e);
    }
  }

  onspringMap[app.name] = fields;
}

console.log('Validating apps...');

const expectedApps = Object.keys(csvMap);
const actualApps = Object.keys(onspringMap);

const missingApps = expectedApps.filter(
  app => actualApps.includes(app) === false
);

if (missingApps.length === 0) {
  console.log('All apps found in Onspring.');
} else {
  for (const app of missingApps) {
    console.warn(`App "${app}" not found in Onspring.`);
  }
}

console.log('Validating fields...');

if (missingApps.length === 0) {
  console.log('All fields found in Onspring.');
} else {
  for (const app of expectedApps) {
    if (missingApps.includes(app)) {
      continue;
    }

    const expectedFields = csvMap[app];
    const actualFields = onspringMap[app].map(field => field.name);

    const missingFields = expectedFields.filter(
      field => actualFields.includes(field) === false
    );

    for (const field of missingFields) {
      console.warn(`Field "${field}" not found in app "${app}".`);
    }
  }
}

console.log('Checking for formula fields...');
const formulaFields = [];

for (const app of expectedApps) {
  if (missingApps.includes(app)) {
    continue;
  }

  const expectedFields = csvMap[app];
  const actualFields = onspringMap[app].map(field => field.name);

  for (const field of expectedFields) {
    if (actualFields.includes(field) === false) {
      continue;
    }

    const actualField = onspringMap[app].find(f => f.name === field);

    if (actualField.type === 'Formula') {
      console.warn(`Field "${field}" in app "${app}" is a formula field.`);
      formulaFields.push({ app, field });
    }
  }
}

if (formulaFields.length > 0) {
  formulaFields.unshift({ app: 'App', field: 'Field' });
  fs.writeFileSync(
    'formula_fields.csv',
    formulaFields.map(({ app, field }) => `${app},${field}`).join('\r\n')
  );
}

console.log('Validation complete.');

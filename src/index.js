// import { SNS } from 'aws-sdk';
import fetch from 'node-fetch';
import { URL } from 'url';

const BASE_URL = 'https://www.apple.com/shop/retail/pickup-message';

/**
 * requests apple product availability for a given part number and location
 * @param {Object} event - the event object triggering this lambda
 * @param {Object} context - the context object of this lambda
 * @param {Function} callback - the lambda callback function
 * @returns {Object} the result of the callback function
 */
export default function handler(event, context, callback) {
  // log incoming event
  console.log('received event');
  console.log(JSON.stringify(event));

  // validate variables
  const { SNS_ARN: TopicArn } = process.env;
  if (!TopicArn)
    return callback(new Error('the SNS_TOPIC environment variable must be set'));
  const {
    cppart,
    partNumber,
    zipcode
  } = event;
  if (!partNumber)
    return callback(new Error('the event object is missing its partNumber property'));
  if (!zipcode)
    return callback(new Error('the event object is missing its zipcode property'));

  // construct url
  const url = new URL(BASE_URL);
  url.searchParams.set('location', zipcode);
  url.searchParams.set('parts.0', partNumber);
  if (cppart)
    url.searchParams.set('cppart', cppart);

  // make request
  return fetch(url.toString())
    .then(res => res.json())
    .then(json => {
      console.log(JSON.stringify(json));
      return callback(null, 'ok');
    })
    .catch(err => callback(err));
}
